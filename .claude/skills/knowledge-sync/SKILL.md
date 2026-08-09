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

## Loop memory

This skill keeps a co-located **`MEMORY.md`** — two zones: curated **Lessons** (read first)
and an append-only **Run Log**. Full contract: `docs/wiki/concepts/loop-memory-protocol.md`.

- **At the start of every run:** read `MEMORY.md` and apply its **Lessons**.
- **At the end of every run:** add a **Run Log** entry **at the top** (newest first) —
  `Output:` a *pointer* to the artifact this run produced (e.g. the wiki page + `log.md`
  line; never a duplicate), then `Happened / Worked / Failed / Remember`. Then promote
  durable takeaways into **Lessons** and prune any Lessons this run superseded.

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
   - `docs/SHIPPED_LOG.md` — **prepend** the session's full entry, newest-first
     (almost always).
   - `docs/PROJECT_CONTEXT.md` §5 — **only** when work *starts* (add to In flight),
     *reaches built-but-not-live* (move to Built — awaiting founder go-live with a
     `**Pending:**` clause), or *fully completes* (move to Shipped as a one-liner +
     pointer). One line per entry — plus a `**Pending:**` clause for Built — awaiting
     founder go-live entries only. Detail belongs in `SHIPPED_LOG.md` or the wiki.
     **§5 is an index, not a log.**
   - `docs/PROJECT_CONTEXT.md` §4 Current State — if the project-level picture changed.
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
   `donny-knowledge-sync` (OpenAI embeddings), and upserts by **`metadata->>source_id`**
   (`wiki:<type>/<slug>`) — idempotent, safe to re-run. Note it is a **jsonb key, not a column**:
   `donny_knowledge` has no `source_id` column, so `where source_id = …` fails with `42703`.

   **Verify by CONTENT, never by `max(updated_at)`** — the timestamp check this step used to
   recommend cannot pass on an update-only sync:

   ```sql
   select count(*) from donny_knowledge where content ilike '%<distinctive new token>%';
   ```

   **Why content, not the timestamp — and why that survived the trigger being fixed.**
   Historically (through 2026-08-07) `donny_knowledge`'s trigger
   `trg_donny_knowledge_updated_at → handle_updated_at()` was a **stub** whose entire body was
   `-- Function logic here / RETURN NEW;`, so an UPDATE fired it and changed nothing: after a sync
   reporting `updated=101 errors=0`, the changed page held the new text while its `updated_at`
   *equalled its `created_at`* from 78 minutes earlier. A timestamp gate was structurally
   unpassable.

   **That stub was restored on 2026-08-07** (PR #385, migration `20260807233200`) and `updated_at`
   moves again. Measured 2026-08-08: **231 of 237** `donny_knowledge` rows have
   `updated_at > created_at`, matching that sync's 231 UPDATEs exactly.

   **Keep gating on content anyway** — for a better reason than the old one. A moved timestamp only
   proves *something* was written; the probe proves *this* page's new text is retrievable, which is
   the property the RAG exists for. Use `updated_at` as corroboration, never as the gate.

   The wider warning this block used to carry — *"~30 tables share this stub, treat `updated_at` as
   untrustworthy on all of them"* — **no longer holds**; those triggers work. The durable rule is
   narrower: `updated_at` is a **modification** stamp, never a **status** signal (a title edit is
   indistinguishable from a status change), and rows *predating* the restore are unreliable in both
   directions. See [[Updated-At Trigger Drift]].

   Pick a token that cannot straddle a markdown line-wrap (a short hyphenated/code string, not a
   multi-word phrase). The authorities are the **sync's `errors=0`** and **direct content
   presence** — not the timestamp.

## Close the loop (verify → fix → re-verify)

This skill is the *generate*/fix half of the knowledge loop; [[verify-knowledge]] is the
*validate* half (contract: `docs/wiki/concepts/validator-skills.md`). After step 6, close the loop:

1. Run the [[verify-knowledge]] validator. Read its fenced verdict block (the LAST fenced JSON
   block in its output).
2. If `done:true` → the knowledge layer is current. Report and finish.
3. If `done:false` → apply the fixes named in `missing[]`:
   - RAG behind → run `node supabase/scripts/sync-wiki-to-donny.mjs` (the step-6 command).
   - Page missing from `index.md`/`log.md` → add it.
   - Wiki lint critical → fix the contradiction / broken wikilink.
   Then re-run [[verify-knowledge]].
4. **Cap at 3 iterations.** If still `done:false` after 3, STOP and surface the residual
   `missing[]` to the user. Never loop unbounded; never claim `done:true` the validator did not return.

The old "Done when" bullets — index/log updated, core docs current, and the RAG carrying this
session's text — are exactly the checks [[verify-knowledge]] now judges mechanically and returns
as the verdict block. (That last bullet used to read `donny_knowledge.max(updated_at)` current;
see step 6 for why that signal is structurally broken. [[verify-knowledge]]'s `RAG_LAST` timestamp
probe is subject to the same stub trigger — its own `[freshness-proxy]` lesson is the correct way
to read it: fall back to `content ilike`, and trust that.)
