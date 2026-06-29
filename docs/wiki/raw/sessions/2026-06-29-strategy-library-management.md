# Session: DC AIOS Strategy Library Management (audit + safe archive + core-file protection) — 2026-06-29

Branch `feat/aios-strategy-library-management` (worktree DC-2). Built via brainstorm → spec
(2 review rounds) → plan (2 review rounds) → subagent-driven execution (8 tasks, per-task review)
→ Codex (clean) → full prod rollout + keystone smoke. Founder go-live: create the monthly
`/schedule` routine.

## Problem
The AIOS **strategy library** (`internal_docs`, surfaced at `/internal/strategy`) is a projection
of git docs (~21 top-level `docs/*.md` + ~60 `docs/wiki/**`) that feeds Internal Donny's RAG
(`donny_knowledge`, scope `internal`) and Dezzy's `get_internal_doc` tool. It had **no audit, no
dedup detection, and no delete capability**. Three traps made naive deletion unsafe:
1. The sync (`donny-knowledge-sync`) is **insert/update-only — it never deletes**, so a bare DB
   delete is re-created on the next `sync:internal`.
2. Deleting the git file **orphans** the DB rows (the sync won't clean them up).
3. No similarity logic existed (though pgvector embeddings + the dormant `internal_docs.source_hash`
   column were available).

## Design decisions (founder-approved, via AskUserQuestion forks)
- **Delete model = reversible Archive (soft)**, not hard purge. No git surgery, no resurrection,
  fully recoverable. Hard purge deferred (YAGNI).
- **Initiator = founder acts directly in the UI** (the audit only *detects*; no corrections-gate
  round-trip — that rail is for Donny mutating live values, not founder housekeeping).
- **Core protection = `is_core` flag**, seeded on the ~21 non-`docs/wiki/%` paths + a `BEFORE INSERT`
  trigger for future top-level docs, enforced **server-side** in the archive RPC.
- **Audit scope = duplicates + contradictions + bloat/orphans**, report-only, **monthly** cadence.

## Keystone — archive must survive re-sync
Archiving deletes the `donny_knowledge` row + sets `internal_docs.archived_at`, but the next sync
would re-INSERT the RAG row (its select-by-source_id finds nothing → insert), silently resurrecting
the doc. **Fix:** make `donny-knowledge-sync` **archive-aware** — for an internal page it upserts
`internal_docs` first, reads back `archived_at`, and if archived it **skips** the RAG write (and
self-heals any stray row). Placed in the edge fn (the single RAG-write choke point) so it covers
every caller (sync scripts + wiki-merge-pr). The skip path is **fail-open** on a DB error (archived
stays false → RAG proceeds; self-heals next sync) — documented.

## What shipped
- **Migration** `20260629120000_internal_docs_archive_audit.sql`: columns `is_core` /
  `archived_at` / `archived_by` / `archive_reason`; seed `is_core` on non-wiki paths; a `BEFORE
  INSERT` trigger `internal_docs_set_is_core` (pinned `search_path = ''` to clear the
  function_search_path_mutable advisor); **service-role** detection RPCs `dedup_candidate_pairs(threshold)`
  (cosine via pgvector `<=>`, `search_path = public, extensions`) + `internal_doc_exact_dupes()` (via
  `source_hash`); **admin-gated** `internal_doc_archive(path,reason)` (refuses a core doc + deletes the
  `donny_knowledge` row) + `internal_doc_unarchive(path)`. Grants follow the `dre_pending_events`
  pattern (revoke anon/authenticated/public; detection→service_role, archive→authenticated).
- **`donny-knowledge-sync`** archive-aware + computes `sha256(content_md)` into `source_hash` (new
  pure `hash.ts` + vitest, NIST "abc" vector).
- **Readers** — `.is('archived_at', null)` added to `get_internal_doc` LIST+READ in both
  `aios-playbook-run` (Dezzy) and `donny-chat` (Internal Donny).
- **Types + hooks** — surgical `types.ts` add (4 columns + 4 RPCs); `useInternalDocs({archived})`;
  new `useArchiveDoc`/`useUnarchiveDoc`.
- **UI** — `/internal/strategy` Active/Archived toggle, "Core" badge, admin-gated (`isAdmin`)
  Archive/Un-archive via shadcn AlertDialog + reason (the route is `tier="stakeholder"`, so the
  `isAdmin` control-gate is required; server RPC is the real enforcement).
- **Routine** — `.claude/schedules/strategy-library-audit-agent.md`, monthly, files
  dupe/conflict/orphan/bloat findings to `/internal/findings` (report-only, fingerprint-deduped).
- **Core docs** — DATABASE_SCHEMA (`internal_docs` note) + PROJECT_CONTEXT workstream bullet.

## Prod rollout + keystone smoke (this session, on prod)
- Migration applied via MCP; advisors clean (the trigger's `function_search_path_mutable` was the
  only new advisor I introduced → fixed with `search_path = ''`; archive/unarchive carry the
  by-design `authenticated_security_definer_function_executable` like `aios_corrections_apply`;
  the service-role detection RPCs are correctly NOT exposed).
- Seed verified: 21 core, 0 wiki-core, 84 total. Trigger verified (docs/→core, docs/wiki/→not).
- 3 edge fns deployed via CLI (`--no-verify-jwt` preserved — ground-truth `verify_jwt=false` per
  `list_edge_functions`).
- **Archive-survives-resync smoke PASSED** end-to-end on a throwaway non-core wiki doc: archive →
  RAG row gone; full `sync:internal` → **not resurrected** + `source_hash` backfilled **84/84**;
  un-archive → re-sync → **restored** (rag_rows=1). `dedup_candidate_pairs` returns 3 pairs @0.9
  (9 @0.85; routine uses 0.88); `internal_doc_exact_dupes` returns 0.

## Gotchas / reusable lessons
- A trigger function with no fixed `search_path` adds a `function_search_path_mutable` advisor —
  pin `search_path` (empty is fine when the body touches no schema objects).
- The `is_core` trigger fires on the proposed tuple even for `INSERT … ON CONFLICT DO UPDATE`; the
  guarantee that a manual promotion survives re-sync is the **upsert `SET` clause omitting `is_core`**,
  not the trigger "skipping" UPDATE.
- The full `sync:internal` doubles as the one-time `source_hash` backfill (the column existed but was
  never populated until the edge fn started writing it).
- A service-role-consumed RPC must be `grant execute … to service_role` with **no** in-body
  `auth.uid()` admin check (service_role has null `auth.uid()`) — mirrors `dre_pending_events`.

## Founder go-live (remaining)
Create the monthly routine via `/schedule` pointing at `.claude/schedules/strategy-library-audit-agent.md`
(env `Dame_git_claude`, `AIOS_INGEST_SECRET`). The frontend (Archive UI) deploys via Lovable on merge;
the new wiki page syncs to the RAG via the post-merge hook. UI smoke (admin) is post-deploy verify-prod.
