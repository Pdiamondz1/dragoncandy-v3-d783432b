// Concurrent ramped LOAD driver — the burst tool the funnel planner (behavior/graph.ts) is NOT.
//
// It reuses the cross-tick session pool (via an injected `botFor`) to fire a configurable
// CONCURRENCY of realistic, read-heavy hot-endpoint calls a real DAU makes, ramped in steps toward
// the *saturation knee* — clear, sustained latency/error degradation — and STOPS there. It never
// pushes to a true outage: `/internal` and the capture_sim_load_snapshot RPC must stay responsive
// enough to record the very samples that are the point of the run (knee, not wall).
//
// Two hard design stances, mirrored from the harness it extends:
//   • Pure/logic pieces (rampSteps, parseRamp, runPool, isKnee, foldBreakages, classifyError,
//     percentile) are unit-tested OFFLINE; the network parts (botFor / captureSnapshot /
//     writeFindings / now / rng) are INJECTED, so runLoad is exercised without a live DB.
//   • COLLECT-ALL, don't abort-on-first (this is the QA/bug-surfacing deliverable). Exactly like
//     behavior/graph.ts's runDay isolates each action's failure into `failures[]`, this isolates
//     every non-throttle error into a deduped breakage SIGNATURE and accumulates it across the WHOLE
//     run; only after the batch is collected + written does the caller set a non-zero exit code.
//
// Error classification: 429/503/throttle/connection-saturation = EXPECTED saturation (record the
// rate, keep going — it IS the signal we ramp to find). Anything else = a BREAKAGE (a bug to surface).
// This driver emits NO console output (it is a library); run.ts's cmdLoad does all the printing.

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Ramp step math (pure) ───────────────────────────────────────────────────────────────────────

/**
 * The ascending concurrency step list from `start` up to `max`, multiplying by `factor` each step,
 * with the final step capped exactly at `max` and no duplicates. e.g. rampSteps(50, 1500, 2.5) →
 * [50, 125, 312, 781, 1500]. A `factor <= 1` (which would loop forever / never grow) degrades to a
 * simple [start, max]. Inputs are floored to ints and start is clamped to ≥ 1.
 */
export function rampSteps(start: number, max: number, factor: number): number[] {
  const lo = Math.max(1, Math.floor(start));
  const hi = Math.max(lo, Math.floor(max));
  if (!(factor > 1)) return lo === hi ? [lo] : [lo, hi];
  const steps: number[] = [];
  let acc = lo;
  while (Math.floor(acc) < hi) {
    steps.push(Math.floor(acc));
    acc *= factor;
  }
  steps.push(hi);
  return [...new Set(steps)];
}

/**
 * Parse a `--ramp` flag into a concrete step list. Three forms:
 *   • "start/max/factor"  → geometric ramp via rampSteps (e.g. "50/1500/2.5").
 *   • "a,b,c,…"           → an explicit comma list (deduped, ascending).
 *   • "N"                 → a single-step ramp [N].
 * Falls back to a single [50] if nothing parses (never returns an empty ramp).
 */
export function parseRamp(raw: string): number[] {
  const trimmed = (raw ?? "").trim();
  // Malformed input FAILS LOUD rather than degrading to a trivial [50] one-step ramp — a silent
  // 1-step "load test" reads as a real ramp and masks an operator typo (e.g. a 2-part "50/1500").
  if (trimmed.includes(",")) {
    // Any INVALID token fails loud — a typo like "50,150O" must NOT silently drop to a lower-concurrency
    // run that reads as a successful load test. (Empty tokens from a trailing/double comma are tolerated.)
    const tokens = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const nums = tokens.map((s) => Math.floor(Number(s)));
    if (tokens.length === 0 || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      throw new Error(`[load] malformed --ramp "${raw}": comma list must be positive integers`);
    }
    return [...new Set(nums)].sort((a, b) => a - b);
  }
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((s) => Number(s.trim()));
    const [start, max, factor] = parts;
    // factor MUST be > 1: rampSteps degrades a factor of 0/1/≤1 to a silent two-step [start, max],
    // which is exactly the fake-ramp-from-a-typo this fail-loud path exists to prevent.
    if (
      parts.length !== 3 ||
      ![start, max, factor].every((n) => Number.isFinite(n)) ||
      start < 1 ||
      max < start ||
      factor <= 1
    ) {
      throw new Error(
        `[load] malformed --ramp "${raw}": expected start/max/factor with start≥1, max≥start, factor>1 (e.g. 50/1500/2.5)`,
      );
    }
    return rampSteps(start, max, factor);
  }
  const one = Math.floor(Number(trimmed));
  if (!Number.isFinite(one) || one <= 0) {
    throw new Error(
      `[load] malformed --ramp "${raw}": expected a positive integer, a comma list, or start/max/factor`,
    );
  }
  return [one];
}

// ── Bounded-concurrency runner (pure control-flow) ────────────────────────────────────────────────

/**
 * Run `total` tasks with AT MOST `concurrency` in flight at any instant (a fixed set of workers each
 * pulling the next index). Returns the per-index results in order. Never spawns more than
 * min(concurrency, total) concurrent worker() calls — the property the load test asserts via a live
 * in-flight counter. `total === 0` is a no-op ([]).
 */
export async function runPool<T>(
  concurrency: number,
  total: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const n = Math.max(0, Math.floor(total));
  const results: T[] = new Array(n);
  if (n === 0) return results;
  const workers = Math.min(Math.max(1, Math.floor(concurrency)), n);
  let next = 0;
  const runner = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= n) return;
      results[i] = await worker(i);
    }
  };
  await Promise.all(Array.from({ length: workers }, () => runner()));
  return results;
}

// ── Metrics + knee detection (pure) ───────────────────────────────────────────────────────────────

/** One ramp step's measured summary (what the snapshot notes + knee check read). */
export interface StepMetrics {
  concurrency: number;
  count: number;
  ok: number;
  throttled: number;
  breakage: number;
  /** Total non-success fraction (throttle + breakage) / count — the "error" side of the knee. */
  errorRate: number;
  throttleRate: number;
  breakageRate: number;
  p50Ms: number;
  p95Ms: number;
}

export interface KneeThresholds {
  /** Absolute total-error-rate ceiling — at/above this the step is the knee (e.g. 0.10). */
  maxErrorRate: number;
  /** p95 latency multiplier vs the previous step that counts as degradation (e.g. 2.0). */
  p95DegradeFactor: number;
  /** Latency floor (ms) so tiny-absolute noise (5ms→20ms) never false-triggers the p95 rule. */
  minP95Ms: number;
}

export const DEFAULT_KNEE_THRESHOLDS: KneeThresholds = {
  maxErrorRate: 0.1,
  p95DegradeFactor: 2,
  minP95Ms: 50,
};

/**
 * True when this step has crossed the saturation knee vs the previous one: EITHER the total error
 * rate is at/above the ceiling, OR (with a previous step to compare) the p95 latency degraded past
 * the factor while also clearing the absolute floor. The first step (no `prevStep`) can only trip on
 * error rate — there is nothing to compare latency against yet.
 */
export function isKnee(step: StepMetrics, prevStep: StepMetrics | null, t: KneeThresholds): boolean {
  if (step.errorRate >= t.maxErrorRate) return true;
  if (prevStep && prevStep.p95Ms > 0) {
    if (step.p95Ms >= t.minP95Ms && step.p95Ms >= prevStep.p95Ms * t.p95DegradeFactor) return true;
  }
  return false;
}

/** Nearest-rank percentile of an UNSORTED sample (0 for empty). p in [0,100]. */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

// ── Error classification (pure) ───────────────────────────────────────────────────────────────────

const THROTTLE_STATUSES = new Set([429, 503]);
// PG SQLSTATEs that mean "the DB is at capacity", not "your query is a bug" — the connection-ceiling
// saturation the ramp exists to find. `53300` = too_many_connections. (Kept deliberately narrow; the
// exact saturation-vs-breakage boundary is refined at the first live run — a misclassification simply
// shows up as a finding to review, which is the point.)
const THROTTLE_PG_CODES = new Set(["53300"]);
const THROTTLE_PATTERN =
  /rate.?limit|too many requests|\b429\b|\b503\b|service unavailable|temporarily unavailable|over capacity|too many connections|remaining connection slots|throttl/i;

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const m = (err as Record<string, unknown>).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

function toStatus(err: unknown): number | null {
  if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    for (const key of ["status", "statusCode", "httpStatus"]) {
      const v = o[key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
  }
  return null;
}

function toCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null) {
    const c = (err as Record<string, unknown>).code;
    if (typeof c === "string") return c;
    if (typeof c === "number") return String(c);
  }
  return null;
}

/**
 * Split an error into EXPECTED saturation (`throttle`) vs a `breakage` (a real bug to collect).
 * Throttle = HTTP 429/503, the connection-saturation SQLSTATE, or rate-limit/capacity wording.
 * Everything else — permission denials, constraint violations, unexpected 4xx/5xx — is a breakage.
 */
export function classifyError(err: unknown): { kind: "throttle" | "breakage"; status: number | null; message: string } {
  const message = toMessage(err);
  const status = toStatus(err);
  const code = toCode(err);
  const throttle =
    (status !== null && THROTTLE_STATUSES.has(status)) ||
    (code !== null && THROTTLE_PG_CODES.has(code)) ||
    THROTTLE_PATTERN.test(message);
  return { kind: throttle ? "throttle" : "breakage", status, message };
}

// ── Findings accumulation (pure) ──────────────────────────────────────────────────────────────────

/** One raw breakage occurrence, tagged with the concurrency it happened at. */
export interface BreakageEvent {
  endpoint: string;
  status: number | null;
  error: string;
  concurrency: number;
}

/** A deduped breakage signature — the QA artifact's core row. */
export interface BreakageSignature {
  endpoint: string;
  status: number | null;
  error: string;
  count: number;
  /** The LOWEST concurrency at which this signature was first observed. */
  firstSeenConcurrency: number;
}

function signatureKey(e: { endpoint: string; status: number | null; error: string }): string {
  return JSON.stringify([e.endpoint, e.status ?? "", e.error]);
}

/**
 * Fold many breakage events into deduped signatures, summing `count` and keeping the LOWEST
 * `firstSeenConcurrency` per signature. Optionally accumulates onto an existing `seed` set so the
 * driver can merge step-by-step across the whole run.
 */
export function foldBreakages(events: BreakageEvent[], seed: BreakageSignature[] = []): BreakageSignature[] {
  const byKey = new Map<string, BreakageSignature>();
  for (const s of seed) byKey.set(signatureKey(s), { ...s });
  for (const e of events) {
    const key = signatureKey(e);
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstSeenConcurrency = Math.min(existing.firstSeenConcurrency, e.concurrency);
    } else {
      byKey.set(key, {
        endpoint: e.endpoint,
        status: e.status,
        error: e.error,
        count: 1,
        firstSeenConcurrency: e.concurrency,
      });
    }
  }
  return [...byKey.values()];
}

// ── Hot actions (realistic read-heavy DAU endpoints) ──────────────────────────────────────────────

/** One hot endpoint a bot's RLS permits. `run` MUST throw on the query's `error` so the driver
 *  can classify + collect it (supabase-js returns `{ error }`, it does not throw). */
export interface HotAction {
  name: string;
  /** Relative selection weight (reads dominate ~90%). */
  weight: number;
  run: (client: SupabaseClient) => Promise<void>;
}

/** Throw the supabase query error (carrying its PG code) so the driver's classifier can read it. */
function throwOnError(error: { message: string; code?: string } | null): void {
  if (error) {
    const e = new Error(error.message) as Error & { code?: string };
    if (error.code) e.code = error.code;
    throw e;
  }
}

// Weighted ~90% read / ~10% sampled-write. v1 ships READS ONLY: a sampled write on prod must land on
// a table `purge_synthetic_data()` provably cleans up (teardown-to-zero is a spine contract), and the
// worker draws a random bot per task rather than acting as one identity — so the ~10% write leg is
// deliberately DEFERRED to the live phase (per the plan's "omit writes in v1 if unsure — reads are
// the bulk" and the ledger/purge-first discipline). Reads are the ceiling signal anyway.
//
// NOTE: the exact endpoints below are validated at the FIRST live run — an endpoint a bot's RLS does
// NOT actually permit surfaces as a *breakage finding* (e.g. a `permission denied`), which is exactly
// the point of the QA run, not a reason to guess silently.
export const HOT_ACTIONS: HotAction[] = [
  {
    // Campaign browse — the marketplace's primary read. RLS lets an authenticated user see published
    // PUBLIC campaigns (public path gated on group_id IS NULL); synthetic bots only READ real rows.
    name: "campaign_browse",
    weight: 30,
    run: async (client) => {
      const { error } = await client
        .from("campaigns")
        .select("id, title, status, created_at")
        .eq("status", "published")
        .is("group_id", null)
        .order("created_at", { ascending: false })
        .limit(20);
      throwOnError(error);
    },
  },
  {
    // DragonShare feed — verified posts are the anon/authenticated-readable public feed.
    name: "dragonshare_feed",
    weight: 25,
    run: async (client) => {
      const { error } = await client
        .from("dragonshare_posts")
        .select("id, content_file_path, platform, status, created_at")
        .eq("status", "verified")
        .order("created_at", { ascending: false })
        .limit(20);
      throwOnError(error);
    },
  },
  {
    // Creator directory — the public-facing view (no sensitive fields), safe for any reader.
    // NB: the view exposes creator_name (NOT full_name) and has no role column — selecting
    // full_name/role 400s and would log a FALSE breakage every run. Columns verified on prod.
    name: "creator_directory",
    weight: 20,
    run: async (client) => {
      const { error } = await client
        .from("public_creator_profiles")
        .select("id, creator_name, location, average_rating")
        .limit(20);
      throwOnError(error);
    },
  },
  {
    // Inbox list — RLS scopes conversations to the bot's own via conversation_participants; an empty
    // result for a bot with no threads is fine (still exercises the RLS-filtered read path).
    name: "conversations_list",
    weight: 15,
    run: async (client) => {
      const { error } = await client
        .from("conversations")
        .select("id, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);
      throwOnError(error);
    },
  },
  {
    // Dashboard RPC — a creator's "pending crew invites" widget; authenticated-only, gated on
    // creator_id = auth.uid() (returns [] for a business bot). A realistic per-load dashboard read.
    name: "pending_group_invitations_rpc",
    weight: 10,
    run: async (client) => {
      const { error } = await client.rpc("get_creator_pending_group_invitations");
      throwOnError(error);
    },
  },
];

// ── The driver ────────────────────────────────────────────────────────────────────────────────────

export interface StepResult {
  concurrency: number;
  metrics: StepMetrics;
  /** True if THIS step tripped the knee (the ramp stops after it). */
  knee: boolean;
}

export interface LoadResult {
  steps: StepResult[];
  breakages: BreakageSignature[];
  /** Total breakage EVENTS (not distinct signatures) — the caller sets exit 1 when > 0. */
  breakageCount: number;
  stoppedAtKnee: boolean;
  kneeConcurrency: number | null;
  /** True if an in-soak isEnabled() re-check drained the ramp (kill switch flipped mid-run). */
  stoppedByKillSwitch: boolean;
}

/** The on-disk QA artifact (`sim/.load-findings.json`): the per-step curve + breakage signatures. */
export interface LoadFindingsArtifact {
  runLabel: string;
  generatedAt: string;
  curve: StepResult[];
  breakages: BreakageSignature[];
  summary: {
    stepsRun: number;
    totalRequests: number;
    totalBreakages: number;
    stoppedAtKnee: boolean;
    kneeConcurrency: number | null;
  };
}

export interface RunLoadDeps {
  /** The ascending concurrency step list (built by parseRamp/rampSteps in the caller). */
  rampSteps: number[];
  /** How long to hold each step (ms) firing waves of `concurrency` tasks. 0 → exactly one wave. */
  holdMs: number;
  /** Minimum spacing (ms) between capture_sim_load_snapshot samples within a step (≥1 per step). */
  sampleEveryMs: number;
  runLabel: string;
  botFor: (userId: string) => Promise<SupabaseClient>;
  activeUserIds: string[];
  captureSnapshot: (runLabel: string, errorRate: number, notes: Record<string, unknown>) => Promise<void>;
  writeFindings: (artifact: LoadFindingsArtifact) => Promise<void>;
  /** Injectable — defaults to HOT_ACTIONS. */
  actions?: HotAction[];
  kneeThresholds?: KneeThresholds;
  /** Injectable clock/rng for deterministic offline tests. */
  now?: () => number;
  rng?: () => number;
  /** Periodic in-soak kill-switch re-check (matrix). Consulted at each snapshot sample; resolving
   *  false drains the ramp gracefully (findings still written, no throw). Default: always enabled,
   *  so single-runner mode — which never injects it — is byte-unchanged. */
  isEnabled?: () => Promise<boolean>;
}

interface TaskOutcome {
  ok: boolean;
  ms: number;
  endpoint: string;
  kind: "ok" | "throttle" | "breakage";
  status: number | null;
  error: string;
}

/** Weighted random pick over a non-empty action list (falls back to the first on a degenerate rng). */
function pickWeighted(actions: HotAction[], rng: () => number): HotAction {
  const total = actions.reduce((s, a) => s + Math.max(0, a.weight), 0);
  if (total <= 0) return actions[0];
  let r = rng() * total;
  for (const a of actions) {
    r -= Math.max(0, a.weight);
    if (r < 0) return a;
  }
  return actions[actions.length - 1];
}

/** Run ONE hot-endpoint call as a random active bot, isolating + classifying any error. */
async function runOneTask(
  deps: Required<Pick<RunLoadDeps, "botFor" | "activeUserIds">> & { actions: HotAction[]; rng: () => number; now: () => number },
): Promise<TaskOutcome> {
  const { activeUserIds, botFor, actions, rng, now } = deps;
  const userId = activeUserIds[Math.floor(rng() * activeUserIds.length)];
  const action = pickWeighted(actions, rng);
  const startedAt = now();
  try {
    const client = await botFor(userId);
    await action.run(client);
    return { ok: true, ms: now() - startedAt, endpoint: action.name, kind: "ok", status: null, error: "" };
  } catch (err) {
    const c = classifyError(err);
    return { ok: false, ms: now() - startedAt, endpoint: action.name, kind: c.kind, status: c.status, error: c.message };
  }
}

/**
 * Drive the ramp: for each concurrency step, fire waves of `concurrency` hot-endpoint tasks for
 * `holdMs`, sampling capture_sim_load_snapshot on the sampleEveryMs timer (≥1 per step); classify
 * saturation vs breakage; COLLECT every breakage across the run; stop at the knee. At the end, write
 * the findings artifact and return the result (the caller sets exit 1 iff any breakage occurred —
 * AFTER collecting + writing).
 */
export async function runLoad(deps: RunLoadDeps): Promise<LoadResult> {
  const { rampSteps: steps, holdMs, sampleEveryMs, runLabel, captureSnapshot, writeFindings } = deps;
  const actions = deps.actions ?? HOT_ACTIONS;
  const thresholds = deps.kneeThresholds ?? DEFAULT_KNEE_THRESHOLDS;
  const now = deps.now ?? Date.now;
  const rng = deps.rng ?? Math.random;
  const isEnabled = deps.isEnabled ?? (async () => true);

  const results: StepResult[] = [];
  const breakageEvents: BreakageEvent[] = [];
  let prevMetrics: StepMetrics | null = null;
  let stoppedAtKnee = false;
  let kneeConcurrency: number | null = null;
  let stoppedByKillSwitch = false;

  for (const concurrency of steps) {
    const latencies: number[] = [];
    let ok = 0;
    let throttled = 0;
    let breakage = 0;
    const stepStart = now();
    let lastSampleAt = -Infinity; // guarantees the first wave of each step samples once

    // Waves run back-to-back (no inter-wave sleep) for continuous load; this loop terminates ONLY
    // when the clock advances past holdMs. In prod each wave's real network latency advances Date.now;
    // offline tests MUST pass holdMs: 0 with a frozen injected `now` (→ exactly one wave). Never
    // inject a frozen clock with holdMs > 0 — the loop would spin forever.
    do {
      // Launch the wave WITHOUT awaiting, then take the DB snapshot CONCURRENTLY with it: the snapshot
      // RPC reads pg_stat_activity server-side while the wave's bot queries are actually in flight. A
      // snapshot taken after the wave drained would see only the snapshot's own connection, not the
      // requested concurrency — so active_connections/max_connections (the load curve's primary
      // saturation signal) would read artificially low and never find the DB ceiling. (Codex P1.)
      const wavePromise = runPool(concurrency, concurrency, (_index) =>
        runOneTask({ activeUserIds: deps.activeUserIds, botFor: deps.botFor, actions, rng, now }),
      );
      // Sample on the timer (and at least once per step, via lastSampleAt = -Infinity). The metric
      // notes reflect the waves completed SO FAR this step (empty on the first wave) — the authoritative
      // per-step metrics live in the returned curve; the snapshot's job is the in-flight connection read.
      const doSample = now() - lastSampleAt >= sampleEveryMs;
      const samplePromise = doSample
        ? (async () => {
            const seen = latencies.length;
            const rate = seen > 0 ? (throttled + breakage) / seen : 0;
            await captureSnapshot(runLabel, round4(rate), {
              concurrency,
              count: seen,
              ok,
              throttled,
              breakage,
              p50_ms: percentile(latencies, 50),
              p95_ms: percentile(latencies, 95),
            });
          })()
        : Promise.resolve();

      const [outcomes] = await Promise.all([wavePromise, samplePromise]);
      if (doSample) lastSampleAt = now();

      for (const o of outcomes) {
        latencies.push(o.ms);
        if (o.ok) ok += 1;
        else if (o.kind === "throttle") throttled += 1;
        else {
          breakage += 1;
          breakageEvents.push({ endpoint: o.endpoint, status: o.status, error: o.error, concurrency });
        }
      }
      // Periodic in-soak kill-switch re-check (matrix): gated to the snapshot sample so it costs at
      // most one extra read per sampleEveryMs. A flipped switch drains this shard's ramp within a
      // cycle — no `gh run cancel` needed. Single-runner mode never injects isEnabled → always true.
      if (doSample && !(await isEnabled())) {
        stoppedByKillSwitch = true;
        break;
      }
    } while (now() - stepStart < holdMs);

    const count = latencies.length;
    const metrics: StepMetrics = {
      concurrency,
      count,
      ok,
      throttled,
      breakage,
      errorRate: count > 0 ? round4((throttled + breakage) / count) : 0,
      throttleRate: count > 0 ? round4(throttled / count) : 0,
      breakageRate: count > 0 ? round4(breakage / count) : 0,
      p50Ms: percentile(latencies, 50),
      p95Ms: percentile(latencies, 95),
    };
    const knee = isKnee(metrics, prevMetrics, thresholds);
    results.push({ concurrency, metrics, knee });
    if (stoppedByKillSwitch) break; // drained by the kill switch — stop the ramp (findings still written)
    if (knee) {
      stoppedAtKnee = true;
      kneeConcurrency = concurrency;
      break; // knee, not outage: never ramp PAST the saturation point.
    }
    prevMetrics = metrics;
  }

  const breakages = foldBreakages(breakageEvents);
  const artifact: LoadFindingsArtifact = {
    runLabel,
    generatedAt: new Date(now()).toISOString(),
    curve: results,
    breakages,
    summary: {
      stepsRun: results.length,
      totalRequests: results.reduce((s, r) => s + r.metrics.count, 0),
      totalBreakages: breakageEvents.length,
      stoppedAtKnee,
      kneeConcurrency,
    },
  };
  await writeFindings(artifact);

  return {
    steps: results,
    breakages,
    breakageCount: breakageEvents.length,
    stoppedAtKnee,
    kneeConcurrency,
    stoppedByKillSwitch,
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
