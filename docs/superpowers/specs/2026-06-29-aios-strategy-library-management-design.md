# DC AIOS — Strategy Library Management (audit, safe archive & core-file protection)

- **Date:** 2026-06-29
- **Branch:** `feat/aios-strategy-library-management` (worktree `DC-2`)
- **Status:** design approved (founder)

## Context

The DC AIOS **strategy library** is the `internal_docs` table, surfaced read-only at
`/internal/strategy`. It is a **projection of git-tracked files** synced into the DB by
`donny-knowledge-sync` (via `supabase/scripts/sync-internal-docs.mjs`), keyed by `path`:

- ~21 top-level `docs/*.md` — PROJECT_CONTEXT, DATABASE_SCHEMA, DESIGN_SYSTEM, the strategy
  briefings, moat playbook, pricing, etc. These are the **Core Files**.
- ~60 `docs/wiki/**` pages (`concepts` / `entities` / `analyses`).

The same content feeds the knowledge **Donny** retrieves over (the `donny_knowledge` RAG store,
internal-scoped rows, 1536-dim OpenAI embeddings) and the docs **Dezzy** reads through the
`aios-playbook-run` `get_internal_doc` tool. The wiki half grows continuously (autoresearch,
wiki-save-answer, wiki-import-doc, Loop Scout, knowledge-sync), so over time it accumulates
near-duplicate, conflicting, and stale pages — bloating the library and risking contradictory facts
for Donny/Dezzy.

Today there is **no audit, no dedup detection, and no delete capability**, and three facts make
naive deletion unsafe:

1. **The sync is insert/update-only and never deletes.** A bare DB delete is *not durable* — the next
   `sync:internal` re-inserts the row from the still-present on-disk file.
2. **Deleting the git file orphans the DB rows** (the sync won't clean them up).
3. **No similarity/dedup logic exists**, though the pgvector embeddings + the dormant
   `internal_docs.source_hash` column are already there to build on.

**Goal:** a routine (monthly) audit that surfaces duplicate / conflicting / stale / bloated docs for
human review, plus a **safe, reversible archive** action that pulls a doc out of Donny/Dezzy
retrieval and the viewer — while making it **impossible to remove a Core File**. Built by composing
existing AIOS rails: scheduled cloud routine → `aios_findings` → `/internal/findings` triage;
admin-gated `SECURITY DEFINER` RPCs; `is_internal_user()` / `has_role(uid,'admin')` gating.

## Design decisions (founder-approved)

- **Delete model = Archive (soft, reversible).** No git surgery, no resurrection surprise, fully
  recoverable. Hard *purge* (PR-deleting the git file) is **deferred** (YAGNI) as a future admin
  escalation.
- **Initiator = founder acts directly in the UI.** The audit *detects*; the founder makes the
  judgment call and clicks Archive. Each archive stamps `archived_by`/`archived_at`/`archive_reason`.
  (No corrections-gate round-trip — that rail is for *Donny* mutating live values, not founder
  housekeeping; the founder is already the gate at the click.)
- **Core protection = `is_core` flag, seeded on the canon, enforced server-side.** Default rule: every
  non-`docs/wiki/%` path is core; an individual wiki page can be promoted later by flipping the flag.
  The archive RPC **refuses** a core doc (a server-side guard, not just a hidden button).
- **Audit scope = duplicates + contradictions + bloat/staleness**, all filed to the existing findings
  rail, report-only. Cadence **monthly**.

## Keystone correctness issue — archive must survive re-sync

Archiving deletes the doc's `donny_knowledge` row and sets `internal_docs.archived_at`. But on the
next sync, `donny-knowledge-sync`'s internal branch would re-INSERT the RAG row (its
select-by-`source_id` finds nothing → insert), silently resurrecting the doc in Donny's brain.

**Fix:** make `donny-knowledge-sync` **archive-aware** for internal-scoped pages. The edge function is
the single RAG-write choke point, so the guard there covers *every* caller — the sync scripts **and**
`wiki-merge-pr`. For an internal page, after upserting `internal_docs` (so the stored markdown stays
fresh for an eventual un-archive), read back `archived_at`; if set, **skip** the `donny_knowledge`
insert/update (and never clear `archived_at`). Result: an archived doc's markdown stays current but it
stays out of the RAG until un-archived.

## Piece 1 — schema migration (reviewed first, ledger-first rule)

One migration `supabase/migrations/20260629120000_internal_docs_archive_audit.sql`:

- **Columns** on `internal_docs`: `is_core boolean NOT NULL DEFAULT false`, `archived_at timestamptz`,
  `archived_by uuid REFERENCES auth.users(id)`, `archive_reason text`. (`source_hash` already exists —
  no add; Piece 3 starts populating it.)
- **Seed (existing rows):** `UPDATE public.internal_docs SET is_core = true WHERE path NOT LIKE
  'docs/wiki/%';`
- **`is_core` for future rows — `BEFORE INSERT` trigger** `internal_docs_set_is_core`:
  `NEW.is_core := (NEW.path NOT LIKE 'docs/wiki/%')`. It fires **only on INSERT**, so a newly-added
  top-level `docs/*.md` is born `is_core=true` automatically (closing the "new core file inserts as
  archivable" gap), while an UPDATE (the re-sync upsert hitting a path conflict) **never touches**
  `is_core` — so a wiki page an admin later promotes to `is_core=true` survives re-sync. The sync
  upsert payload therefore must **not** include `is_core` (the trigger owns it on insert; UPDATE leaves
  it alone). Seed + trigger together cover every row, present and future.
- **Index:** partial index `… (path) WHERE archived_at IS NULL` is optional (corpus is ~80 rows; skip
  unless trivially cheap). No RLS change — the existing internal-only `SELECT` policy stays; all
  mutations go through `SECURITY DEFINER` RPCs below.

## Piece 2 — detection RPCs `dedup_candidate_pairs` + `internal_doc_exact_dupes`

Two functions in the same migration, both `SECURITY DEFINER`, `SET search_path = public`, and
**service-role-only** — they are consumed **only** by the Piece 6 audit routine (a service-role caller
via `AIOS_INGEST_SECRET`), never by the browser, so they mirror the established `dre_pending_events()`
pattern exactly: `revoke all on function … from public, anon, authenticated; grant execute on function
… to service_role;`. **No in-body `has_role(auth.uid(),'admin')` gate** — service_role has a null
`auth.uid()`, so an admin check would reject the routine; the `service_role`-only EXECUTE grant *is*
the gate. (Contrast the Piece 3 archive RPCs, which are browser-called and therefore correctly
admin-gated. Earlier draft gated `dedup_candidate_pairs` to admin — that was wrong; it would block its
own and only caller.)

- **`dedup_candidate_pairs(p_threshold double precision DEFAULT 0.9) RETURNS TABLE(path_a text, title_a
  text, path_b text, title_b text, similarity double precision)`** — near-dupes via cosine: self-join
  `donny_knowledge a JOIN donny_knowledge b` where `a.scope='internal' AND b.scope='internal' AND
  a.id < b.id` and `(1 - (a.embedding <=> b.embedding)) >= p_threshold`. Join each side to
  `internal_docs` on the verified key (Piece 3 — `metadata->>'path' = internal_docs.path`), excluding
  archived docs (`archived_at IS NOT NULL`), returning the tuple above. `<=>` is pgvector cosine
  distance. ~80 internal rows → the pairwise scan is trivial. Default threshold tuned during
  verification (Piece 6).
- **`internal_doc_exact_dupes() RETURNS TABLE(source_hash text, paths text[], n integer)`** — exact
  collisions: group non-archived `internal_docs` by `source_hash` (non-null) `HAVING count(*) > 1`,
  returning each colliding hash with its `array_agg(path)` and count. A named companion (its group
  shape differs from the near-dupe tuple) keeps both return types clean.

This is the deterministic engine — the audit routine never does fuzzy math itself (the "a rule judges
done" validator primitive).

## Piece 3 — archive RPCs + archive-aware sync

**Pre-work — verify the join key (blocking).** Before relying on `metadata->>'path'`, confirm in prod
(`execute_sql`) that for internal-scoped `donny_knowledge` rows `metadata->>'path'` is populated and
equals the corresponding `internal_docs.path`. If it is **not** reliably populated, the fallback is to
match on `metadata->>'source_id'` (the sync's actual upsert key) — adjust Pieces 2 & 3 accordingly.
This key is load-bearing for both dedup pairing and archive cleanup.

**RPCs** (same migration), both `SECURITY DEFINER` + in-body admin gate (`has_role(auth.uid(),'admin')`)
+ `revoke … from public, anon; grant execute … to authenticated` (browser-called from the admin UI
session, so admin-gated — unlike the Piece 2 service-role detection RPCs):

- `internal_doc_archive(p_path text, p_reason text) RETURNS jsonb`:
  `SELECT … FROM internal_docs WHERE path = p_path FOR UPDATE`; not found → raise; `is_core` → `RAISE
  EXCEPTION 'cannot archive a core document'`; already archived → return a no-op status. Else set
  `archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason`, then
  `DELETE FROM donny_knowledge WHERE scope='internal' AND metadata->>'path' = p_path` (or the verified
  fallback key). Return `{status:'archived', path}`.
- `internal_doc_unarchive(p_path text) RETURNS jsonb`: admin gate; clear
  `archived_at/archived_by/archive_reason`. The RAG row is **restored on the next sync** (the
  archive-aware guard now lets it through). Return `{status:'unarchived', path, note:'re-embedded on
  next sync'}`.

**Edge function** `supabase/functions/donny-knowledge-sync/index.ts` — two changes to the internal
branch:
1. **Archive-aware** (keystone): after the `internal_docs` upsert, if that path's `archived_at` is
   set, skip the `donny_knowledge` insert/update. (Read `archived_at` in the same upsert via
   `.upsert(...).select('archived_at')`, or a small follow-up select.)
2. **`source_hash`:** compute `sha256(content_md)` (hex) and include it in the `internal_docs` upsert
   payload, so exact-dup detection has data. (Deno `crypto.subtle.digest`.) **Do not** add `is_core` to
   the payload — the Piece 1 `BEFORE INSERT` trigger owns it (so re-sync UPDATEs never clobber a manual
   promotion).

## Piece 4 — hide archived docs from all readers

- `src/hooks/internal/useInternalDocs.ts` — `useInternalDocs(opts?: { archived?: boolean })`: select
  adds `is_core, archived_at`; default filters `archived_at IS NULL`; `{ archived: true }` returns
  only archived rows for the Archived view. `useInternalDoc` select adds `is_core, archived_at`.
- `aios-playbook-run/index.ts` `get_internal_doc` (Dezzy) — exclude `archived_at IS NOT NULL` from
  both the LIST and the single-doc READ.
- `donny-chat` internal `get_internal_doc` tool (Internal Donny) — same archived exclusion on LIST +
  READ. (donny-chat redeploy is **founder-run**, per existing pattern — note in go-live.)

## Piece 5 — UI: `/internal/strategy` archive controls (admin tier)

`src/pages/internal/InternalStrategy.tsx` + a new `src/hooks/internal/useArchiveDoc.ts`
(`useArchiveDoc` + `useUnarchiveDoc` mutations calling the RPCs; on success invalidate
`['aios','internal-docs']` and `['aios','internal-doc']`). Existing dark "ops-deck" theme +
`PageContainer`/`PageHeader` primitives; the route is already `tier="admin"`, and controls additionally
check `useInternalAccess().isAdmin`.

- Core docs render a **"Core"** badge; the Archive button is **absent/disabled** on them.
- Non-core docs get an **Archive** button (confirmation dialog with an optional reason). Use a shadcn
  AlertDialog; never a raw `window.confirm` (browser-dialog rule).
- An **Archived** toggle/section lists archived docs (reason + date) with an **Un-archive** button and
  a note that it returns to Donny on the next sync.

## Piece 6 — scheduled audit routine

`.claude/schedules/strategy-library-audit-agent.md`, modeled on `loop-scout-agent.md` /
`bug-sweep-agent.md`. **Monthly** cron. Auth via `AIOS_INGEST_SECRET` (bearer + PostgREST apikey).
Report-only — the only write is the findings POST.

Steps: (1) call `dedup_candidate_pairs` and `internal_doc_exact_dupes` via `/rest/v1/rpc/...`; (2) read
`internal_docs` (non-archived) for **staleness** (`updated_at` older than N months — exclude core docs
that are intentionally long-lived) and **library size/count** trend; (3) for each near-dup/exact pair,
read both docs' content and **judge contradiction vs benign overlap**; (4) file deduped findings via
`aios-report-ingest` (`source:'strategy-audit'`).

**Fingerprints** (stable, dedup via the existing `aios_findings.fingerprint` UNIQUE + occurrence-bump):
`strategy-dupe:<pathA>~<pathB>` (paths sorted), `strategy-exact:<source_hash>`,
`strategy-conflict:<pathA>~<pathB>`, `strategy-stale:<path>`, `strategy-bloat:library` (singleton).
**Severity:** dupes/contradictions `medium`, stale/bloat `low` — **never `critical`** (reserved for
bugs). `evidence` jsonb carries the paths, similarity score, and short snippets. Each finding's
`summary_md` recommends the keep/archive call and names the exact `path` to archive, so the founder can
act on `/internal/strategy` directly.

Triage already exists at `/internal/findings` (no new triage UI). **Founder go-live:** create the
routine via `/schedule`.

## Files

- **New:** `supabase/migrations/20260629120000_internal_docs_archive_audit.sql` (columns + seed +
  `is_core` `BEFORE INSERT` trigger + service-role `dedup_candidate_pairs` + service-role
  `internal_doc_exact_dupes` + admin-gated `internal_doc_archive`/`_unarchive`);
  `.claude/schedules/strategy-library-audit-agent.md`; `src/hooks/internal/useArchiveDoc.ts`.
  (Add a pure helper + vitest only if any fingerprint/shaping logic lands in TS — the routine is a
  prompt, so likely none.)
- **Modify:** `supabase/functions/donny-knowledge-sync/index.ts` (archive-aware + `source_hash`);
  `supabase/functions/aios-playbook-run/index.ts` (`get_internal_doc` archived filter);
  `supabase/functions/donny-chat/*` (internal `get_internal_doc` archived filter);
  `src/hooks/internal/useInternalDocs.ts`; `src/pages/internal/InternalStrategy.tsx`;
  `docs/DATABASE_SCHEMA.md` (new columns) + a PROJECT_CONTEXT workstream bullet.

## Build / deploy / verify

1. `npm run build` + `npm run typecheck` + `npm run test` (worktree cwd) green.
2. **Verify the join key** in prod (`execute_sql`) per Piece 3 pre-work *before* finalizing the RPCs.
3. Apply the migration to prod (Supabase MCP `apply_migration`) → `get_advisors(security)` clean for
   the new `SECURITY DEFINER` functions (anon/public revoked).
4. Confirm seed: `SELECT count(*) FROM internal_docs WHERE is_core` ≈ 21; every `docs/wiki/%` row is
   non-core.
5. Deploy `donny-knowledge-sync` via Supabase CLI (`--no-verify-jwt` preserved; bundles `../_shared/*`).
   Re-run `npm run sync:internal` (Bash tool, from the **main** checkout) and confirm: (a) an archived
   doc is **not** resurrected in `donny_knowledge`; (b) `source_hash` is now populated.
6. Run `dedup_candidate_pairs(0.9)` on prod → sanity-check known-similar pairs surface; tune the
   default threshold.
7. UI smoke: archive a throwaway **non-core** wiki doc → it leaves `donny_knowledge`, drops from the
   viewer + Donny/Dezzy `get_internal_doc`; un-archive → restored on next sync. Confirm the RPC
   **rejects** a core path (server-side, not just the hidden button).
8. Dry-run the audit routine prompt manually → findings land at `/internal/findings` with stable
   fingerprints (a second run bumps `occurrences`, doesn't duplicate).
9. `codex review --base main` (mandatory second reviewer) → fix → re-run clean; relay the verdict.
10. Post-merge: `knowledge-sync` (new wiki page `concepts/strategy-library-management.md` + index/log +
    RAG) then `verify-prod` both viewports. **Founder go-live:** redeploy `donny-chat`; create the
    monthly routine via `/schedule`.

## Invariants / safety

- **Core Files can never be archived or purged** — enforced in the RPC body (`is_core` guard), not just
  the UI. `is_core` is seeded on existing rows and set by a `BEFORE INSERT` trigger on future ones, so
  the "every non-`docs/wiki/%` path is core" rule holds for new files too; UPDATE never clobbers it, so
  a later manual wiki-page promotion sticks.
- **Archive is reversible**; the doc's markdown stays current for un-archive; nothing touches git.
- **Detection is deterministic** (cosine + exact hash in SQL); contradiction judgment is the routine's,
  but it only *files findings* — **the founder decides and acts**. Report-only: the audit never writes
  to `internal_docs`/`donny_knowledge`.
- **The sync never resurrects an archived doc** (archive-aware guard at the choke point).

## Deferred (out of scope)

Hard **purge** (PR-deleting the git file via a `wiki-commit-pr`-style flow); **auto-archiving** by
Donny; a **merge-two-docs-into-one** tool; a separate archive-history audit-log table (the row's
`archived_*` columns suffice for v1); and a **bi-weekly** cadence (monthly chosen).
