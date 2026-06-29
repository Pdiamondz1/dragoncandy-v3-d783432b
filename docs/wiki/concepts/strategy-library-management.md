---
title: Strategy Library Management
type: concept
created: 2026-06-29
updated: 2026-06-29
sources: [2026-06-29-strategy-library-management]
tags: [aios, internal-docs, donny-rag, archive, audit, dedup, security-definer]
---
# Strategy Library Management

How the DC AIOS **strategy library** is kept clean: a reversible **archive** for unneeded docs,
**Core-File protection** so canon can never be removed, and a **monthly audit** that surfaces
duplicate / contradictory / orphaned / bloated docs for the founder to act on. Built on existing
AIOS rails ([[Founder Playbooks]]-style routine → [[AIOS Internal Shell]] findings; admin-gated
`SECURITY DEFINER` RPCs).

## What the strategy library is

`internal_docs` is a **projection of git docs** synced by the `donny-knowledge-sync` edge function
(via `supabase/scripts/sync-internal-docs.mjs`), keyed by `path`:
~21 top-level `docs/*.md` (the **Core Files** — PROJECT_CONTEXT, DATABASE_SCHEMA, briefings, moat
playbook, pricing…) + ~60 `docs/wiki/**` pages. The same content feeds Internal Donny's RAG
(`donny_knowledge`, scope `internal`) and Dezzy's `get_internal_doc` tool. The wiki half grows
continuously (autoresearch, wiki-save-answer, wiki-import-doc, Loop Scout, [[Knowledge-Sync Automation]]), so it
accumulates near-duplicate / conflicting / stale pages over time.

## The three traps that make deletion hard

1. **The sync is insert/update-only — it never deletes.** A bare DB delete is *not durable*: the next
   `sync:internal` re-inserts the row from the still-present on-disk file.
2. **Deleting the git file orphans the DB rows** (the sync won't clean them up).
3. **No similarity logic existed** — though the pgvector embeddings (`<=>` cosine, see
   [[Self-Improving App]]'s `match_donny_knowledge`) and the dormant `internal_docs.source_hash`
   column were already there.

## Design (founder-approved)

- **Archive, not delete.** A reversible soft-archive (`archived_at` / `archived_by` / `archive_reason`)
  pulls a doc out of Donny/Dezzy retrieval + the viewer immediately, but keeps it recoverable — no git
  surgery, no resurrection. Hard *purge* (PR-deleting the git file) is deferred (YAGNI).
- **Founder acts directly.** The audit *detects*; the founder clicks Archive on `/internal/strategy`.
  No corrections-gate round-trip — that gate is for Donny mutating live values, not founder
  housekeeping.
- **`is_core` protection, enforced server-side.** Seeded `true` on every non-`docs/wiki/%` path; a
  `BEFORE INSERT` trigger keeps future top-level docs protected; the archive RPC **refuses** a core doc
  (a body guard, not just a hidden button).

## Keystone — archive survives re-sync

Archiving deletes the `donny_knowledge` row + sets `archived_at`. The next sync would re-INSERT the
RAG row (select-by-source_id finds nothing → insert), resurrecting the doc. **Fix:**
`donny-knowledge-sync` is **archive-aware** — for an internal page it upserts `internal_docs` first,
reads back `archived_at`, and if archived it **skips the RAG write** (and self-heals any stray row).
Placed at the single RAG-write choke point so it covers every caller (the sync scripts **and**
`wiki-merge-pr`). The skip is **fail-open** on a DB error (archived → false → RAG proceeds; self-heals
next sync).

## Pieces

| Piece | What |
|-|-|
| Schema (`20260629120000_…`) | `is_core` + archive triple; seed; `internal_docs_set_is_core` trigger (`search_path = ''`); 4 RPCs |
| Detection RPCs (service-role) | `dedup_candidate_pairs(threshold)` (cosine self-join over internal RAG rows) + `internal_doc_exact_dupes()` (group by `source_hash`) |
| Archive RPCs (admin) | `internal_doc_archive(path,reason)` (core-guarded; deletes RAG row) + `internal_doc_unarchive(path)` (restored on next sync) |
| Archive-aware sync | `donny-knowledge-sync` skips RAG for archived docs + computes `source_hash` |
| Readers | `.is('archived_at', null)` on `get_internal_doc` in `aios-playbook-run` + `donny-chat` |
| UI | `/internal/strategy` Active/Archived toggle, "Core" badge, admin-gated Archive/Un-archive (AlertDialog) |
| Routine | monthly `strategy-library-audit-agent` → dupe/conflict/orphan/bloat findings at `/internal/findings` |

## Audit routine

A monthly cloud routine (modeled on [[Self-Improving App]]'s Loop Scout) calls the two detection RPCs,
reads `internal_docs` for orphans + bloat, judges contradiction vs benign overlap on each candidate
pair, and files **report-only**, fingerprint-deduped findings (`strategy-dupe`/`-exact`/`-conflict`/
`-stale`/`-bloat`) through the `aios-report-ingest` choke point. The founder triages at
`/internal/findings` and archives via the UI. **Orphan signal:** the sync re-stamps `updated_at`
every run, so a non-core doc whose `updated_at` is old has *stopped being synced* (its source file
left the repo) — a useful "probable orphan" signal, not "stale content".

## Key Decisions

- Reversible archive over hard delete; `is_core` flag over a path-prefix rule (lets a specific wiki
  page be promoted later) over a config list.
- Service-role detection RPCs (no in-body admin gate — `auth.uid()` is null under the routine's
  service role; the grant is the gate), mirroring `dre_pending_events`. Archive RPCs stay admin-gated
  (browser-called). See [[SECURITY DEFINER Advisor Triage]].
- The full `sync:internal` doubles as the one-time `source_hash` backfill.

## Known Issues / Gotchas

- A trigger function with no fixed `search_path` adds a `function_search_path_mutable` advisor — pin it
  (`''` is safe when the body touches no schema objects).
- The `is_core` trigger fires on the proposed tuple even for `INSERT … ON CONFLICT DO UPDATE`; a manual
  wiki-page promotion survives re-sync because the upsert `SET` clause **omits `is_core`**, not because
  the trigger skips UPDATE.
- `/internal/strategy` is `tier="stakeholder"`, so the Archive controls are gated on
  `useInternalAccess().isAdmin` in the component (the RPC body is the real enforcement).
- Hard purge of the git file is deferred — archiving leaves the file in git (out of every store that
  matters).

## See Also

- [[AIOS Internal Shell]] — the `/internal` surface + the findings rail the audit files to
- [[Founder Playbooks]] / [[Self-Improving App]] — the routine + Loop-Scout pattern this models on
- [[SECURITY DEFINER Advisor Triage]] — the grant/advisor posture for the new RPCs
- [[Knowledge-Sync Automation]] — the insert/update-only sync this work made archive-aware + a flow that grows the library
