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
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, botClient } from "./clients";
import { assertRuntimeBootSafety, type MinimalSupabaseClient } from "./env";
import { generateCohort } from "./personas";
import { mintBot, readCohort, readSessionCapableBots } from "./mint";
import { planSeed, generateActiveCohort, assertActiveNamespaceFree } from "./seed";
import { SessionPool } from "./session-pool";
import { planDay, runDay } from "./behavior/graph";
import { parseRamp, runLoad, type LoadFindingsArtifact } from "./load/driver";
import type { ActionContext } from "./behavior/actions";
import type { BotRef, CohortState } from "./types";

const COMMANDS = ["dry-run", "mint", "tick", "purge", "bulk-seed", "load"] as const;
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
}

const CREATOR_SPLIT = 0.65;
const RAMP_DEFAULT = "50/1500/2.5";
const HOLD_MS_DEFAULT = 15_000;
const RUN_LABEL_DEFAULT = "load";
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
      `Usage: cli.ts <${COMMANDS.join("|")}> [--n 25] [--cohort phase1] [--seed 1] [--active 25] [--creator-split 0.65] [--ramp 50/1500/2.5] [--hold-ms 15000] [--run-label load] [--shard 0] [--shards 1] [--concurrency 200] [--soak-ms 1800000]`,
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

/**
 * bulk-seed: stand up a large synthetic population in two lanes. planSeed splits `--n` into a DEPTH
 * pool (bulk-inserted by the service-role seed_synthetic_cohort RPC; never authenticates) and a
 * session-capable ACTIVE cohort (minted one-by-one via mintBot, capped at `--active`). The active
 * cohort uses a DISTINCT email namespace (botla<seed>_<i>) so it can never collide with the live
 * bot### daily cohort — pre-flighted before any write. Fail-loud on an incomplete seed or mint,
 * mirroring cmdMint's incomplete-cohort contract (bulk-seed is a one-shot: purge before re-seeding).
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

  console.warn(
    `[bulk-seed] ${JSON.stringify({ depth_seeded: depthSeeded, depth_skipped: depthSkipped, active_minted: activeMinted })}`,
  );
  // Same incomplete-cohort contract as cmdMint: a partial active mint must not report green.
  if (activeMinted < active.length) {
    throw new Error(
      `[bulk-seed] only ${activeMinted}/${active.length} active bots minted — cohort incomplete (purge before re-minting; see errors above)`,
    );
  }
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

/**
 * load: drive concurrent, ramped, read-heavy hot-endpoint load to the saturation KNEE (not an
 * outage), sampling capture_sim_load_snapshot per step and COLLECTING every breakage across the run
 * (the QA deliverable) into sim/.load-findings.json. Reuses the cross-tick session pool; pre-warms
 * every bot's token SERIALLY before the burst so the high-concurrency phase only reuses fresh
 * in-memory tokens and never trips the pool's per-bot refresh race. Sets a non-zero exit code iff a
 * breakage occurred — but only AFTER the findings are collected + written (never aborts on the first).
 */
async function cmdLoad(args: Args): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  // Drive load ONLY through session-capable bots — the live daily cohort (bot0##) + the active load
  // cohort (botla…). readSessionCapableBots filters the depth pool (botseed_*) at the DB and skips the
  // heavy crew/campaign graph, so a large depth pool never blows an oversized .in() before load starts
  // nor gets a session minted per depth user (the exact per-IP 429 wall the session pool avoids). (Codex P1.)
  const activeBots = await readSessionCapableBots(svc);
  // An empty cohort must fail loud, not silently apply zero load (mirrors cmdTick's contract).
  if (activeBots.length === 0) {
    throw new Error(
      "[load] no session-capable synthetic cohort found (the depth pool never authenticates) — run `mint` or `bulk-seed --active N` first.",
    );
  }
  const botFor = makeBotFor(activeBots);

  // Pre-warm the pool SERIALLY: tokens last ~1h and a ramp holds minutes, so every task in the burst
  // reuses an already-fresh in-memory token — the high-concurrency phase never mints/refreshes (which
  // is what would race the rotated refresh token). A mint failure here fails loud BEFORE any load.
  for (const b of activeBots) {
    await botFor(b.userId);
  }

  const ramp = parseRamp(args.ramp);

  const captureSnapshot = async (
    runLabel: string,
    errorRate: number,
    notes: Record<string, unknown>,
  ): Promise<void> => {
    const { error } = await svc.rpc("capture_sim_load_snapshot", {
      p_run_label: runLabel,
      p_error_rate: errorRate,
      p_notes: notes,
    });
    // A snapshot is observability, not the load itself — a failed sample must not abort the ramp.
    if (error) console.warn(`[load] snapshot failed: ${error.message}`);
  };

  const writeFindings = async (artifact: LoadFindingsArtifact): Promise<void> => {
    writeFileSync(FINDINGS_PATH, JSON.stringify(artifact, null, 2), "utf8");
  };

  console.warn(
    `[load] ramp=[${ramp.join(", ")}] hold=${args.holdMs}ms label='${args.runLabel}' cohort=${activeBots.length}`,
  );
  const result = await runLoad({
    rampSteps: ramp,
    holdMs: args.holdMs,
    sampleEveryMs: SAMPLE_EVERY_MS,
    runLabel: args.runLabel,
    botFor,
    activeUserIds: activeBots.map((b) => b.userId),
    captureSnapshot,
    writeFindings,
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
  }
}
