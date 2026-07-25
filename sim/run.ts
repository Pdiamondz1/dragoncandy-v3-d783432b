// Harness entrypoint logic (no side effects on import — the CLI shell is cli.ts).
//
// Subcommands:
//   dry-run  — generate the cohort + plan the first tick against an EMPTY state, print it.
//              NO client, NO network, NO boot gate. Safe to run anywhere.
//   mint     — boot-gate, then mint N bots (fires handle_new_user → synthetic_users).
//   tick     — boot-gate, read the cohort, plan the day, run it as the bots (RLS-real).
//   purge    — boot-gate, call purge_synthetic_data(), print the residue report.
//
// Every subcommand EXCEPT dry-run calls assertRuntimeBootSafety first (test-Stripe keys +
// SYNTHETIC_BOTS_ENABLED === true, fail-closed). Output uses console.warn/error (no-console
// lint allows only those).

import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, botClient } from "./clients";
import { assertRuntimeBootSafety, readKillSwitch, type MinimalSupabaseClient } from "./env";
import { generateCohort, type Persona, type Role } from "./personas";
import { mintBot, readCohort, readSessionCapableBots, readActiveLoadCohort } from "./mint";
import { planSeed, generateActiveCohort, assertActiveNamespaceFree } from "./seed";
import { SessionPool } from "./session-pool";
import { planDay, runDay } from "./behavior/graph";
import { parseRamp, runLoad, type LoadFindingsArtifact, type RunLoadDeps, type LoadResult } from "./load/driver";
import { DAU_ACTIONS, DAU_READ_ACTIONS } from "./load/actions-mix";
import { executeAction, type ActionContext } from "./behavior/actions";
import type { BotRef, CohortState } from "./types";
import {
  runMarketplaceSeed,
  assertMarketplaceCohortCap,
  assertMarketplaceCohortFresh,
  type SeedSteps,
  type SeedOpts,
  type SeedReport,
  type SeededCampaign,
} from "./marketplace/seed";
import { MARKETPLACE_EMAIL_PREFIX } from "./marketplace/personas";
import { createDiscount, addOrgUnit, submitCgc, sendMessage, postDragonFeed } from "./marketplace/actions";
import { uploadAsset, loadSampleAsset } from "./marketplace/content";
import { makePicker, curatedBrief, DISCOUNT_KINDS, MESSAGE_SNIPPETS, CREATOR_BIOS } from "./marketplace/text";
import { locationAt } from "./marketplace/locations";
import { buildBusinessProfileFields, buildCreatorProfileFields, buildOrgUnitGeo } from "./marketplace/profile";

const COMMANDS = ["dry-run", "mint", "tick", "purge", "bulk-seed", "load", "marketplace-seed", "marketplace-purge"] as const;
type Command = (typeof COMMANDS)[number];

export interface Args {
  command: Command;
  n: number;
  cohort: string;
  seed: number;
  /** bulk-seed: cap on the session-capable ACTIVE cohort (the rest of `n` is the depth pool). */
  active: number;
  /** bulk-seed: creator fraction (0..1) for both the depth RPC and the active cohort. */
  creatorSplit: number;
  /** load: ramp spec — "start/max/factor" (e.g. 50/1500/2.5) or a comma list "50,200,500". */
  ramp: string;
  /** load: how long to hold each ramp step (ms). */
  holdMs: number;
  /** load: sim_load_snapshots run label for this ramp. */
  runLabel: string;
  /** load matrix: this runner's shard index (0-based). */
  shard: number;
  /** load matrix: total shard count S (1 = single-runner mode; the ramp knob is S). */
  shards: number;
  /** load matrix: fixed egress-safe concurrency C held per shard for the soak (0 = use --ramp). */
  concurrency: number;
  /** load matrix: soak hold duration in ms at fixed C (0 = a single wave). */
  soakMs: number;
  /** bulk-seed: also seed public-free content (campaigns + DragonShare posts + file_uploads) onto the cohort. */
  withContent: boolean;
  /** bulk-seed --with-content: cap on seeded campaigns (one per distinct synthetic business bot). */
  campaigns: number;
  /** bulk-seed --with-content: cap on seeded DragonShare posts (one per synthetic creator bot). */
  posts: number;
  /** marketplace-seed: number of business bots (persistent botmk cohort). */
  businesses: number;
  /** marketplace-seed: number of creator bots. */
  creators: number;
  /** marketplace-seed: also promote ~25–30% of businesses to multi-location orgs. */
  multiLocation: boolean;
  /** marketplace-seed: also create CGC promotions + anonymous submissions. */
  cgc: boolean;
}

const CREATOR_SPLIT = 0.65;
const RAMP_DEFAULT = "50/1500/2.5";
const HOLD_MS_DEFAULT = 15_000;
const RUN_LABEL_DEFAULT = "load";
const CAMPAIGNS_DEFAULT = 50;
const POSTS_DEFAULT = 200;
/** Minimum spacing between capture_sim_load_snapshot samples within a ramp step. */
const SAMPLE_EVERY_MS = 5_000;
/** Gitignored per-run QA artifact (mirrors sim/.session-pool.json's relative-path convention). */
const FINDINGS_PATH = "sim/.load-findings.json";
const EMPTY_STATE: CohortState = { bots: [], crews: [], campaigns: [], applications: [], collaborations: [] };

const floorFor = (n: number): number => Math.max(20, n);

/**
 * Boot-safety gate. Casts through `unknown` because matching the full SupabaseClient
 * against env.ts's structural MinimalSupabaseClient triggers a TS "excessively deep"
 * error — the real client satisfies the shape at runtime.
 */
function bootGate(svc: SupabaseClient): Promise<void> {
  return assertRuntimeBootSafety(svc as unknown as MinimalSupabaseClient);
}

function safeInt(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function safeFloat(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? parseFloat(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: the `residual_*` entries of a purge report that are non-zero (teardown must have none). */
export function nonZeroResiduals(report: Record<string, unknown>): [string, number][] {
  const out: [string, number][] = [];
  for (const [k, v] of Object.entries(report)) {
    if (k.startsWith("residual_") && typeof v === "number" && v > 0) out.push([k, v]);
  }
  return out;
}

export function parseArgs(argv: string[]): Args {
  const command = argv.find((a) => !a.startsWith("--"));
  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    throw new Error(
      `Usage: cli.ts <${COMMANDS.join("|")}> [--n 25] [--cohort phase1] [--seed 1] [--active 25] [--creator-split 0.65] [--ramp 50/1500/2.5] [--hold-ms 15000] [--run-label load] [--shard 0] [--shards 1] [--concurrency 200] [--soak-ms 1800000] [--with-content] [--campaigns 50] [--posts 200]`,
    );
  }
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  return {
    command: command as Command,
    n: safeInt(flag("n"), 25),
    cohort: flag("cohort") ?? "phase1",
    seed: safeInt(flag("seed"), 1),
    active: safeInt(flag("active"), 25),
    creatorSplit: safeFloat(flag("creator-split"), CREATOR_SPLIT),
    ramp: flag("ramp") ?? RAMP_DEFAULT,
    holdMs: safeInt(flag("hold-ms"), HOLD_MS_DEFAULT),
    runLabel: flag("run-label") ?? RUN_LABEL_DEFAULT,
    shard: safeInt(flag("shard"), 0),
    shards: safeInt(flag("shards"), 1),
    concurrency: safeInt(flag("concurrency"), 0),
    soakMs: safeInt(flag("soak-ms"), 0),
    // --with-content is a presence boolean (no value); --campaigns/--posts cap the seeded content.
    withContent: argv.includes("--with-content"),
    campaigns: safeInt(flag("campaigns"), CAMPAIGNS_DEFAULT),
    posts: safeInt(flag("posts"), POSTS_DEFAULT),
    businesses: safeInt(flag("businesses"), 100),
    creators: safeInt(flag("creators"), 300),
    multiLocation: argv.includes("--multi-location"),
    cgc: argv.includes("--cgc"),
  };
}

/** How makeBotFor obtains a bot's current access token — INJECTABLE (default = the real
 *  cross-tick SessionPool) so offline tests can drive token rotation with zero network. */
export type BotTokenGetter = (email: string, userId: string) => Promise<string>;

/**
 * Bot-client factory for one tick / load run. By default constructs a single cross-tick SessionPool
 * (loaded from disk ONCE here, not per bot) so runs REUSE/REFRESH each bot's session instead of
 * re-minting one per bot per tick — that re-mint (magiclink + verify, two rate-limited auth calls)
 * is what trips Supabase's per-IP 429 at frequency/scale.
 *
 * REFRESH-AWARE (soak-safe): the token-getter is consulted on EVERY call — the pool's `reuse` path is
 * a cheap in-memory no-network hit — and the cached bot client is REBUILT only when the token ROTATES
 * (a mid-soak refresh returns a new JWT). The old code cached the client for the whole run and never
 * re-consulted the pool after the first hit, so a hold longer than the ~1h token TTL kept the client
 * pinned to a frozen, expired JWT → every late request `401 JWT expired` (runbook §3), which the
 * driver then misclassifies as a breakage. Rebuilding on rotation is what makes a long soak survive.
 *
 * The `getToken` param is injectable for tests; production passes none and gets the real pool.
 *
 * Live session-reuse verification — a re-tick showing 0 fresh mints — is done at the FIRST live run,
 * per docs/runbooks/synthetic-load-tier-ramp.md (Task 8). Two `dry-run`s can't exercise it (no
 * network; `dry-run` never constructs a client).
 */
export function makeBotFor(
  bots: BotRef[],
  getToken?: BotTokenGetter,
): (userId: string) => Promise<SupabaseClient> {
  const resolveToken: BotTokenGetter =
    getToken ??
    (() => {
      const pool = new SessionPool("sim/.session-pool.json", {
        url: process.env.SIM_SUPABASE_URL ?? "",
        anonKey: process.env.SIM_SUPABASE_ANON_KEY ?? "",
        serviceKey: process.env.SIM_SUPABASE_SECRET_KEY ?? "",
      });
      pool.load();
      return (email, userId) => pool.getToken(email, userId, Date.now());
    })();
  const emailById = new Map(bots.map((b) => [b.userId, b.email]));
  const cache = new Map<string, { token: string; client: SupabaseClient }>();
  return async (userId: string): Promise<SupabaseClient> => {
    const email = emailById.get(userId);
    if (!email) throw new Error(`no session: ${userId} is not in the cohort`);
    const token = await resolveToken(email, userId);
    const hit = cache.get(userId);
    if (hit && hit.token === token) return hit.client; // still-fresh token → reuse client (no rebuild)
    const client = botClient(token); // token rotated (refresh/mint) → rebuild on the new JWT
    cache.set(userId, { token, client });
    return client;
  };
}

function cmdDryRun(args: Args): void {
  const cohort = generateCohort(args.n, { creators: CREATOR_SPLIT }, args.seed, args.cohort);
  const biz = cohort.filter((p) => p.role === "business_client").length;
  const creators = cohort.length - biz;
  const plan = planDay(EMPTY_STATE, floorFor(args.n));
  console.warn(`[dry-run] cohort '${args.cohort}' n=${cohort.length} (${biz} businesses / ${creators} creators, seed=${args.seed})`);
  console.warn(`[dry-run] first-tick plan on an empty state: ${plan.length} actions (${plan.map((a) => a.kind).join(", ") || "none"})`);
  for (const p of cohort.slice(0, 5)) console.warn(`  e.g. ${p.email} — ${p.personaKey} (${p.fullName})`);
  if (cohort.length > 5) console.warn(`  … and ${cohort.length - 5} more`);
}

async function cmdMint(args: Args): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const cohort = generateCohort(args.n, { creators: CREATOR_SPLIT }, args.seed, args.cohort);
  let ok = 0;
  for (const persona of cohort) {
    try {
      await mintBot(svc, persona);
      ok += 1;
    } catch (e) {
      console.error(`  ✗ mint ${persona.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.warn(`[mint] minted ${ok}/${cohort.length} bots (cohort='${args.cohort}')`);
  // A partial mint must NOT report green: the whole cohort is the contract, and a scheduled/smoke
  // run that quietly minted fewer bots (e.g. a deterministic email already exists, or a transient
  // Supabase error) would leave the harness exercising a smaller population than intended. Re-minting
  // requires a purge first (deterministic emails collide on re-run).
  if (ok < cohort.length) {
    throw new Error(`[mint] only ${ok}/${cohort.length} bots minted — cohort incomplete (purge before re-minting; see errors above)`);
  }
}

/** Minimal service-role seam for seedContent — just the `rpc` call. A structural interface (not the
 *  full SupabaseClient) so a test can inject a fake with zero network and TS never has to match the
 *  client's deep generic rpc signature (mirrors env.ts's MinimalSupabaseClient). */
export interface RpcCaller {
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * bulk-seed --with-content: layer public-free content (campaigns + DragonShare video posts +
 * file_uploads + avatars/geo) onto the already-seeded botla…/botseed_… cohort via the service-role
 * seed_synthetic_content RPC. A no-op returning null when the flag is off (no rpc call). Fail-loud on
 * an rpc error, mirroring the depth seed's incomplete-cohort contract — a half-seeded content set
 * must not report green. Teardown is purge_synthetic_load_cohort(), NEVER the live bot0## cohort.
 */
export async function seedContent(
  svc: RpcCaller,
  args: Pick<Args, "withContent" | "campaigns" | "posts" | "creatorSplit">,
): Promise<{ campaigns: number; posts: number } | null> {
  if (!args.withContent) return null;
  const { data, error } = await svc.rpc("seed_synthetic_content", {
    p_campaigns: args.campaigns,
    p_posts: args.posts,
    p_creator_split: args.creatorSplit,
  });
  if (error) throw new Error(`[bulk-seed] seed_synthetic_content failed: ${error.message}`);
  const res = (data ?? {}) as { campaigns?: number; posts?: number };
  return { campaigns: res.campaigns ?? 0, posts: res.posts ?? 0 };
}

/**
 * bulk-seed: stand up a large synthetic population in two lanes. planSeed splits `--n` into a DEPTH
 * pool (bulk-inserted by the service-role seed_synthetic_cohort RPC; never authenticates) and a
 * session-capable ACTIVE cohort (minted one-by-one via mintBot, capped at `--active`). The active
 * cohort uses a DISTINCT email namespace (botla<seed>_<i>) so it can never collide with the live
 * bot### daily cohort — pre-flighted before any write. Fail-loud on an incomplete seed or mint,
 * mirroring cmdMint's incomplete-cohort contract (bulk-seed is a one-shot: purge before re-seeding).
 * With `--with-content`, layers content (seedContent) onto the cohort after the depth+active seed.
 */
async function cmdBulkSeed(args: Args): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);

  const { depthCount, activeCount } = planSeed(args.n, args.active);
  const active = generateActiveCohort(activeCount, { creators: args.creatorSplit }, args.seed, args.cohort);

  // Pre-flight BEFORE any write: a present active namespace means a prior run was not purged.
  await assertActiveNamespaceFree(svc, active);

  // 1) DEPTH pool — one bulk service-role RPC call.
  let depthSeeded = 0;
  let depthSkipped = 0;
  if (depthCount > 0) {
    const { data, error } = await svc.rpc("seed_synthetic_cohort", {
      p_n: depthCount,
      p_cohort: args.cohort,
      p_creator_split: args.creatorSplit,
    });
    if (error) throw new Error(`[bulk-seed] seed_synthetic_cohort failed: ${error.message}`);
    const res = (data ?? {}) as { seeded?: number; skipped?: number };
    depthSeeded = res.seeded ?? 0;
    depthSkipped = res.skipped ?? 0;
    // Mirror cmdMint: an all-skipped (re-run) or partial seed is NOT green — the depth pool must be
    // freshly seeded in full. The RPC is idempotent, but bulk-seed is a one-shot; a pre-existing pool
    // means teardown was skipped. Purge before re-seeding.
    if (depthSeeded < depthCount) {
      throw new Error(
        `[bulk-seed] depth pool incomplete: RPC seeded ${depthSeeded}/${depthCount} (skipped ${depthSkipped}) — purge before re-seeding`,
      );
    }
  }

  // 2) ACTIVE cohort — session-capable, minted individually (distinct botla namespace).
  let activeMinted = 0;
  for (const persona of active) {
    try {
      await mintBot(svc, persona);
      activeMinted += 1;
    } catch (e) {
      console.error(`  ✗ active mint ${persona.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Same incomplete-cohort contract as cmdMint: a partial active mint must not report green. Fail
  // BEFORE seeding content so we never layer content onto a half-built cohort.
  if (activeMinted < active.length) {
    console.warn(
      `[bulk-seed] ${JSON.stringify({ depth_seeded: depthSeeded, depth_skipped: depthSkipped, active_minted: activeMinted })}`,
    );
    throw new Error(
      `[bulk-seed] only ${activeMinted}/${active.length} active bots minted — cohort incomplete (purge before re-minting; see errors above)`,
    );
  }

  // 3) Optional content layer (--with-content): public-free campaigns + DragonShare posts + uploads.
  const content = await seedContent(svc, args);

  console.warn(
    `[bulk-seed] ${JSON.stringify({ depth_seeded: depthSeeded, depth_skipped: depthSkipped, active_minted: activeMinted, ...(content ? { content } : {}) })}`,
  );
}

async function cmdTick(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const state = await readCohort(svc);
  // An empty cohort must fail, not report green: the scheduled workflow command IS `tick`, so a
  // forgotten/failed mint or a post-purge run would otherwise look healthy while exercising none of
  // the marketplace — masking exactly the breakage this harness exists to surface.
  if (state.bots.length === 0) {
    throw new Error("[tick] no synthetic cohort found — run `mint` first.");
  }
  const floor = floorFor(state.bots.length);
  const plan = planDay(state, floor);
  const ctx: ActionContext = { service: svc, botFor: makeBotFor(state.bots) };
  const report = await runDay(plan, ctx);
  console.warn(`[tick] ${report.succeeded}/${report.attempted} actions ok, ${report.failures.length} failed (cohort=${state.bots.length})`);
  for (const f of report.failures.slice(0, 20)) console.error(`  ✗ ${f.action.kind}: ${f.error}`);
  if (report.attempted < floor) {
    console.warn(`[tick] SHORTFALL: ${report.attempted} planned < floor ${floor} — cohort is quiescent (mint more bots or let crews post fresh campaigns).`);
  }
  // A CI/smoke run must NOT report green when a real marketplace write failed — that would mask
  // exactly the integration breakages this harness exists to surface. (Shortfall alone is fine.)
  if (report.failures.length > 0) {
    throw new Error(`[tick] ${report.failures.length} action(s) failed — see errors above`);
  }
}

async function cmdPurge(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const { data, error } = await svc.rpc("purge_synthetic_data");
  if (error) throw new Error(`purge failed: ${error.message}`);
  console.warn(`[purge] ${JSON.stringify(data)}`);
  // Teardown must be PROVABLE: a report that returns but leaves any residual is a failed teardown,
  // not a success — surface it so a run can never report green with synthetic rows still on prod.
  const residuals = nonZeroResiduals((data ?? {}) as Record<string, unknown>);
  if (residuals.length > 0) {
    throw new Error(`[purge] non-zero residuals after teardown: ${residuals.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
}

/** The resolved load configuration: matrix soak (fixed C held for soakMs) vs the single-runner ramp. */
export interface LoadPlan {
  matrix: boolean;
  ramp: number[];
  holdMs: number;
}

/**
 * Decide the ramp shape from the flags. `--shards > 1` = MATRIX soak: a single fixed-concurrency step
 * (C, floored at 1 so a mis-passed 0 never becomes a degenerate no-op ramp) held for `--soak-ms`.
 * Otherwise the single-runner CEILING ramp: parseRamp(--ramp) held --hold-ms per step (byte-unchanged).
 */
export function planLoad(args: Args): LoadPlan {
  if (args.shards > 1) {
    return { matrix: true, ramp: [Math.max(1, args.concurrency)], holdMs: args.soakMs };
  }
  return { matrix: false, ramp: parseRamp(args.ramp), holdMs: args.holdMs };
}

/**
 * cmdLoad's injectable seams — every one defaults to the real implementation (DEFAULT_CMD_LOAD_DEPS),
 * so production callers pass nothing. Tests inject fakes to exercise the matrix branch with no live DB
 * (mirrors the SessionPool / makeBotFor / runLoad injection style already used across sim/).
 */
export interface CmdLoadDeps {
  serviceClient: () => SupabaseClient;
  bootGate: (svc: SupabaseClient) => Promise<void>;
  readActiveLoadCohort: (svc: SupabaseClient, shard: number, shards: number) => Promise<BotRef[]>;
  readSessionCapableBots: (svc: SupabaseClient) => Promise<BotRef[]>;
  makeBotFor: (bots: BotRef[], getToken?: BotTokenGetter) => (userId: string) => Promise<SupabaseClient>;
  runLoad: (deps: RunLoadDeps) => Promise<LoadResult>;
  readKillSwitch: (client: MinimalSupabaseClient) => Promise<boolean | null>;
}

const DEFAULT_CMD_LOAD_DEPS: CmdLoadDeps = {
  serviceClient,
  bootGate,
  readActiveLoadCohort,
  readSessionCapableBots,
  makeBotFor,
  runLoad,
  readKillSwitch,
};

/**
 * load: drive concurrent, ramped, read-heavy hot-endpoint load to the saturation KNEE (not an
 * outage), sampling capture_sim_load_snapshot per step and COLLECTING every breakage across the run
 * (the QA deliverable) into sim/.load-findings.json. Reuses the cross-tick session pool; pre-warms
 * every bot's token SERIALLY before the burst so the high-concurrency phase only reuses fresh
 * in-memory tokens and never trips the pool's per-bot refresh race. Sets a non-zero exit code iff a
 * breakage occurred — but only AFTER the findings are collected + written (never aborts on the first).
 *
 * MATRIX/SOAK mode (`--shards > 1`): drive THIS shard's disjoint botla… slice (readActiveLoadCohort)
 * at a fixed concurrency C held for the soak, with a periodic SYNTHETIC_BOTS_ENABLED re-check that
 * drains the ramp within a cycle, and every snapshot stamped with this shard's index (the matrix
 * summary RPC groups on notes.shard). Single-runner mode (`--shards <= 1`) is byte-unchanged.
 */
export async function cmdLoad(args: Args, deps: CmdLoadDeps = DEFAULT_CMD_LOAD_DEPS): Promise<void> {
  const svc = deps.serviceClient();
  await deps.bootGate(svc);
  const plan = planLoad(args);

  // Cohort: matrix mode drives this shard's disjoint botla… slice from its own IP; single-runner mode
  // drives the live bot0## + botla… session-capable cohort. Both exclude the depth pool (botseed_*) at
  // the DB, so a large depth pool never blows an oversized .in() nor gets a per-user session minted.
  const activeBots = plan.matrix
    ? await deps.readActiveLoadCohort(svc, args.shard, args.shards)
    : await deps.readSessionCapableBots(svc);
  // An empty cohort must fail loud, not silently apply zero load (mirrors cmdTick's contract).
  if (activeBots.length === 0) {
    throw new Error(
      plan.matrix
        ? `[load] no active (botla…) cohort for shard ${args.shard}/${args.shards} — run \`bulk-seed --with-content --active ${25 * args.shards}\` first.`
        : "[load] no session-capable synthetic cohort found (the depth pool never authenticates) — run `mint` or `bulk-seed --active N` first.",
    );
  }
  const botFor = deps.makeBotFor(activeBots);

  // Pre-warm the pool SERIALLY (25 mints/shard from this IP → 429-safe): tokens last ~1h so every task
  // in the burst reuses an already-fresh in-memory token; makeBotFor rebuilds the client if a token
  // rotates mid-soak. A mint failure here fails loud BEFORE any load.
  for (const b of activeBots) {
    await botFor(b.userId);
  }

  const captureSnapshot = async (
    runLabel: string,
    errorRate: number,
    notes: Record<string, unknown>,
  ): Promise<void> => {
    // Matrix mode stamps this shard's index so get_sim_load_matrix_summary can group per shard.
    const stamped = plan.matrix ? { ...notes, shard: args.shard } : notes;
    const { error } = await svc.rpc("capture_sim_load_snapshot", {
      p_run_label: runLabel,
      p_error_rate: errorRate,
      p_notes: stamped,
    });
    // A snapshot is observability, not the load itself — a failed sample must not abort the ramp.
    if (error) console.warn(`[load] snapshot failed: ${error.message}`);
  };

  const writeFindings = async (artifact: LoadFindingsArtifact): Promise<void> => {
    writeFileSync(FINDINGS_PATH, JSON.stringify(artifact, null, 2), "utf8");
  };

  // Matrix mode re-checks the master kill switch each snapshot cycle so flipping it OFF drains every
  // shard within a cycle (no `gh run cancel`). Single-runner mode keeps the boot-only gate (undefined).
  const isEnabled = plan.matrix
    ? () => deps.readKillSwitch(svc as unknown as MinimalSupabaseClient).then(Boolean)
    : undefined;

  console.warn(
    `[load] ${plan.matrix ? `matrix shard=${args.shard}/${args.shards} ` : ""}ramp=[${plan.ramp.join(", ")}] hold=${plan.holdMs}ms label='${args.runLabel}' cohort=${activeBots.length}`,
  );
  const result = await deps.runLoad({
    rampSteps: plan.ramp,
    holdMs: plan.holdMs,
    sampleEveryMs: SAMPLE_EVERY_MS,
    runLabel: args.runLabel,
    botFor,
    activeUserIds: activeBots.map((b) => b.userId),
    captureSnapshot,
    writeFindings,
    isEnabled,
    // Matrix drives the ISOLATED botla… slice (teardown-cleaned) → the full mix incl. the ~10% write
    // leg. Single-runner drives the LIVE bot0## cohort → READS ONLY: the scoped teardown spares
    // bot0##, so writes there would leak persistent residue. (Reads are the ceiling signal anyway.)
    actions: plan.matrix ? DAU_ACTIONS : DAU_READ_ACTIONS,
  });

  for (const s of result.steps) {
    const m = s.metrics;
    console.warn(
      `[load] c=${s.concurrency} n=${m.count} ok=${m.ok} throttle=${m.throttled} breakage=${m.breakage} err=${(m.errorRate * 100).toFixed(1)}% p50=${m.p50Ms}ms p95=${m.p95Ms}ms${s.knee ? " ← KNEE" : ""}`,
    );
  }
  if (result.stoppedAtKnee) {
    console.warn(`[load] stopped at saturation knee (concurrency=${result.kneeConcurrency}) — knee, not outage.`);
  }
  if (result.stoppedByKillSwitch) {
    console.warn(`[load] drained by the SYNTHETIC_BOTS_ENABLED kill switch mid-soak (graceful stop).`);
  }
  console.warn(
    `[load] findings: ${result.breakageCount} breakage event(s) across ${result.breakages.length} signature(s) → ${FINDINGS_PATH}`,
  );
  for (const b of result.breakages.slice(0, 20)) {
    console.error(`  ✗ ${b.endpoint} [${b.status ?? "?"}] ${b.error} (x${b.count}, first@c=${b.firstSeenConcurrency})`);
  }
  // Collect-all, THEN fail: the artifact + snapshots are already written, so CI still goes red on a
  // breakage without losing the batch. NOT a throw — the deliverables are done; a throw would read as
  // an aborted run and skip the "wrote findings" summary above.
  if (result.breakageCount > 0) {
    process.exitCode = 1;
  }
}

const SYNTHETIC_DOMAIN = "@synthetic.dragoncandy.test";
/** `botmk_%@synthetic.dragoncandy.test` — the LIKE pattern for the persistent marketplace cohort. */
const BOTMK_EMAIL_LIKE = `${MARKETPLACE_EMAIL_PREFIX}%${SYNTHETIC_DOMAIN}`;
/**
 * The prod trigger `enforce_active_campaign_limit` fires on the transition into
 * `status='published'` and reads `organizations.active_campaign_limit` (DEFAULT 1) via
 * `profiles.org_id`, counting existing published/active PUBLIC campaigns for that user_id.
 * publishCampaigns publishes 1–3 public campaigns per synthetic business, so the default limit
 * of 1 aborts the run on the 2nd. Raised well above the seed's per-business ceiling.
 */
const MARKETPLACE_ORG_CAMPAIGN_LIMIT = 25;

function requireEnvVar(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** A plain anon-key client with NO bot session — models an anonymous customer (CGC submissions come
 *  from the public /promo/:id page, never a logged-in bot). Mirrors clients.ts's NO_SESSION pattern. */
function anonClient(): SupabaseClient {
  return createClient(requireEnvVar("SIM_SUPABASE_URL"), requireEnvVar("SIM_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * The real-write SeedSteps implementation for `marketplace-seed` — LIVE integration glue wiring the
 * pure sequencer (runMarketplaceSeed, Task 7) to Supabase. Convention note: this is thin glue exercised
 * by the boot-gated prod run, exactly like the existing serviceClient()/mintBot wiring inside
 * cmdBulkSeed/cmdLoad — the codebase does NOT unit-test this layer (see the Task 8 brief). Every step
 * shares ONE bot-client factory (`botFor`, built off the full botmk cohort once readCohortRefs has read
 * it) and the sequencer is serial by contract, so no 429 burst.
 */
function buildDefaultSeedSteps(svc: SupabaseClient, opts: SeedOpts): SeedSteps {
  const picker = makePicker(opts.seed);
  let botFor: (userId: string) => Promise<SupabaseClient> = () => {
    throw new Error("marketplace-seed: botFor used before readCohortRefs populated the cohort");
  };
  // Threaded from runCollaborations → seedMessaging: the (campaign, biz, creator) pairs that actually
  // collaborated, so messaging targets real matched pairs. Safe because runMarketplaceSeed always calls
  // these two steps serially, in that exact order (Task 7's orchestrator).
  const collabPairs: { campaignId: string; bizId: string; creatorId: string }[] = [];

  const readExistingEmails = async (): Promise<Set<string>> => {
    const { data, error } = await svc.from("profiles").select("email").like("email", BOTMK_EMAIL_LIKE);
    if (error) throw new Error(`[marketplace-seed] readExistingEmails: ${error.message}`);
    return new Set((data ?? []).map((r) => (r as { email: string }).email));
  };

  const mintCohort = async (personas: Persona[]): Promise<BotRef[]> => {
    const refs: BotRef[] = [];
    for (const p of personas) refs.push(await mintBot(svc, p)); // serial — mint-429 never bites
    return refs;
  };

  const readCohortRefs = async (): Promise<{ businesses: BotRef[]; creators: BotRef[] }> => {
    const { data, error } = await svc.from("profiles").select("id, email, role").like("email", BOTMK_EMAIL_LIKE);
    if (error) throw new Error(`[marketplace-seed] readCohortRefs: ${error.message}`);
    const rows = (data ?? []) as { id: string; email: string; role: Role }[];
    const refs: BotRef[] = rows.map((r) => ({ userId: r.id, email: r.email, role: r.role, personaKey: null, cohort: null }));
    botFor = makeBotFor(refs); // ONE shared bot-client factory, reused by every downstream step
    return {
      businesses: refs.filter((r) => r.role === "business_client"),
      creators: refs.filter((r) => r.role === "content_creator"),
    };
  };

  /**
   * Task 12: fill out + geo-spread every profile across the 24-city US_LOCATIONS pool BEFORE any
   * other phase touches business_profiles/creator_profiles — own-row RLS-real updates via each
   * bot's own client, matching setupBusinesses's convention. Business i / creator j gets
   * locationAt(i)/locationAt(j) (wraps by modulo), and a business's PRIMARY org_unit gets the SAME
   * location's geo so a bot's address is consistent across both tables. Fail-loud on the
   * business_profiles/creator_profiles/org_units writes (a half-completed profile pass must not
   * report green) — EXCEPT the avatar/logo upload, which is best-effort: profile-assets' bot-upload
   * RLS is a prod-run-verify item (uid-prefixed path, mirrors uploadAsset's existing convention), so
   * a storage failure must never abort the whole seed over a cosmetic field.
   */
  const completeProfiles = async (businesses: BotRef[], creators: BotRef[]): Promise<number> => {
    let count = 0;
    for (let i = 0; i < businesses.length; i++) {
      const biz = businesses[i];
      const loc = locationAt(i);
      const bizClient = await botFor(biz.userId);

      const { error: bpErr } = await bizClient
        .from("business_profiles").update(buildBusinessProfileFields(picker, loc)).eq("user_id", biz.userId);
      if (bpErr) throw new Error(`[marketplace-seed] completeProfiles: business_profiles update failed for ${biz.email}: ${bpErr.message}`);

      const { data: profileRow, error: profErr } = await svc
        .from("profiles").select("org_id").eq("id", biz.userId).single();
      const orgId = (profileRow as { org_id: string | null } | null)?.org_id;
      if (profErr || !orgId) {
        throw new Error(`[marketplace-seed] completeProfiles: org_id lookup failed for ${biz.email}: ${profErr?.message ?? "no org_id"}`);
      }
      const { error: unitErr } = await bizClient
        .from("org_units").update(buildOrgUnitGeo(loc)).eq("org_id", orgId).eq("is_primary", true);
      if (unitErr) throw new Error(`[marketplace-seed] completeProfiles: org_units geo update failed for ${biz.email}: ${unitErr.message}`);

      try {
        const asset = loadSampleAsset(picker, "image");
        const url = await uploadAsset(bizClient, {
          bucket: "profile-assets", uid: biz.userId, subpath: `logo${asset.ext}`,
          bytes: asset.bytes, contentType: asset.contentType,
        });
        const { error: logoErr } = await bizClient.from("business_profiles").update({ logo_url: url }).eq("user_id", biz.userId);
        if (logoErr) throw new Error(logoErr.message);
      } catch (e) {
        console.warn(`[marketplace-seed] completeProfiles: logo upload skipped for ${biz.email}: ${e instanceof Error ? e.message : String(e)}`);
      }

      count += 1;
    }

    for (let j = 0; j < creators.length; j++) {
      const creator = creators[j];
      const loc = locationAt(j);
      const creatorClient = await botFor(creator.userId);

      const { error: cpErr } = await creatorClient
        .from("creator_profiles").update(buildCreatorProfileFields(picker, loc)).eq("user_id", creator.userId);
      if (cpErr) throw new Error(`[marketplace-seed] completeProfiles: creator_profiles update failed for ${creator.email}: ${cpErr.message}`);

      try {
        const asset = loadSampleAsset(picker, "image");
        const url = await uploadAsset(creatorClient, {
          bucket: "profile-assets", uid: creator.userId, subpath: `avatar${asset.ext}`,
          bytes: asset.bytes, contentType: asset.contentType,
        });
        const { error: avatarErr } = await creatorClient
          .from("creator_profiles").update({ avatar_url: url, portfolio_urls: [url] }).eq("user_id", creator.userId);
        if (avatarErr) throw new Error(avatarErr.message);
      } catch (e) {
        console.warn(`[marketplace-seed] completeProfiles: avatar upload skipped for ${creator.email}: ${e instanceof Error ? e.message : String(e)}`);
      }

      count += 1;
    }

    return count;
  };

  const setupBusinesses = async (businesses: BotRef[]): Promise<number> => {
    const today = new Date();
    const endDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
    let count = 0;
    for (const biz of businesses) {
      const bizClient = await botFor(biz.userId);
      const { data: bp, error: bpErr } = await svc
        .from("business_profiles").select("id").eq("user_id", biz.userId).single();
      if (bpErr || !bp) {
        throw new Error(`[marketplace-seed] setupBusinesses: business_profiles lookup failed for ${biz.email}: ${bpErr?.message ?? "no row"}`);
      }
      const businessId = (bp as { id: string }).id;

      // Provision the synthetic org's active-campaign limit BEFORE any campaign is published —
      // publishCampaigns runs after setupBusinesses completes for the whole cohort (see
      // runMarketplaceSeed). SERVICE-ROLE infra provisioning of a synthetic org (like the org
      // auto-creation itself), not a user-facing marketplace flow, so `svc` is correct here — see
      // MARKETPLACE_ORG_CAMPAIGN_LIMIT's comment on the enforce_active_campaign_limit trigger.
      const { data: profileRow, error: profErr } = await svc
        .from("profiles").select("org_id").eq("id", biz.userId).single();
      const orgId = (profileRow as { org_id: string | null } | null)?.org_id;
      if (profErr || !orgId) {
        throw new Error(`[marketplace-seed] setupBusinesses: org_id lookup failed for ${biz.email}: ${profErr?.message ?? "no org_id"}`);
      }
      const { error: limitErr } = await svc
        .from("organizations").update({ active_campaign_limit: MARKETPLACE_ORG_CAMPAIGN_LIMIT }).eq("id", orgId);
      if (limitErr) {
        throw new Error(`[marketplace-seed] setupBusinesses: active_campaign_limit update failed for ${biz.email}: ${limitErr.message}`);
      }

      const kind = picker.pick(DISCOUNT_KINDS);
      await createDiscount(bizClient, {
        userId: biz.userId,
        businessId,
        title: kind.title,
        discountType: kind.discount_type,
        discountValue: kind.discount_value,
        startDate: isoDate(today),
        endDate: isoDate(endDate),
      });
      // CGC posting prefs are the business's OWN row — write it through the business's own bot
      // client (RLS user_id=auth.uid), not svc, and only when --cgc is on (buildDefaultSeedSteps
      // now receives the full SeedOpts, so it can gate on opts.cgc directly). Whether any CGC
      // promotions/submissions actually get CREATED is separately gated by runMarketplaceSeed only
      // calling seedCgc when opts.cgc is true.
      if (opts.cgc) {
        const { error: cgcErr } = await bizClient
          .from("business_profiles").update({ cgc_posting_preferences: { enabled: true } }).eq("id", businessId);
        if (cgcErr) {
          throw new Error(`[marketplace-seed] setupBusinesses: cgc_posting_preferences update failed for ${biz.email}: ${cgcErr.message}`);
        }
      }
      count += 1;
    }
    return count;
  };

  const publishCampaigns = async (businesses: BotRef[]): Promise<SeededCampaign[]> => {
    const out: SeededCampaign[] = [];
    for (const biz of businesses) {
      const bizClient = await botFor(biz.userId);
      const campaignCount = picker.pick([1, 2, 3] as const); // publish MORE than we'll collaborate on
      for (let i = 0; i < campaignCount; i++) {
        const brief = curatedBrief(picker);
        const { data, error } = await bizClient
          .from("campaigns")
          .insert({
            user_id: biz.userId,
            title: brief.title,
            description: brief.description,
            status: "published",
            group_id: null,
            fixed_price: 0,
            org_unit_id: null,
          })
          .select("id")
          .single();
        if (error) throw new Error(`[marketplace-seed] publishCampaigns: ${error.message}`);
        const id = (data as { id: string } | null)?.id;
        if (!id) throw new Error("[marketplace-seed] publishCampaigns: campaigns insert returned no id");
        out.push({ campaignId: id, ownerId: biz.userId });
      }
    }
    return out;
  };

  const runCollaborations = async (campaigns: SeededCampaign[], creators: BotRef[]): Promise<number> => {
    if (creators.length === 0) return 0;
    const ctx: ActionContext = { service: svc, botFor };
    let count = 0;
    for (let i = 0; i < campaigns.length; i++) {
      if (i % 2 !== 0) continue; // collaborate on ~half the published campaigns; the rest stay open
      const campaign = campaigns[i];
      const creator = creators[i % creators.length];

      await executeAction({ kind: "applyToCampaign", creatorId: creator.userId, campaignId: campaign.campaignId }, ctx);
      const { data: appRow, error: appErr } = await svc
        .from("campaign_applications").select("id")
        .eq("campaign_id", campaign.campaignId).eq("creator_id", creator.userId).single();
      if (appErr || !appRow) {
        throw new Error(`[marketplace-seed] runCollaborations: application lookup failed: ${appErr?.message ?? "no row"}`);
      }
      const applicationId = (appRow as { id: string }).id;

      await executeAction({ kind: "hire", bizId: campaign.ownerId, applicationId }, ctx);
      const { data: collabRow, error: collabErr } = await svc
        .from("campaign_collaborations").select("id").eq("application_id", applicationId).single();
      if (collabErr || !collabRow) {
        throw new Error(`[marketplace-seed] runCollaborations: collaboration lookup failed: ${collabErr?.message ?? "no row"}`);
      }
      const collaborationId = (collabRow as { id: string }).id;

      // accept_application_with_collaboration only auto-activates CREW free campaigns, not public
      // ones — flip this public free campaign to in-progress ourselves (own-row RLS).
      const bizClient = await botFor(campaign.ownerId);
      const { error: activeErr } = await bizClient.from("campaigns").update({ status: "active" }).eq("id", campaign.campaignId);
      if (activeErr) throw new Error(`[marketplace-seed] runCollaborations: campaign activate failed: ${activeErr.message}`);

      await executeAction({ kind: "uploadDeliverable", creatorId: creator.userId, collaborationId, campaignId: campaign.campaignId }, ctx);
      await executeAction({ kind: "submitContent", creatorId: creator.userId, collaborationId, campaignId: campaign.campaignId }, ctx);
      await executeAction({ kind: "requestCompletion", actorId: campaign.ownerId, role: "business_client", collaborationId }, ctx);
      await executeAction({ kind: "requestCompletion", actorId: creator.userId, role: "content_creator", collaborationId }, ctx);

      const { error: completeErr } = await bizClient.from("campaigns").update({ status: "completed" }).eq("id", campaign.campaignId);
      if (completeErr) throw new Error(`[marketplace-seed] runCollaborations: campaign complete failed: ${completeErr.message}`);

      await executeAction({ kind: "leaveReview", actorId: campaign.ownerId, role: "business_client", collaborationId, revieweeId: creator.userId }, ctx);
      await executeAction({ kind: "leaveReview", actorId: creator.userId, role: "content_creator", collaborationId, revieweeId: campaign.ownerId }, ctx);

      collabPairs.push({ campaignId: campaign.campaignId, bizId: campaign.ownerId, creatorId: creator.userId });
      count += 1;
    }
    return count;
  };

  const seedMessaging = async (_campaigns: SeededCampaign[], _creators: BotRef[]): Promise<number> => {
    let count = 0;
    for (const pair of collabPairs) {
      const bizClient = await botFor(pair.bizId);
      await sendMessage(bizClient, {
        bizId: pair.bizId,
        creatorId: pair.creatorId,
        content: picker.pick(MESSAGE_SNIPPETS),
        campaignId: pair.campaignId,
      });
      count += 1;
    }
    return count;
  };

  const seedDragonFeed = async (creators: BotRef[], businesses: BotRef[]): Promise<number> => {
    if (businesses.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < creators.length; i++) {
      const creator = creators[i];
      const targetBiz = businesses[i % businesses.length];
      const { data: bizProfile, error: bizErr } = await svc
        .from("profiles").select("org_id").eq("id", targetBiz.userId).single();
      const targetOrgId = (bizProfile as { org_id: string | null } | null)?.org_id;
      if (bizErr || !targetOrgId) {
        throw new Error(`[marketplace-seed] seedDragonFeed: org_id lookup failed for ${targetBiz.email}: ${bizErr?.message ?? "no org_id"}`);
      }

      const creatorClient = await botFor(creator.userId);
      // No real .mp4s ship in sim/marketplace/assets/ yet — loadSampleAsset falls back to a generated
      // JPEG, so ask for "image" explicitly and label the post "photo" (never mislabel a photo
      // fallback as content_type "video").
      const asset = loadSampleAsset(picker, "image");
      const url = await uploadAsset(creatorClient, {
        bucket: "dragonshare-content",
        uid: creator.userId,
        subpath: `dragonfeed/${Date.now()}_${i}${asset.ext}`,
        bytes: asset.bytes,
        contentType: asset.contentType,
      });
      await postDragonFeed(creatorClient, {
        creatorId: creator.userId,
        targetOrgId,
        contentType: "photo",
        contentFilePath: url,
        caption: picker.pick(CREATOR_BIOS),
      });
      count += 1;
    }
    return count;
  };

  const promoteMultiLocation = async (businesses: BotRef[]): Promise<number> => {
    let count = 0;
    for (const biz of businesses) {
      if (picker.pick([true, false, false, false] as const) !== true) continue; // ~25% of businesses
      const { data: profile, error: profErr } = await svc.from("profiles").select("org_id").eq("id", biz.userId).single();
      const orgId = (profile as { org_id: string | null } | null)?.org_id;
      if (profErr || !orgId) {
        throw new Error(`[marketplace-seed] promoteMultiLocation: org_id lookup failed for ${biz.email}: ${profErr?.message ?? "no org_id"}`);
      }
      const bizClient = await botFor(biz.userId);
      const unitsToAdd = picker.pick([1, 2, 3] as const);
      for (let i = 0; i < unitsToAdd; i++) {
        await addOrgUnit(bizClient, {
          orgId,
          name: `${biz.email.split("@")[0]} — Location ${i + 2}`,
          lat: 40.7 + picker.pick([-0.02, -0.01, 0, 0.01, 0.02] as const),
          lng: -74.03 + picker.pick([-0.02, -0.01, 0, 0.01, 0.02] as const),
        });
        count += 1;
      }
    }
    return count;
  };

  const seedCgc = async (businesses: BotRef[]): Promise<number> => {
    const anon = anonClient();
    let count = 0;
    for (const biz of businesses) {
      const { data: promo, error: promoErr } = await svc
        .from("promotions").select("id")
        .eq("user_id", biz.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (promoErr) throw new Error(`[marketplace-seed] seedCgc: promotion lookup failed for ${biz.email}: ${promoErr.message}`);
      if (!promo) continue; // no promotion for this business — nothing to submit against
      const promotionId = (promo as { id: string }).id;
      const submissions = picker.pick([1, 2, 3] as const);
      for (let i = 0; i < submissions; i++) {
        const asset = loadSampleAsset(picker, "video");
        // promotion-videos RLS: anon/authenticated may upload only into a folder named after an
        // ACTIVE promotion (storage.foldername(name)[1] = promotions.id) — mirrors the real
        // anonymous /promo/:id CGC upload flow (no bot session involved, hence the anon client).
        const url = await uploadAsset(anon, {
          bucket: "promotion-videos",
          uid: promotionId,
          subpath: `cgc_${i}${asset.ext}`,
          bytes: asset.bytes,
          contentType: asset.contentType,
        });
        await submitCgc(anon, {
          promotionId,
          customerEmail: `synthetic-guest-${biz.userId.slice(0, 8)}-${i}@synthetic.dragoncandy.test`,
          videoUrl: url,
        });
        count += 1;
      }
    }
    return count;
  };

  return {
    readExistingEmails,
    mintCohort,
    readCohortRefs,
    completeProfiles,
    setupBusinesses,
    publishCampaigns,
    runCollaborations,
    seedMessaging,
    seedDragonFeed,
    promoteMultiLocation,
    seedCgc,
  };
}

export interface CmdMarketplaceSeedDeps {
  serviceClient: () => SupabaseClient;
  bootGate: (svc: SupabaseClient) => Promise<void>;
  /** One-shot pre-flight (Codex P2): refuses if a botmk_ cohort already exists on prod. */
  assertCohortFresh: (svc: SupabaseClient) => Promise<void>;
  buildSteps: (svc: SupabaseClient, opts: SeedOpts) => SeedSteps;
  runSeed: (steps: SeedSteps, opts: SeedOpts, log: (m: string) => void) => Promise<SeedReport>;
}

const DEFAULT_MP_DEPS: CmdMarketplaceSeedDeps = {
  serviceClient,
  bootGate,
  assertCohortFresh: assertMarketplaceCohortFresh,
  buildSteps: buildDefaultSeedSteps, // real-write glue (implemented above), per Task 7's note
  runSeed: runMarketplaceSeed,
};

/**
 * marketplace-seed: boot-gate, then run the idempotent serial populate. Fail-loud on an incomplete
 * mint (mirrors cmdBulkSeed). Teardown is `marketplace-purge` (botmk-scoped) — NEVER purge.
 *
 * Two prod-protecting guards (Codex P1+P2): the cohort CAP is checked first thing, before any
 * client/boot-gate work, so a fat-fingered `--businesses`/`--creators` fails before touching prod at
 * all; the one-shot FRESHNESS check runs after boot-gate but before buildSteps, so a re-run against an
 * already-seeded botmk_ cohort fails loud instead of duplicating campaigns/discounts/posts.
 */
export async function cmdMarketplaceSeed(args: Args, deps: CmdMarketplaceSeedDeps = DEFAULT_MP_DEPS): Promise<void> {
  assertMarketplaceCohortCap(args.businesses, args.creators);
  const svc = deps.serviceClient();
  await deps.bootGate(svc);
  await deps.assertCohortFresh(svc);
  const opts: SeedOpts = {
    businesses: args.businesses,
    creators: args.creators,
    seed: args.seed,
    multiLocation: args.multiLocation,
    cgc: args.cgc,
  };
  const steps = deps.buildSteps(svc, opts);
  const report = await deps.runSeed(steps, opts, (m) => console.warn(m));
  console.warn(`[marketplace-seed] ${JSON.stringify(report)}`);
}

/**
 * marketplace-purge: boot-gate, then call the botmk-scoped teardown RPC
 * (purge_synthetic_marketplace_cohort, 20260725120000). Spares the live bot0## daily cohort and the
 * botla…/botseed_… load cohorts — NEVER purge_synthetic_data() for a routine marketplace-seed reset.
 * Same fail-loud residual contract as cmdPurge: any non-zero residual_* is a failed teardown.
 */
export async function cmdMarketplacePurge(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const { data, error } = await svc.rpc("purge_synthetic_marketplace_cohort");
  if (error) throw new Error(`marketplace purge failed: ${error.message}`);
  console.warn(`[marketplace-purge] ${JSON.stringify(data)}`);
  const residuals = nonZeroResiduals((data ?? {}) as Record<string, unknown>);
  if (residuals.length > 0) {
    throw new Error(`[marketplace-purge] non-zero residuals: ${residuals.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "dry-run":
      cmdDryRun(args);
      return;
    case "mint":
      await cmdMint(args);
      return;
    case "bulk-seed":
      await cmdBulkSeed(args);
      return;
    case "tick":
      await cmdTick();
      return;
    case "purge":
      await cmdPurge();
      return;
    case "load":
      await cmdLoad(args);
      return;
    case "marketplace-seed":
      await cmdMarketplaceSeed(args);
      return;
    case "marketplace-purge":
      await cmdMarketplacePurge();
      return;
  }
}
