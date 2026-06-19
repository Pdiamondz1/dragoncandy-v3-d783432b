# Session 2026-06-19 — AIOS automation loops (knowledge-sync self-heal + Loop Scout)

**Branch:** worktree-DC-AIOS-Donny2 → PR #130 (merged 2026-06-19).
**Spec:** `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md`.
**Trigger:** a user-uploaded screenshot, "Audit Workspace and Rank Loop Candidates," describing
a framework for identifying autonomous recurring-agent "loop candidates." Brainstormed →
spec'd → built two sequenced loops.

## The framework (from the screenshot) — the 4-Condition Test

To decide whether a piece of repeated work is worth turning into an autonomous recurring agent
loop, score each candidate on four conditions:

1. **Repeats?** — does it recur on a cadence (daily / weekly / monthly / per-event)?
2. **Rule judges done?** — can a deterministic rule decide when a run is complete/correct?
3. **Afford wasted runs?** — is the blast radius of a wrong/no-op run low (report-only,
   idempotent, reversible)?
4. **Has data + tools?** — do the data sources AND the tools/scripts it needs already exist?

A candidate passing all four cleanly is "build-first"; fewer passes → lower priority. The
audit also requires listing the loops that **already exist** so you never re-propose one.

## What shipped (two loops, sequenced)

Applying the framework to DragonCandy found the AIOS already runs most obvious loops (weekly
operating brief, daily bug sweep, daily knowledge-freshness **detector**, platform-weight /
content-performance / analytics-purge / promotion-expiry / Toast-token crons). The two best
*open* candidates were built:

### Loop 1 — Knowledge-freshness agent: detector → detector + self-healer (scored 4/4)

The daily ~3am ET `knowledge-freshness-agent` already computed two drift signals; it only
*flagged* both. Now it self-heals the one mechanical case and keeps flagging the human case.

- **Case (a) — wiki behind main:** ≥1 substantive `src/`/`supabase/` merge on `origin/main`
  newer than the last wiki commit by >24h. Needs a human to author + ingest a session source.
  **Still flagged** (files the `knowledge:layer:behind-main` finding) — unchanged.
- **Case (b) — RAG behind wiki:** `donny_knowledge` lags the *already-merged* wiki. Pure
  mechanical propagation. **New: self-heal** by running the blessed
  `supabase/scripts/sync-wiki-to-donny.mjs` in the checkout (writes RAG only through the
  audited `donny-knowledge-sync` choke point). On success → file NO finding; on non-zero
  exit → file the finding with the error so a human intervenes.

Two timestamps drive the cases (this was the bug fix from spec review, see below):
- `LAST_WIKI` = `git log -1 --format=%cI origin/main -- docs/wiki/` (ALL wiki dirs) → case (a).
- `LAST_WIKI_SYNC` = `git log -1 ... -- docs/wiki/concepts docs/wiki/entities docs/wiki/analyses`
  (ONLY the dirs the sync script reads) → case (b).

The agent's writes are now **exactly two**: the findings POST and the idempotent sync script.
It still must NOT edit files, commit, push, open PRs, or write the wiki. The invariant
*Donny never writes knowledge directly — a human merges first* holds: Loop 1 only propagates
**already-merged** (human-reviewed) wiki content into RAG; it never authors the wiki.

### Loop 2 — Loop Scout (new monthly report-only routine)

The screenshot's auditor, built **into** the AIOS as a monthly cloud routine (cron
`0 8 1 * *` ≈ 08:00 UTC on the 1st, env `Dame_git_claude`). Modeled on the bug-sweep agent;
its single write is the findings POST. It audits repeated work (`git log` 90d, handoffs,
sessions), reads `.claude/schedules/` + `supabase/migrations/` cron jobs so it never
re-proposes an existing loop, HEAD-probes PostgREST for data availability, runs the
4-Condition Test on each candidate, ranks them, and files the top ~5 as findings via
`aios-report-ingest`:
- `source: "loop-scout"`, `fingerprint: "loop-candidate:<slug>"` (stable → monthly re-runs
  bump occurrences = "still worth building after N months", never duplicate).
- `severity` = build priority (high = 4/4 pass, medium = 3, low = ≤2 / blocked).
- `title` = `"[loop] <name>"` (the `[loop]` tag distinguishes it from bug findings in the
  shared `/internal/findings` list).

No schema / UI / RLS / edge-function changes — `aios_findings` + `/internal/findings` +
`aios-report-ingest` already accept this shape (`source` is a free string).

## Key decisions

- **Both loops, sequenced** (not one). Loop 1 first (4/4), then Loop 2 (the framework itself).
- Loop 1 = **upgrade the existing freshness agent**, not a separate routine — almost no new code.
- Loop 2 = **reuse `aios_findings`** (no new schema/UI), **monthly** cadence.
- **Automate the existing documented remedy verbatim** — no `SYNC_CURATE` change. The self-heal
  changes *who triggers* the sync, not *what* is synced, so it adds zero new leak risk.
- The script's **EXIT CODE is the success authority** (exits 0 on clean no-op, non-zero only on
  ≥1 errored batch); the post-run `RAG_LAST` re-read is informational only.

## Gotchas / bugs caught (spec review)

- **False-failure generator (caught round 1).** The original success check compared `RAG_LAST`
  against ALL of `docs/wiki/`, but the sync only touches `concepts/entities/analyses`. A wiki
  commit touching only `sources/`/`index.md`/`log.md` (which `knowledge-sync` does routinely)
  would fail the assertion forever, filing a daily false "sync failed" finding. Fixed by making
  the exit code the authority and scoping case (b)'s trigger to `LAST_WIKI_SYNC`.
- **Null RAG_LAST / empty-table bootstrap.** Defined null `RAG_LAST` as triggering case (b);
  a post-exit-0 run that leaves it still-null is treated as the failure path.
- **Partial-batch failure.** Capture the script's `errors` count + failing-batch message in
  `summary_md` so a human distinguishes a partial sync from a total failure.

## Provenance / process

- Two `spec-document-reviewer` rounds (round 1 found 3 issues, round 2 Approved) — served as the
  independent second-model gate, justifying skipping Codex per the codex-review skill's
  pure-markdown (docs-only) exemption.
- The `spec-document-reviewer` *agent type* doesn't exist in this environment; dispatched a
  general-purpose agent told to invoke the `spec-document-reviewer` *skill* via the Skill tool.

## Files

- `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md` (NEW — the spec)
- `.claude/schedules/knowledge-freshness-agent.md` (MODIFIED — detector → detector + self-healer)
- `.claude/schedules/loop-scout-agent.md` (NEW — monthly Loop Scout)
- `CLAUDE.md` (MODIFIED — one line: freshness agent now "self-heals the mechanical RAG-sync case")
- `supabase/scripts/sync-wiki-to-donny.mjs` (REUSED unchanged — already idempotent)

## Founder-run post-merge steps (the `.md`s document; the live cloud routines are authoritative)

1. Update the live **knowledge-freshness** routine prompt (claude.ai/code/routines) to match.
2. Create the monthly **loop-scout** routine via `/schedule`.
3. Run the spec §7 verification asserts against prod (needs `$AIOS_INGEST_SECRET`).
