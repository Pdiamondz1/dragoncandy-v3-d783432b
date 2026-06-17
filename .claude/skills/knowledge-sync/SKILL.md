---
name: knowledge-sync
description: "Refresh the knowledge layer for a session's shipped work — write a wiki session source, ingest it, refresh core docs, and sync Donny's RAG. Use when finishing a worktree branch / opening a PR, or when asked to 'update the wiki/knowledge', 'sync donny knowledge', or 'capture this session'."
---

# Knowledge Sync (per-session)

Keeps `docs/wiki/`, the core docs, and Donny's RAG (`donny_knowledge`) current with
what shipped. **Run this as a required step of finishing a worktree branch** (see the
"Knowledge update on branch finish" checklist in `CLAUDE.md`). The daily 3am AIOS
`knowledge-freshness-agent` is only a backstop that *flags* misses — this skill is how
the update actually happens.

Wiki ingestion is LLM work (it writes synthesized prose), so it can't be a deterministic
hook — it must be run by the agent. Related: [[wiki-ops]], [[autoresearch]].

## When to run

- Finishing a development branch / before (or with) opening the PR for substantive work.
- After a PR merges, to sync the RAG against `main` (step 5).
- Any time the AIOS files a "Knowledge layer behind main" finding.

## Steps

1. **Scope the change.** Identify what shipped this session (the branch's commits / the PR).
   Skip trivial mechanical changes (typo/format/dep bumps) — they don't need a wiki page.

2. **Write the raw session source.** Create
   `docs/wiki/raw/sessions/YYYY-MM-DD-<topic>.md` summarizing the work: what shipped, key
   decisions, gotchas, affected files/edge functions/migrations. (Never edit `raw/` later —
   it's immutable input.)

3. **Ingest via `/wiki-ops ingest`** on that raw file: create/update `concepts/`,
   `entities/`, `analyses/` pages, add `[[wikilinks]]`, update `index.md` (alphabetical),
   append to `log.md`. Follow `docs/KNOWLEDGE_WIKI.md`.

4. **Refresh core docs as warranted** (only what the work actually changed):
   - `docs/PROJECT_CONTEXT.md` — Active Workstreams / Current State (almost always).
   - `docs/DATABASE_SCHEMA.md` — if tables/columns/views changed.
   - `docs/DESIGN_SYSTEM.md` — if design tokens / UI patterns changed.
   - `CLAUDE.md` — only if a workflow rule / convention changed.

5. **Commit wiki + doc changes in the work PR (or a paired PR)** — reviewed like any code
   (and through the [[codex-review]] second pass). Do NOT bypass review for docs.

6. **Sync the RAG after merge to `main`:**
   ```bash
   # prod uses the legacy service-role JWT; staging uses sb_secret (see project memory)
   export DONNY_SYNC_URL="https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync"
   export SUPABASE_SECRET_KEY="<prod service-role key>"
   node supabase/scripts/sync-wiki-to-donny.mjs
   ```
   The script reads `concepts/`·`entities/`·`analyses/` (never `raw/`/`sources/`), batches to
   `donny-knowledge-sync` (OpenAI embeddings), and upserts by `source_id` — idempotent, safe
   to re-run. Verify: `select count(*), max(updated_at) from donny_knowledge` advanced.

## Done when

- New/updated wiki pages exist on `main` for the shipped work, `index.md`/`log.md` updated.
- Relevant core docs reflect the change.
- `donny_knowledge.max(updated_at)` is current with the merge.
