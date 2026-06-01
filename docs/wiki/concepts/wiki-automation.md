---
title: Wiki Automation
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-second-brain-phase-1-5b.md, docs/superpowers/specs/2026-05-24-second-brain-automation-design.md]
tags: [wiki, automation, second-brain, docs-scale, knowledge-management]
---

# Wiki Automation

The automated safety net that keeps the knowledge wiki in sync with the codebase,
regardless of whether session handoffs were written. Part of the Second Brain +
Automation Layer design (`docs/superpowers/specs/2026-05-24-second-brain-automation-design.md`).

## Two Components

### 1. docs:scale Script (deterministic)

`scripts/update-scale-numbers.mjs` (`npm run docs:scale`). Counts pages, hooks, and edge
functions from the source tree and rewrites two lines in `docs/PROJECT_CONTEXT.md`:

- **pages** = `*.tsx` under `src/pages/` (recursive)
- **hooks** = `use*.ts`/`use*.tsx` under `src/hooks/` (recursive)
- **edge functions** = immediate subdirectories of `supabase/functions/`, excluding `_shared`

Writes the updated count line with today's date. Exits non-zero if the target line format
drifts. Idempotent. The weekly agent calls this as step 4 of each run.

No LLM involved — purely mechanical file counting. This is the "always correct" half of
the hybrid safety net.

### 2. Weekly Wiki-Sync Agent (Phase 1.5B)

A Claude Code agent that runs weekly (Monday 9 AM ET) as the backstop for wiki drift.

**What it does each run:**
1. Read the most recent entry date in `docs/wiki/log.md` → LAST_SYNC.
2. `git log --since=<LAST_SYNC>` → cluster commits into workstreams.
3. For each workstream with no wiki coverage: write a session extract to
   `docs/wiki/raw/sessions/` and run the full wiki-ops ingest flow (source/entity/concept
   pages, cross-references, index, log). Flag contradictions — never silently overwrite.
4. Run `npm run docs:scale` to refresh PROJECT_CONTEXT.md counts.
5. Run wiki-ops lint check (contradictions, stale claims, orphans, missing pages, thin
   coverage). Collect findings.
6. If anything changed: create branch `wiki-sync/YYYY-MM-DD`, commit, push, open PR. Never
   commit wiki synthesis to `main` directly.
7. If nothing drifted and lint is clean: output single-line report, no PR.

## Why Branch + PR (Not Auto-Commit)

Docs don't trigger the Lovable deploy, but an autonomous agent doing synthesis can be
wrong. A weekly PR is a cheap, reversible review surface. The PR body summarizes what was
synced and lists all lint findings — useful signal regardless of whether changes are merged
immediately.

## Primary vs. Backstop

- **Primary:** Phase 1C session-handoff → wiki pipeline. After any significant session, a
  handoff is written to `.claude/handoffs/`, copied to `docs/wiki/raw/sessions/`, and
  ingested via `/wiki-ops ingest`.
- **Backstop:** Phase 1.5B weekly agent catches lapses when handoffs weren't written (as
  happened with the DragonShare + Capacitor multi-week gap that motivated this design).

## Phases Not Yet Implemented

- **Phase 1.5A — Production Health Monitor:** daily agent that logs in as each role,
  navigates key pages, checks DevTools console, takes screenshots. Pending.
- **Phase 1.5C — Session-Start Context Recovery:** hook that surfaces recent handoffs at
  conversation start. Pending.
- **Phase 2A — Wiki → donny_knowledge Sync:** post-launch; syncs wiki entity/concept pages
  into [[Donny AI]]'s RAG store for user-facing answers.

## Key Decisions

- **Deterministic counting (docs:scale) is separate from synthesis (wiki agent).** The
  counting never needs LLM judgment and exits non-zero on format drift — it's always
  trusted. The synthesis is always reviewed.
- **Phase 1.5B was originally lint-only.** Expanded to full drift-detection-and-sync after
  the multi-week DragonShare/Capacitor lapse revealed the need for a complete backstop.

## See Also

- [[CI/CD Quality Gate]] (companion code safety net)
- [[Donny AI]] (Phase 2: RAG bridge target)
- [[DragonCandy Platform]]
- [[Second Brain Phase 1.5B Session]](../sources/second-brain-phase-1-5b-session.md)
