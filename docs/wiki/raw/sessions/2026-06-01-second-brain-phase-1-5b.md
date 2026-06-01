# Session Extract — Second Brain Phase 1.5B + docs:scale Script

**Date:** 2026-06-01
**Commits:** `95b9058`, `f3f46b3`
**Source spec:** `docs/superpowers/specs/2026-05-24-second-brain-automation-design.md`

## What Shipped

Two companion pieces that form the weekly wiki-sync safety net:

### 1. docs:scale Script (`f3f46b3`)

**New file:** `scripts/update-scale-numbers.mjs` (run via `npm run docs:scale`)

Deterministically refreshes the "Codebase scale" line and "Backend edge-function count"
in `docs/PROJECT_CONTEXT.md`. No LLM, no synthesis — it counts:
- **pages** = `*.tsx` files under `src/pages/` (recursive)
- **hooks** = `use*.ts`/`use*.tsx` files under `src/hooks/` (recursive)
- **edge functions** = immediate subdirectories of `supabase/functions/`, excluding `_shared`

Writes the updated line with today's date. Exits non-zero if the target line format drifts
(so CI or the weekly agent notices). Idempotent — safe to run multiple times.

Added `"docs:scale": "node scripts/update-scale-numbers.mjs"` to `package.json`.

Also corrected the scale count: the prior entry (184 hooks) was wrong; the actual count
is 183.

### 2. Phase 1.5B Spec Expansion (`95b9058`)

Expanded `docs/superpowers/specs/2026-05-24-second-brain-automation-design.md` from a
lint-only stub into the full drift-detection-and-sync safety net. Documents:

**Why it exists:** A multi-week lapse — the DragonShare + Capacitor workstreams shipped
without ingested handoffs, leaving the wiki and core docs stale. The handoff-driven
pipeline (Phase 1C) is the primary path; Phase 1.5B is the backstop.

**What it does each run:**
1. Read the most recent date in `docs/wiki/log.md` → LAST_SYNC.
2. `git log --since=<LAST_SYNC>` → cluster commits into workstreams.
3. For each workstream with no wiki coverage: draft a session extract in
   `docs/wiki/raw/sessions/` and run the full wiki-ops ingest flow.
4. Run `npm run docs:scale` to refresh PROJECT_CONTEXT.md counts.
5. Run wiki-ops lint check.
6. Land changes on a branch + open a PR (never commit wiki synthesis to `main` directly).

**Cadence:** Weekly, Monday 9:00 AM ET.

**Why branch + PR:** docs don't trigger the Lovable deploy, but an autonomous agent doing
synthesis must not pollute `main` history unreviewed. A weekly PR is a cheap, reversible
review surface.

## Key Decisions

- **Deterministic counting is separate from synthesis.** The scale script is purely
  mechanical (file counts); the wiki ingest agent is synthesizing meaning. They're decoupled
  so the counting never needs LLM judgment and exits non-zero on format drift.
- **Branch + PR, not auto-commit.** Even for doc-only changes, wiki synthesis can be wrong.
  The PR body summarizes what was synced and lists lint findings — it's a useful artifact
  regardless.
- **Phase 1C (session-handoff → wiki pipeline) is primary; 1.5B is backstop.** The weekly
  agent catches lapses when handoffs weren't written.
- **Phase 1.5A (production health monitor) is still pending** — not shipped in this session.
- **Phase 2 (Donny RAG bridge) is post-launch** — deferred.

## Key Takeaways

1. The combination of deterministic counting (docs:scale) + synthetic ingestion (wiki-sync
   agent) forms a hybrid safety net: one part is always correct, one part is reviewed.
2. The `--since` date comparison in git may behave differently when the system clock differs
   from commit timestamps — the agent should compare against the wiki sync commit hash when
   possible.
3. The scale script uses a non-zero exit to surface format drift — calling code must handle
   this rather than swallowing the error.
