---
title: Self-Improving App
type: concept
created: 2026-06-10
updated: 2026-06-20
sources: [autoresearch/program.md, autoresearch/README.md, docs/PROJECT_CONTEXT.md, docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md, 2026-06-18-wiki-commit-pr.md, 2026-06-18-donny-answer-to-wiki.md, 2026-06-18-aios-ingest-secret-rotation.md, 2026-06-19-aios-loop-automation.md, 2026-06-20-loop-scout-first-run-builds.md]
tags: [architecture, strategy, ai, moat, autoresearch, donny, automation]
---

# Self-Improving App

The long-term architecture goal: DragonCandy becomes a "smart app" that **self-improves** — it
researches its own knowledge gaps, eventually learns about bugs from real transactions/engagement,
and keeps its own strategy, KPIs, and milestones current. The engine for this is the **autoresearch
loop**, exposed as the `autoresearch` skill (`.claude/skills/autoresearch/SKILL.md`).

## Lineage — Karpathy's autoresearch, domain-swapped

The pattern is borrowed from Andrej Karpathy's `autoresearch` repo (vendored at `/autoresearch`).
That repo is **not** a research tool in the literature sense — it is an autonomous **ML-training
loop**: an agent edits `train.py`, trains a small GPT for a fixed 5 minutes on an NVIDIA H100,
measures `val_bpb`, keeps the change if the metric improved or reverts if it got worse, logs to
`results.tsv`, and loops until stopped. Its Python is useless to DragonCandy (no GPU, trains neural
nets). **What transfers is the loop**, which Karpathy frames as "essentially a super lightweight
skill":

> setup → LOOP { propose a change → execute → measure against a metric → keep if better, revert if
> worse → log → don't stop until interrupted }

We swap the domain. Instead of *"edit `train.py` to lower `val_bpb`,"* the loop is *"research a
knowledge gap → verify it → keep only if it passes an acceptance gate → ingest into the wiki → log
→ repeat."* The metric analog is the **acceptance gate**; the `results.tsv` analog is `log.md`.

## The acceptance gate (the metric)

A finding is **kept** only if it (1) fills a real gap not already covered, (2) is **verified** by ≥2
independent external sources or grounded in repo code/docs with file paths, and (3) is
non-contradictory — or the contradiction is **explicitly flagged**, never silently overwritten.
Otherwise it is **discarded** or **flagged**. This gate is what keeps an autonomous loop from
polluting the wiki, and it ties directly to the [[Data Flywheel]] discipline (capture is only
valuable if it's trustworthy).

## Three research domains

The loop covers all three, from both external web and internal repo/docs:

- **Technical / architecture** — mined from `src/`, `supabase/functions/`, `docs/`, `.claude/handoffs/`.
- **Competitive / market** — external web (rivals, market data, benchmarks).
- **Business / strategy / KPI** — internal strategy docs + external benchmarks, kept as living
  `analyses/` pages against the three-year targets and kill-switches in `PROJECT_CONTEXT.md`.

## Dual learners — wiki and Donny

Every verified finding has **two outputs from one loop**: the human-readable **wiki** (this layer)
and [[Donny AI]]'s machine-readable **RAG store** (`donny_knowledge`, embedded via the existing
OpenAI path). The verified wiki page is the source of truth; a gated sync turns it into a Donny
knowledge entry so Donny self-improves on the same heartbeat the wiki does. This is the mechanism by
which the [[Data Flywheel]] starts compounding before 1,000–5,000 campaigns accumulate — the loop
manufactures structured, verified knowledge in the interim.

### Correction write-back — keeping the source of truth honest

Because the wiki is the source of truth and the sync is one-directional (wiki → `internal_docs` →
`donny_knowledge`), an *in-app* fix to a strategy doc is fragile: approving a Donny **gated
correction** updates `internal_docs.content_md` immediately, but the next `donny-knowledge-sync`
reads the **stale** repo file and reverts it. The **wiki-commit-PR** capability (AIOS,
2026-06-18) closes that loop: a founder-clicked, admin-gated button on `/internal/corrections`
opens a **GitHub pull request** writing the corrected markdown back to its `docs/wiki/…` file via
the `wiki-commit-pr` edge function. It is the first human-gated git **write-back** into the wiki
the loop maintains — always a PR (never a push to `main`), so the durable source change still
passes the normal review/Codex gate. The function trusts only `{ correction_id }` and re-derives
path + content server-side (no client-forged writes); it is idempotent (one PR per correction,
self-healing on retry). One-time prerequisite: a fine-grained `GITHUB_WIKI_TOKEN` edge secret
(single repo, Contents + Pull Requests R/W). This is the doc-side sibling of the still-future
**Phase 4** (human-gated *code* fix PRs).

### Answer capture — turning a fresh Donny answer into a new wiki page

The correction write-back *fixes an existing* doc. The **Save-to-knowledge** capability (AIOS,
2026-06-18) handles the other direction: turning a **brand-new** internal Donny answer into a
**new** wiki page. A founder-clicked, admin-gated **Save to knowledge** button on each
`/internal/donny` answer opens a confirm dialog (title / folder `concepts|analyses` / filename /
tags, pre-filled from the answer) and opens a **GitHub PR** adding `docs/wiki/<folder>/<file>.md`
via the `wiki-save-answer` edge function; on merge, the normal `donny-knowledge-sync` folds it into
`donny_knowledge`. It is a deliberate **sibling** of `wiki-commit-pr`, not a reuse: a fresh answer
has no correction row to re-derive from, so the function accepts client field *values* under a
*stricter* guard (admin gate, 2-folder whitelist, kebab filename, server-built frontmatter,
question/title/tags sanitized for YAML-safety) — and **PR-only** review is the backstop that makes
accepting client content safe. The page records its provenance (the originating founder question is
quoted above the answer). This preserves the core invariant — **Donny never writes knowledge
directly; a human merges first** — and guards against the feedback loop where Donny would otherwise
cite its own un-vetted synthesis back as fact. Reuses the same `GITHUB_WIKI_TOKEN`; no new schema or
secret. v1 uses deterministic client-side defaults (no AI metadata; a Haiku suggestion is a possible
fast-follow).

### The detector becomes a self-healer — and the app proposes its own next loops (2026-06-19)

Two sequenced AIOS loops shipped (PR #130), prompted by a framework for deciding *which*
repeated work is worth automating — the **4-Condition Test**: score each candidate on
(1) does it **repeat** on a cadence, (2) can a **rule judge** when a run is done/correct,
(3) can you **afford wasted runs** (report-only, idempotent, reversible), (4) does the AI
already **have the data + tools** it needs. All four green = "build-first."

- **Loop 1 — knowledge-freshness self-heal (scored 4/4).** The daily ~3am `knowledge-freshness-agent`
  already *detected* two drift signals but only *flagged* both. It now **self-heals** the one
  mechanical case — when `donny_knowledge` lags the *already-merged* wiki (**case b**), it runs
  the blessed `sync-wiki-to-donny.mjs` itself (writing RAG only through the audited
  `donny-knowledge-sync` choke point) — and keeps **flagging** the human case — when substantive
  `src/`/`supabase/` work shipped to `main` but was never ingested (**case a**, needs a human to
  author a session source). Its writes are now **exactly two**: the findings POST and the
  idempotent sync script; it never edits files, commits, or writes the wiki. This preserves the
  invariant **a human merges first** — it only propagates human-reviewed, already-merged content.
  Two timestamps separate the cases: `LAST_WIKI` (ALL of `docs/wiki/`, drives case a) vs
  `LAST_WIKI_SYNC` (only `concepts`/`entities`/`analyses`, the dirs the script reads, drives case
  b). The script's **exit code is the success authority** (0 on a clean no-op, non-zero only on an
  errored batch) — comparing timestamps would false-fail whenever a wiki commit touched only
  `sources`/`index`/`log`, which `knowledge-sync` does routinely.
- **Loop 2 — Loop Scout (monthly, report-only).** The auditing framework itself, built **into** the
  AIOS as a monthly routine (cron `0 8 1 * *`). It reads `.claude/schedules/` + migration cron jobs
  so it never re-proposes an existing loop, mines `git log` / handoffs / sessions for repeated work,
  HEAD-probes PostgREST for data availability, runs the 4-Condition Test on each candidate, and files
  the top ~5 as `aios_findings` (`source:"loop-scout"`, `fingerprint:"loop-candidate:<slug>"`,
  `severity` = build priority, `title` prefixed `[loop]`) at `/internal/findings`. Stable
  fingerprints mean a recurring candidate bumps occurrences = "still worth building after N months."
  No schema/UI change — it reuses the [[AIOS]] findings surface (`source` is a free string).

Together these close two gaps: the one place the knowledge backstop *detected* a problem a human
had to *fix* now fixes itself, and the platform now proposes its own next automation loops instead
of a human auditing by hand. Both are **report-only except the single blessed idempotent sync** —
[[Musk's Algorithm]]'s "automate last" applied honestly.
Spec: `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md`.

#### Loop Scout's first run (2026-06-20) — the gate proves its worth

Both loops went live and were validated by manual runs (Loop 1: self-healed RAG on run 1, no-op
"layer current" on run 2; Loop 2: filed 5 fresh `[loop]` findings, none re-proposing an existing
loop). All five were then **dug into and triaged** — read the named edge fn + live prod data before
acting — yielding **2 built, 2 wontfix, 1 acknowledged**:

- **Built:** `expire-social-hooks` (daily cron, PR #133 — a dead cleanup control: hooks never
  expired, finished-campaign posting delegations never revoked; tightening-only so it's safe to
  automate) and `expire-email-verification-tokens` (pure-SQL pg_cron, PR #134 — security
  data-minimization, lossless because verification state lives on `profiles.email_verified`).
- **wontfix:** `donny-scheduled-posts-dispatch` (publishing is human-gated by design — draft →
  "Post Now" nudge → `outstand-proxy`; a dispatch cron would auto-post without consent) and
  `donny-analytics-alerts-cron` (the Scout hallucinated an `analytics_events` anomaly job; the fn is
  a per-user request-scoped read API that can't be cron-driven).
- **acknowledged:** `donny-cost-rollup-cron` — a *real* dead control (the AI cost-cap kill-switch)
  but the naive "add a cron" would flap: it bulk-writes the per-user `donny_usage.current_stage`
  that `usage-tracker` overwrites on the next action, and the `donny_cost_ledger` undercounts true
  spend (~$2 MTD vs ~$225/mo external billing). Correct fix is a separate platform stage +
  spend-source-of-truth, not a cron.

The lesson the run taught: **report-only is what makes an autonomous auditor safe.** Three of five
candidates were wrong or mis-scoped, but each cost only a human triage — no bad cron ever shipped —
while the two genuinely clean candidates became working infrastructure. The Codex second-review
gate also caught a P1 on the built cron (a missing `verify_jwt=false` would have 401'd it forever).
Both new cleanup crons are Vault-backed and auth-hardened to the [[Self-Improving App]]'s shared
`ingest-auth` gate, so a Supabase key rotation can't silently kill them (the failure class from the
[[AIOS Ingest-Secret Rotation Session]]); wiring them surfaced a stale-`aios_ingest_key` Vault
landmine, since corrected. See [[Loop Scout First Run]].

## Phased roadmap

- **Phase 1 — knowledge research loop** *(built).* On-demand `/autoresearch <topic>` plus an
  autonomous `loop` that auto-detects gaps via wiki-ops `lint`. Grows the wiki across all three domains.
- **Phase 2 — Donny learns** *(built, staging).* The `sync-donny` skill mode + the
  `donny-knowledge-sync` edge function embed verified pages (OpenAI `text-embedding-3-small`, 1536d)
  and idempotently upsert them into `donny_knowledge` as a new `'wiki'` source_type (RLS service-role,
  metered, keyed on `metadata.source_id`). Donny retrieves them through the existing
  `match_donny_knowledge` RPC — no retrieval change. Verified on staging end-to-end on the DB side;
  the live OpenAI sync runs from `supabase/scripts/sync-wiki-to-donny.ts`. Promote to prod after
  retrieval is confirmed.
- **Phase 3 — telemetry→reports bridge** *(first slice built — AIOS, 2026-06-11).* Real app signals
  now feed a report-only loop: the **AIOS bug & error sweep** cloud routine (Mondays) clusters the
  week's errors from `donny_tool_executions`/`analytics_events`/payment tables, reads repo source for
  suspected causes, and files fingerprint-deduplicated findings into `aios_findings` via the
  `aios-report-ingest` choke point (occurrence counting; a resolved finding that recurs auto-reopens).
  Admins triage at `/internal/findings`. The wiki-signals variant remains future work. The daily
  knowledge-freshness routine joined this report-only set and, as of 2026-06-19, **self-heals** the
  mechanical RAG-sync case rather than only flagging it (see "The detector becomes a self-healer"
  above); a **Loop Scout** routine (monthly) now files ranked automation-candidate findings here too.
- **Phase 4 — fix proposals** *(future).* The loop writes verified-bug remediation specs / draft PRs,
  human-gated, never auto-merged — honoring "one change per prompt" and "never modify auth without
  confirming."
- **Phase 5 — KPI/milestone autopilot** *(first slice built — AIOS, 2026-06-11).* The **AIOS weekly
  operating brief** cloud routine (Mondays) reads the [[North-Star KPI Scorecard]] + PROJECT_CONTEXT
  targets, pulls live platform data read-only, and files a draft brief (`aios_briefings`) with KPI
  status chips, a scaling forecast from `platform_weight` growth, and per-role acquisition
  recommendations. Admins review and publish to stakeholders at `/internal/briefings` (publish gate).
  First validated run 2026-06-11. Kill-switch flagging is grounded in the scorecard's calibration.
- **Phase 6 — Donny content-strategy engine** *(in progress — now the [[Content Engine]]; requested
  2026-06-10).* Extend the loop from wiki knowledge to **live signals**: ingest social-account
  analytics (Outstand — IG/TikTok/YouTube), Toast analytics, and Campaign/DragonShare/Promotions
  engagement, then have [[Donny AI]] recommend the **best content strategy** per restaurant/brand/creator.
  This has graduated from idea to a building system — see **[[Content Engine]]** for the full phase
  breakdown. **Built (verified prod):** Phase A (content-performance capture, live), Phase B (brief →
  DragonShare action across three slices — a creator gets a Donny brief and acts on it in one tap, with
  `dragonshare_posts.source_brief_id` + `caption` recorded), **Phase C** (PR #73 — the *return*
  half: published-post engagement linked back to the brief via two `social_post_log` triggers that
  populate `content_briefs.social_post_log_id` first-wins and carry `source_brief_id` onto
  `content_performance`), and **Phase D** (PR #77 — the first *creator-facing* surface: a "Your content
  briefs" card backed by the ownership-gated `get_creator_brief_performance` RPC that bridges the
  cross-user RLS gap and shows each brief's earned engagement). The full brief→action→performance loop
  is now closed and visible to the creator. Remaining dependency: the link only forms once a real boost
  + "Post Now" publish happens, and engagement-side pipelines are still partial
  (`dragonshare_engagement` schema-only; Outstand Phase 4 analytics in scope), so the card is empty in
  prod today by data reality. See also [[Content Engine Data Audit]].

### Ingest choke-point auth — surviving Supabase key rotation

The AIOS routines all write through `aios-report-ingest` (and the content cron through
`content-performance-capture`), which run `verify_jwt=false` and check the bearer
themselves. Originally that check was an exact match against the function's auto-injected
`SUPABASE_SERVICE_ROLE_KEY`. That coupling broke silently when a new Supabase **secret
API key** (`sb_secret_…`) rotated prod's service-role credential (2026-06-11 → fixed
2026-06-18): the *injected* copy updated automatically, but every place that stored a
**manual copy** of the key — the `Dame_git_claude` cloud-routine env (the agents) and the
Vault `content_capture_key` (the cron) — went stale and 401'd for a week, while internal
callers that source the key from injection (e.g. [[Donny AI]]'s `propose_correction`) kept
returning 200. The fix (shared `_shared/ingest-auth.ts`) accepts a bearer matching
**either** the injected service-role key (internal calls untouched) **or** a stable,
operator-set **`AIOS_INGEST_SECRET`** (the agents/cron). Its value is the `sb_secret_…`
key itself, so each agent holds one credential that works for both its direct PostgREST
reads and its ingest POST. Because the functions now accept a value the operator manages
(set in the edge secret, the cloud env, and Vault), a Supabase-initiated key rotation can
no longer silently kill the routines. (Disabling the legacy JWT entirely is out of scope —
it would break every function's injected-key admin client.) See [[Supabase]] and
[[AIOS Ingest-Secret Rotation Session]].

## Guardrails

The loop **writes only to `docs/wiki/`** — never app code, schema, RLS, or auth, and never the
immutable `docs/wiki/raw/`. It runs in the user's Claude Code session, outside the metered edge
functions, so it sits outside the 15%-of-revenue AI cap; the per-run iteration budget bounds cost.
This is [[Musk's Algorithm]]'s "automate last" applied honestly — automate knowledge capture, keep
code and money changes human-gated.

## Known Issues

- Phase 1 is fully built. Phases 2, 3 (first slice), 5 (first slice), and 6 (Phases A–D) are
  also built (see roadmap above). Phase 4 (fix proposals) and the wiki-signals variant of Phase 3
  remain future work. The loop now changes Donny's RAG and surfaces engagement to creators.
- The acceptance gate's "fills a real gap" check depends on `index.md` being complete; a missing
  index entry can cause a duplicate. Run wiki-ops `lint` periodically to catch this.
- **Donny's vector RAG was broken on staging (flag → fixed 2026-06-10).** The
  `match_donny_knowledge` RPC pinned `SET search_path TO 'public'`, but pgvector (and its `<=>`
  operator) is installed in the `extensions` schema on staging, so the RPC errored there
  (`operator does not exist: extensions.vector <=> extensions.vector`) and retrieval silently fell
  back to full-text search. Prod resolved the operator (pgvector reachable from `public`), so prod was
  unaffected. Same drift class as the logo trigger — see [[Migration Replay Drift]]. **Fixed:**
  migration `20260610130000_fix_match_donny_knowledge_search_path.sql` sets the function search_path to
  `public, extensions`; applied to staging **and prod**, and captured for replay everywhere.
- ~~Prod `donny_knowledge` is empty~~ **(resolved 2026-06-11).** Prod now holds 9 consumer rows plus
  46 **internal-scoped** rows (the full strategy/wiki library synced via
  `supabase/scripts/sync-internal-docs.mjs`). The AIOS knowledge-scoping work (`scope` column,
  scope-aware RLS, 3-arg `match_donny_knowledge`) keeps internal rows invisible to consumer Donny on
  every path — verified with sentinel tests in prod. Internal Donny at `/internal/donny` retrieves
  the internal scope through admin-verified donny-chat.

## See Also

- [[Content Engine]]
- [[Data Flywheel]]
- [[Donny AI]]
- [[DragonCandy Platform]]
- [[Karpathy LLM Wiki Schema]]
- [[Musk's Algorithm]]
- [[Migration Replay Drift]]
- [[Supabase]]
