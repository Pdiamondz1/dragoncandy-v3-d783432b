---
title: Self-Improving App
type: concept
created: 2026-06-10
updated: 2026-06-10
sources: [autoresearch/program.md, autoresearch/README.md, docs/PROJECT_CONTEXT.md]
tags: [architecture, strategy, ai, moat, autoresearch, donny]
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
- **Phase 3 — telemetry→wiki bridge** *(future).* Feed real app signals (`analytics_events`,
  `dragonshare_events`, edge-function/error logs, [[Supabase]] advisors) into a raw `signals` source
  so gap detection is driven by actual transactions and engagement — "learn about bugs from usage."
- **Phase 4 — fix proposals** *(future).* The loop writes verified-bug remediation specs / draft PRs,
  human-gated, never auto-merged — honoring "one change per prompt" and "never modify auth without
  confirming."
- **Phase 5 — KPI/milestone autopilot** *(future).* The loop maintains a living strategy/KPI/milestone
  page, refreshing against the three-year targets and flagging when a kill-switch threshold is neared
  (churn >6%, CAC payback >12mo, LTV:CAC <2:1, revenue/employee <$400K).

## Guardrails

The loop **writes only to `docs/wiki/`** — never app code, schema, RLS, or auth, and never the
immutable `docs/wiki/raw/`. It runs in the user's Claude Code session, outside the metered edge
functions, so it sits outside the 15%-of-revenue AI cap; the per-run iteration budget bounds cost.
This is [[Musk's Algorithm]]'s "automate last" applied honestly — automate knowledge capture, keep
code and money changes human-gated.

## Known Issues

- Phases 2–5 are roadmap, not built. Phase 1 produces knowledge pages only; it does not yet change
  Donny's behavior or app code.
- The acceptance gate's "fills a real gap" check depends on `index.md` being complete; a missing
  index entry can cause a duplicate. Run wiki-ops `lint` periodically to catch this.
- **Donny's vector RAG was broken on staging (flag → fixed 2026-06-10).** The
  `match_donny_knowledge` RPC pinned `SET search_path TO 'public'`, but pgvector (and its `<=>`
  operator) is installed in the `extensions` schema on staging, so the RPC errored there
  (`operator does not exist: extensions.vector <=> extensions.vector`) and retrieval silently fell
  back to full-text search. Prod resolved the operator (pgvector reachable from `public`), so prod was
  unaffected. Same drift class as the logo trigger — see [[Migration Replay Drift]]. **Fixed:**
  migration `20260610130000_fix_match_donny_knowledge_search_path.sql` sets the function search_path to
  `public, extensions`; applied to staging and captured for replay everywhere.

## See Also

- [[Data Flywheel]]
- [[Donny AI]]
- [[DragonCandy Platform]]
- [[Musk's Algorithm]]
- [[Migration Replay Drift]]
- [[Supabase]]
