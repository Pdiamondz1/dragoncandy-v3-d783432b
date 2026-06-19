# AIOS Loop Automation — Knowledge-Sync Self-Heal + Loop Scout

**Status:** Design · **Date:** 2026-06-19 · **Author:** Claude (brainstorm with Dame)

## 1. Context & Motivation

A founder-supplied framework ("Audit Workspace and Rank Loop Candidates") proposes a
**4-Condition Test** for deciding which repeated work is worth turning into an autonomous
recurring agent loop:

1. **Does it repeat?**
2. **Can a rule decide when it's done?**
3. **Can you afford a few wasted runs?**
4. **Does the AI have the data and tools it needs?**

Run every repeated task through the test, rank, build the strongest first.

Applied to DragonCandy, an audit found the AIOS already runs most obvious loops (weekly
operating brief, daily bug sweep, daily knowledge-freshness **detector**, plus pg_cron jobs
for platform-weight, content-performance, analytics purge, promotion expiry). Two candidates
scored highest among the *open* ones, and this spec covers both, **sequenced**:

- **Loop 1 — Knowledge-sync self-heal (4/4 — build first).** The daily knowledge-freshness
  agent already *detects* when Donny's RAG store lags the (already-merged) wiki, but a human
  still has to run the sync. It is the one place where a backstop *detects* a problem that a
  human must then *fix*. Upgrading that detector into a self-healer for the safe case is
  near-zero new code, and all four conditions are green.
- **Loop 2 — Loop Scout.** Build the framework itself into the AIOS as a monthly,
  report-only routine that runs the 4-Condition Test over repeated work + telemetry and
  files ranked "loop candidate" findings on `/internal/findings`, so the platform keeps
  surfacing its own next loops instead of a human auditing by hand.

### Invariant preserved

*Donny never writes knowledge directly — a human merges first.* Loop 1 only **propagates
already-merged** wiki content into the RAG store (a human reviewed and merged the wiki PR);
it never authors the wiki. Both loops are otherwise report-only. The only non-report write is
Loop 1's single, idempotent sync, which goes through the existing audited `donny-knowledge-sync`
choke point.

## 2. Goals / Non-Goals

**Goals**
- Eliminate the manual step between "freshness agent detects RAG is stale" and "RAG is synced".
- Keep `/internal/findings` reserved for things that genuinely need a human.
- Stand up a recurring, self-auditing source of ranked loop candidates with no new schema/UI.

**Non-Goals**
- No change to what content gets synced or to the RAG curation policy (see §6 assumption).
- No auto-authoring of the wiki, no auto-merge of PRs, no auto-publish of briefs.
- No schema, RLS, UI, or edge-function changes (both loops ride existing infrastructure).
- Loop 2 does not *build* loops; it only proposes and ranks them.

## 3. Loop 1 — Knowledge-freshness agent: detector → detector + self-healer

### 3.1 Current behavior

`.claude/schedules/knowledge-freshness-agent.md` runs daily ~3am ET (cloud routine,
environment `Dame_git_claude`, `$AIOS_INGEST_SECRET` set). It computes two drift signals and
files ONE finding (`fingerprint: knowledge:layer:behind-main`) if either is true:

- **(a) wiki behind main** — ≥1 substantive `src/`/`supabase/` merge on `origin/main` newer
  than the last `docs/wiki/` commit (`LAST_WIKI`, all wiki dirs) by >24h. *A human must
  author a session source + ingest.*
- **(b) RAG behind wiki** — `donny_knowledge.updated_at` (`RAG_LAST`) older than the last
  commit to the **syncable** wiki dirs (`LAST_WIKI_SYNC` — see below) by >24h, **or**
  `RAG_LAST` is null (empty `donny_knowledge`, first-ever sync). *Pure mechanical
  propagation of merged content.*

> **Scope note (critical).** The sync script only touches `docs/wiki/{concepts,entities,
> analyses}/` (`sync-wiki-to-donny.mjs` line 27); `sources/`, `index.md`, `log.md`, and
> `raw/` are never synced. Case (b) and the self-heal success check below therefore key off
> **`LAST_WIKI_SYNC` = `git log -1 --format=%cI origin/main -- docs/wiki/concepts docs/wiki/entities docs/wiki/analyses`**,
> NOT the all-dirs `LAST_WIKI`. Using `LAST_WIKI` here would fire case (b) — and then fail
> the success assertion forever — every time a commit touched only `sources/`/`index.md`/
> `log.md` (which the per-session `knowledge-sync` does routinely). Case (a) keeps using the
> all-dirs `LAST_WIKI` (any wiki edit counts as "wiki was updated").

### 3.2 New behavior

Case (a) is unchanged (still flag — needs a human). Case (b) is **self-healed**:

1. Compute `LAST_WIKI`, `LAST_WIKI_SYNC`, `LAST_MAIN`, `RAG_LAST`, and the un-ingested merge
   list. `RAG_LAST` null (empty `donny_knowledge`) counts as case (b) applying.
2. If **(b)** applies, run the **existing documented remedy verbatim** in the checkout,
   **capturing exit code and stdout** (which reports `inserted`/`updated`/`errors`):
   ```
   DONNY_SYNC_URL=https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync \
   SUPABASE_SECRET_KEY=$AIOS_INGEST_SECRET \
   node supabase/scripts/sync-wiki-to-donny.mjs
   ```
   **The script's exit code is the authority on success** — it exits `0` on success
   *including a clean no-op* (nothing in-scope changed) and non-zero only when ≥1 batch
   errored (`if (errors > 0) process.exit(1)`, line 105). Do **not** gate success on a
   timestamp comparison: a correct sync can legitimately leave `RAG_LAST` short of
   `LAST_WIKI_SYNC` when in-scope content was unchanged. After the run, re-read `RAG_LAST`
   for the **run log only** (informational, never a pass/fail gate).
3. Outcome rules:
   - **Exit 0** → success. File **no** finding for (b). Report in the run log:
     `RAG auto-synced (+N inserted / ~M updated, 0 errors); RAG_LAST now <ts>`. (When
     `RAG_LAST` was null, additionally assert it is now non-null; if it is still null after
     an exit-0 run, treat as the failure path below — the table genuinely didn't populate.)
   - **Non-zero exit** (≥1 batch errored — total or partial) → file the existing
     `knowledge:layer:behind-main` finding, `severity: medium`, with the **captured `errors`
     count and the failing-batch message** in `summary_md` so a human can distinguish a
     partial sync (some pages landed) from a total failure → a human must intervene.
   - **(a) applies** (with or without (b)) → file the existing finding for the wiki-behind
     case exactly as today. Self-healing (b) never masks (a) — they are evaluated
     independently and (a) always reaches a human.

### 3.3 Guardrails (updated)

The agent's writes are now exactly **two**: (1) the findings POST to `aios-report-ingest`,
and (2) the blessed sync script — which writes the RAG store **only** through the
`donny-knowledge-sync` audited choke point (OpenAI embeddings, idempotent upsert keyed on
`metadata.source_id`). The agent still must NOT edit files, commit, push, open PRs, or write
the wiki. Re-running the sync when current is a safe no-op (idempotent upsert).

> **Intentional coupling — do not "fix".** The sync command passes
> `SUPABASE_SECRET_KEY=$AIOS_INGEST_SECRET`. This is correct: `$AIOS_INGEST_SECRET` holds the
> project's Supabase secret API key (`sb_secret_…`), which is exactly the key
> `sync-wiki-to-donny.mjs` expects, and is also accepted by the AIOS edge functions. One
> secret legitimately serves both roles; a future reader should not split them.

### 3.4 Files

- `.claude/schedules/knowledge-freshness-agent.md` — rewrite the header + prompt (steps 3–6)
  to document the detector + self-healer behavior and the two-write guardrail. **Only repo
  file changed by Loop 1.**
- `supabase/scripts/sync-wiki-to-donny.mjs` — **reused unchanged.** Already idempotent and
  already exits non-zero on error, which is exactly the success/fail signal step 2 needs.
- **Founder-run (post-merge):** update the live "knowledge-freshness" cloud routine prompt
  (claude.ai/code/routines) to match. The `.md` is documentation; the routine is
  authoritative. Same founder-run pattern as the donny-chat redeploy.

## 4. Loop 2 — Loop Scout (new monthly report-only routine)

A monthly cloud routine modeled on the bug-sweep agent (`.claude/schedules/bug-sweep-agent.md`)
— report-only, single write is the findings POST, same `$AIOS_INGEST_SECRET` auth contract.

### 4.1 What it audits (read-only)

- `git log` over the last ~90 days for recurring task / commit-category patterns (e.g.
  repeated verify-prod, manual wiki/RAG sync, manual expense entry, repeated fix classes).
- `.claude/schedules/` — the loops that **already exist**, so it never re-proposes one.
- Table / telemetry availability via PostgREST `HEAD` probes (does the data a candidate would
  need actually exist?) — this is condition 4 of the test, checked concretely, not assumed.

### 4.2 What it produces

For each candidate, score the 4-Condition Test, rank, and file the **top ~5** via
`aios-report-ingest` (`type: findings`):

- `source: "loop-scout"`.
- `fingerprint: "loop-candidate:<slug>"` — stable, so monthly re-runs occurrence-bump
  ("still a candidate after N months") rather than duplicate.
- `severity` encodes **build priority**: `high` = 4-of-4 pass / build-first, down to `low`.
- `title`: `[loop] <candidate name>` — the `[loop]` tag distinguishes it from bug findings
  in the shared `/internal/findings` list.
- `summary_md` (markdown bullets, no pipe tables): the four conditions scored + a one-line
  build recommendation.
- `evidence` (JSON): supporting signals — repeat count, data sources found, the
  existing-loop check result.
- Skip candidates already filed as `acknowledged` / `wontfix` unless the signal clearly
  changed (same discipline as bug-sweep).

### 4.3 Why no schema/UI change

`aios_findings` + `/internal/findings` + `aios-report-ingest` already accept this shape;
`source` is a free string field and the triage lifecycle (open → acknowledged → resolved/
wontfix), dedup, and occurrence-counting all apply for free.

### 4.4 Files

- `.claude/schedules/loop-scout-agent.md` — **new** doc with the cloud prompt.
- **Founder-run (post-merge):** create the live "loop-scout" cloud routine (monthly cron,
  environment `Dame_git_claude`, `$AIOS_INGEST_SECRET` set) via `/schedule`.

## 5. The 4-Condition Test applied (rationale for build order)

| Candidate | Repeats? | Rule judges done? | Afford wasted runs? | Has data+tools? | Verdict |
|---|---|---|---|---|---|
| **Loop 1 — knowledge-sync self-heal** | daily | sync script exit code (0 = done, incl. clean no-op) | idempotent upsert — re-sync is a no-op | script + edge fn + detector all exist | **4/4 — first** |
| **Loop 2 — Loop Scout** | monthly | report-only, done = filed | report-only | git log + telemetry + /internal | meta-loop |

## 6. Assumptions & Open Questions

- **Sync invocation is automated verbatim.** Loop 1 runs the exact command the freshness
  agent already documents as the manual remedy (no `SYNC_CURATE`, no `sync-internal-docs`).
  This changes *who* triggers the sync, not *what* is synced, so it introduces no new RAG-
  curation or internal-page-leak risk relative to today's manual remedy. If the team later
  blesses a different prod invocation (e.g. `SYNC_CURATE=1`), update the manual remedy and
  the auto-heal command in lockstep.
- **Embedding cost.** A self-heal run re-embeds in-scope wiki pages (metered against the 15%
  AI cap, same as the manual run). It only fires on detected drift (case b), so cost equals
  what a human would have spent running the remedy — no new steady-state cost.

## 7. Verification

**Loop 1** (in a cloud-equivalent checkout with `$AIOS_INGEST_SECRET`):
- Force case (b): confirm `RAG_LAST` < `LAST_WIKI_SYNC`; run the upgraded prompt → assert the
  sync ran and exited 0, and **no** `knowledge:layer:behind-main` finding was filed
  (GET `/aios_findings?fingerprint=eq.knowledge:layer:behind-main`).
- **No false failure on non-syncable commits:** with the latest wiki commit touching only
  `sources/`/`index.md`/`log.md` (so `LAST_WIKI` advanced but `LAST_WIKI_SYNC` did not),
  assert case (b) does **not** fire and **no** finding is filed.
- **Empty-table bootstrap:** with `donny_knowledge` empty (`RAG_LAST` null), assert case (b)
  fires, the sync runs, exits 0, `RAG_LAST` becomes non-null, and no finding is filed.
- Simulate sync failure (e.g. bad `DONNY_SYNC_URL` → non-zero exit) → assert the finding
  **is** filed with the `errors` count captured in `summary_md`.
- Confirm case (a) still files its finding when a substantive merge post-dates the wiki.
- Idempotency: a second run when current files nothing and reports "knowledge layer current".

**Loop 2**:
- Dry-run the prompt → assert ≤5 findings, each `source="loop-scout"`,
  `fingerprint="loop-candidate:<slug>"`, `[loop]`-titled, visible at `/internal/findings`,
  with the 4-Condition scoring in `summary_md`. Confirm it did **not** re-propose an existing
  loop from `.claude/schedules/`.
- Re-run → assert occurrences bump, no duplicate rows
  (GET `/aios_findings?source=eq.loop-scout`).

**Both:** Codex second-review pass clean; then run `knowledge-sync` to capture the session.

## 8. Build Order

1. This spec → `spec-document-reviewer` loop → user sign-off.
2. Loop 1: rewrite `knowledge-freshness-agent.md`; dry-run.
3. Loop 2: author `loop-scout-agent.md`; dry-run.
4. Codex second review; fix + re-run until clean.
5. PR. On merge: founder updates the live routines and runs `knowledge-sync`.
