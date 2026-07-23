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

import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient, botClient } from "./clients";
import { assertRuntimeBootSafety, type MinimalSupabaseClient } from "./env";
import { generateCohort } from "./personas";
import { mintBot, readCohort } from "./mint";
import { mintBotSession } from "./session";
import { planDay, runDay } from "./behavior/graph";
import type { ActionContext } from "./behavior/actions";
import type { BotRef, CohortState } from "./types";

const COMMANDS = ["dry-run", "mint", "tick", "purge"] as const;
type Command = (typeof COMMANDS)[number];

export interface Args {
  command: Command;
  n: number;
  cohort: string;
  seed: number;
}

const CREATOR_SPLIT = 0.65;
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

export function parseArgs(argv: string[]): Args {
  const command = argv.find((a) => !a.startsWith("--"));
  if (!command || !(COMMANDS as readonly string[]).includes(command)) {
    throw new Error(`Usage: cli.ts <${COMMANDS.join("|")}> [--n 25] [--cohort phase1] [--seed 1]`);
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
  };
}

/** Session pool: mints + caches one bot-scoped client per user id for the life of a tick. */
function makeBotFor(bots: BotRef[]): (userId: string) => Promise<SupabaseClient> {
  const url = process.env.SIM_SUPABASE_URL;
  const key = process.env.SIM_SUPABASE_SECRET_KEY ?? "";
  const emailById = new Map(bots.map((b) => [b.userId, b.email]));
  const cache = new Map<string, SupabaseClient>();
  return async (userId: string): Promise<SupabaseClient> => {
    const cached = cache.get(userId);
    if (cached) return cached;
    const email = emailById.get(userId);
    if (!email) throw new Error(`no session: ${userId} is not in the cohort`);
    const session = await mintBotSession(url, key, email);
    const client = botClient(session.access_token);
    cache.set(userId, client);
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
}

async function cmdTick(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const state = await readCohort(svc);
  if (state.bots.length === 0) {
    console.warn("[tick] no synthetic cohort found — run `mint` first.");
    return;
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
}

async function cmdPurge(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const { data, error } = await svc.rpc("purge_synthetic_data");
  if (error) throw new Error(`purge failed: ${error.message}`);
  console.warn(`[purge] ${JSON.stringify(data)}`);
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
    case "tick":
      await cmdTick();
      return;
    case "purge":
      await cmdPurge();
      return;
  }
}
