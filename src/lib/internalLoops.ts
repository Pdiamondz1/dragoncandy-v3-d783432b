/**
 * Loop mission-control data model + pure health logic for `/internal/loops`.
 *
 * There is no central "loop runs" table in DragonCandy — each loop's activity is
 * inferred from the output it leaves (findings by `source`, playbook runs +
 * done-check verdicts, the weekly briefing). So a routine's timestamp here is
 * "last output", NOT a guaranteed "last run": every report-only routine files
 * nothing on a clean run. The health states below are deliberately honest about
 * that (`quiet` ≠ broken), and the page surfaces the caveat.
 *
 * All logic here is pure and unit-tested (internalLoops.test.ts); the hook
 * (useLoops.ts) only fetches and delegates to `composeLoops`.
 */

export interface DoneCheck {
  done?: boolean;
  checklist?: { criterion: string; met: boolean }[];
  missing?: string[];
}

/** A scheduled cloud routine (`.claude/schedules/*.md`) and where its output lands. */
export interface RoutineDef {
  key: string;
  name: string;
  cadenceLabel: string;
  /** Expected cadence in days, for the soft staleness hint. */
  cadenceDays: number;
  signal: { type: 'findings'; source: string } | { type: 'briefings' };
  /** Deep-link to where the output is triaged. */
  link: string;
  outputLabel: string;
  /** Structural caveat that's always true (not data-derived). */
  note?: string;
}

/**
 * The scheduled report-only routines, mirrored from `.claude/schedules/*.md`.
 * `source` strings are the exact values each routine POSTs to aios-report-ingest
 * (note strategy-library-audit files under `strategy-audit`).
 */
export const ROUTINES: RoutineDef[] = [
  {
    key: 'bug-sweep-agent',
    name: 'Bug & error sweep',
    cadenceLabel: 'Daily',
    cadenceDays: 1,
    signal: { type: 'findings', source: 'bug-sweep-agent' },
    link: '/internal/findings',
    outputLabel: 'last finding',
  },
  {
    key: 'knowledge-freshness-agent',
    name: 'Knowledge freshness self-heal',
    cadenceLabel: 'Daily',
    cadenceDays: 1,
    signal: { type: 'findings', source: 'knowledge-freshness-agent' },
    link: '/internal/findings',
    outputLabel: 'last finding',
    note: 'Self-heals the RAG silently and files a finding only when a human ingest is needed — so no recent output does not mean it did not run.',
  },
  {
    key: 'weekly-brief-agent',
    name: 'Weekly operating brief',
    cadenceLabel: 'Daily refresh',
    cadenceDays: 1,
    signal: { type: 'briefings' },
    link: '/internal/briefings',
    outputLabel: 'last brief',
  },
  {
    key: 'loop-scout-agent',
    name: 'Loop Scout',
    cadenceLabel: 'Monthly',
    cadenceDays: 30,
    signal: { type: 'findings', source: 'loop-scout' },
    link: '/internal/findings',
    outputLabel: 'last finding',
  },
  {
    key: 'strategy-library-audit-agent',
    name: 'Strategy-library audit',
    cadenceLabel: 'Monthly',
    cadenceDays: 30,
    signal: { type: 'findings', source: 'strategy-audit' },
    link: '/internal/findings',
    outputLabel: 'last finding',
  },
  {
    key: 'dezzy-press-events-agent',
    name: 'Dezzy — Press & events scout',
    cadenceLabel: 'Monthly',
    cadenceDays: 30,
    signal: { type: 'findings', source: 'dezzy-press-events' },
    link: '/internal/findings',
    outputLabel: 'last finding',
  },
];

/** Skill loops whose state lives in MEMORY.md / git — not the DB (informational). */
export const SKILL_LOOPS: { name: string; desc: string }[] = [
  { name: 'autoresearch', desc: 'Grows the wiki from detected research gaps' },
  { name: 'knowledge-sync', desc: "Writes the wiki + syncs Donny's RAG per session" },
  { name: 'verify-knowledge', desc: 'Validator — judges wiki / RAG / index freshness' },
  { name: 'wiki-ops', desc: 'Lint / ingest / query the knowledge wiki' },
];

export type RoutineHealth = 'ok' | 'quiet' | 'none';

export interface RoutineStatus {
  key: string;
  name: string;
  cadenceLabel: string;
  outputLabel: string;
  note?: string;
  link: string;
  lastOutputAt: string | null;
  health: RoutineHealth;
}

export type PlaybookHealth = 'ok' | 'attention' | 'error' | 'stale' | 'running' | 'never';

/**
 * A `running` playbook_run older than this is a dead run the runner hasn't reaped
 * yet (it inserts `running`, then a crash leaves the row). Mirrors the runner's
 * own STALE_RUN_MS (15 min, safely above the ~400s edge-fn wall-clock) so mission
 * control doesn't report a dead run as live.
 */
export const STALE_RUN_MS = 15 * 60 * 1000;

export interface PlaybookStatus {
  slug: string;
  title: string;
  archived: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  done: boolean | null;
  runCount: number;
  health: PlaybookHealth;
}

export interface LoopsData {
  routines: RoutineStatus[];
  playbooks: PlaybookStatus[];
  skillLoops: { name: string; desc: string }[];
}

const DAY_MS = 86_400_000;

/**
 * Soft staleness for a routine, from its last output vs. its cadence. Report-only
 * routines file nothing on a clean run, so this is advisory: `quiet` means "no
 * output in a while — may be running clean, or may be stopped", never "failed".
 */
export function routineHealth(
  cadenceDays: number,
  lastOutputAt: string | null,
  now: Date,
): RoutineHealth {
  if (!lastOutputAt) return 'none';
  const ageDays = (now.getTime() - new Date(lastOutputAt).getTime()) / DAY_MS;
  if (ageDays <= cadenceDays * 2) return 'ok';
  return 'quiet';
}

/**
 * Health of a playbook from its latest run's status + done-check verdict.
 * `runAgeMs` is the age of that run since it started — a `running` run past
 * STALE_RUN_MS is a dead/reaped run, not a live one.
 */
export function playbookHealth(
  lastRunStatus: string | null,
  done: boolean | null,
  runAgeMs: number | null,
): PlaybookHealth {
  if (!lastRunStatus) return 'never';
  if (lastRunStatus === 'running') {
    return runAgeMs != null && runAgeMs > STALE_RUN_MS ? 'stale' : 'running';
  }
  if (lastRunStatus === 'failed') return 'error';
  // completed — the done-check verdict decides ok vs. needs-attention.
  if (done === false) return 'attention';
  return 'ok';
}

/** Compact relative time ("3d ago", "5h ago", "just now"). Pure — `now` injected. */
export function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return 'never';
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export interface ComposeInput {
  /** Latest finding per source (the hook fetches one row per source, cap-safe). */
  findings: { source: string; created_at: string; last_seen_at: string | null }[];
  playbooks: { id: string; slug: string; title: string; status: string }[];
  /** Latest run per playbook (the hook fetches one row per playbook, cap-safe). */
  runs: {
    playbook_id: string;
    status: string;
    done_check: DoneCheck | null;
    started_at: string;
    finished_at: string | null;
  }[];
  /** Exact total run count per playbook id (from a head+count query, not row length). */
  runCountByPlaybook: Record<string, number>;
  latestBriefingAt: string | null;
}

/**
 * The newest output time among findings with a given source. Uses `last_seen_at`
 * (the ingest bumps it on every re-file of a fingerprint but leaves `created_at`
 * at the original insert), falling back to `created_at` — so a routine that keeps
 * re-filing the same fingerprint reads as active, not quiet.
 */
function latestFindingAt(findings: ComposeInput['findings'], source: string): string | null {
  let latest: string | null = null;
  for (const f of findings) {
    if (f.source !== source) continue;
    const t = f.last_seen_at ?? f.created_at;
    if (!latest || new Date(t).getTime() > new Date(latest).getTime()) {
      latest = t;
    }
  }
  return latest;
}

/** The newest run for a playbook by started_at. */
function latestRun(runs: ComposeInput['runs'], playbookId: string): ComposeInput['runs'][number] | null {
  let latest: ComposeInput['runs'][number] | null = null;
  for (const r of runs) {
    if (r.playbook_id !== playbookId) continue;
    if (!latest || new Date(r.started_at).getTime() > new Date(latest.started_at).getTime()) {
      latest = r;
    }
  }
  return latest;
}

/** Compose the full mission-control view from the raw query results. Pure. */
export function composeLoops(input: ComposeInput, now: Date): LoopsData {
  const routines: RoutineStatus[] = ROUTINES.map((def) => {
    const lastOutputAt =
      def.signal.type === 'briefings'
        ? input.latestBriefingAt
        : latestFindingAt(input.findings, def.signal.source);
    return {
      key: def.key,
      name: def.name,
      cadenceLabel: def.cadenceLabel,
      outputLabel: def.outputLabel,
      note: def.note,
      link: def.link,
      lastOutputAt,
      health: routineHealth(def.cadenceDays, lastOutputAt, now),
    };
  });

  const playbooks: PlaybookStatus[] = input.playbooks.map((p) => {
    const run = latestRun(input.runs, p.id);
    const runCount = input.runCountByPlaybook[p.id] ?? 0;
    const done = run?.done_check?.done ?? null;
    const runAgeMs = run ? now.getTime() - new Date(run.started_at).getTime() : null;
    return {
      slug: p.slug,
      title: p.title,
      archived: p.status === 'archived',
      lastRunAt: run ? run.finished_at ?? run.started_at : null,
      lastRunStatus: run?.status ?? null,
      done,
      runCount,
      health: playbookHealth(run?.status ?? null, done, runAgeMs),
    };
  });

  return { routines, playbooks, skillLoops: SKILL_LOOPS };
}
