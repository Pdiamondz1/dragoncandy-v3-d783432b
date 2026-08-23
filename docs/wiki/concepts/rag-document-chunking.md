---
title: RAG Document Chunking
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: [2026-08-23-rag-doc-chunking.md]
tags: [donny-rag, knowledge-sync, edge-functions, embeddings, silent-failure]
---
# RAG Document Chunking

How a repo document becomes rows in `donny_knowledge` — and the three years' worth of habit
that had to change to stop a third of the corpus being thrown away in silence.

## The defect this page exists because of

`sync-internal-docs.mjs` sent `` `${title}\n\n${body}`.slice(0, 24_000) ``. Beside it:

> `// embed input is truncated; full_content is not`

**True, and about the wrong consumer.** `full_content` is upserted into `internal_docs`, which
only the `/internal/strategy` viewer reads. `donny-orchestrator/rag.ts` returns
`donny_knowledge.content` on **both** its paths — the `match_donny_knowledge` cosine RPC *and*
the FTS fallback — and never touches `internal_docs`. The stated mitigation never reached the
reader it was supposed to protect.

Measured on prod 2026-08-23: **142 documents, 2,168,995 chars, 1,445,867 embedded — 723,128
(33%) reaching Donny in no form at all**, across 14 rows pinned at exactly 24,000. In place
since 2026-06-11.

| Document | Chars | Reached Donny |
|---|---|---|
| `SHIPPED_LOG.md` | 505,021 | 5% |
| `PROJECT_CONTEXT.md` | 91,841 | 26% |
| `prd.md` | 61,433 | 39% |
| `DATABASE_SCHEMA.md` | 47,280 | 51% |
| `DESIGN_SYSTEM.md` | 30,668 | 78% |

`DESIGN_SYSTEM.md`'s row stopped mid-sentence inside the safe-area rule, so every design rule
written after that point — including three added the same morning — was absent.

**It was silent in every available signal.** The run printed `updated=142 errors=0` and
`updated_at` moved. It surfaced only from following [[Knowledge-Sync Automation]]'s own
instruction to verify by **content**: `content ilike '%PublicPageHeader.test.tsx%'` → 0 rows.

## The shape now

- **`_shared/chunk-doc.ts`** splits at markdown heading boundaries into ~6,000-char pieces
  (`TARGET_CHARS`), hard-capped at `HARD_MAX_CHARS` = 20,000. A paragraph over budget is
  hard-sliced — the only place anything cuts mid-sentence. Continuation pieces re-state their
  heading, and every chunk of a split document is prefixed `"<title> — part N of M"`, so a
  chunk retrieved alone still says what it is.
- **Chunk 0 keeps the unsuffixed `source_id`;** chunk N takes `<id>#N`. This is what makes the
  change deployable rather than destructive: nothing in this pipeline deletes a row whose id
  stopped being produced (the orphan class [[Donny RAG Scope Boundary]] documents), so
  renaming all 142 ids would have stranded all 142 rows.
- **`metadata.chunk_base`** is on every row, single-chunk documents included. Sibling lookup
  matches it with `.eq()`.
- **Shrinkage is handled**: after writing a document's chunks, siblings with an index at or
  past the new total are deleted. Otherwise a document going 6 chunks → 4 leaves `#4` and `#5`
  being served as current text.

### Chunking is cheaper to read, not just more complete

`retrieveContext` returns a fixed row count. At the old cap one retrieval could push **120,000
characters** into Donny's prompt. Mean chunk is 4,162 chars against the old mean row of
10,111 — so `search_internal_knowledge` went 5 → **10** rows and still sends *less* text
(~42k vs ~51k) while covering more distinct material. **Raising the row count was required,
not optional**: at 5 rows a chunked corpus can return five pieces of one document where it
used to return five documents.

## Two decisions worth keeping

**SHIPPED_LOG.md is excluded from the RAG, not chunked** (`index_in_rag: false`). 505k chars
of raw newest-first changelog would be 85 of ~400 rows, a quarter of the index, competing for
retrieval slots with wiki pages written specifically *for* retrieval. It stays fully readable
in `internal_docs` at `/internal/strategy`. The distinction that matters: this is a
**deliberate exclusion printed on every run**, where the thing it replaced was a silent
truncation.

**Chunking happens server-side, in `donny-knowledge-sync`.** The first implementation chunked
in the sync script, and Codex found why that fails: there are **two producers**.
`wiki-merge-pr` builds its payload through `_shared/wiki-sync-payload.ts`, whose own header
requires it to *"reproduce the EXACT per-wiki-page payload `sync-internal-docs.mjs` POSTs"* —
and it still truncated. After a full sync created continuation chunks, an incremental
merge→sync would overwrite chunk 0 with a truncated whole-document row and leave `#1…#N` in
place: **a truncated head spliced onto a stale tail**, worse than the original bug. Callers now
send a *document* and know nothing about chunks.

## Known Issues

- Requires `donny-knowledge-sync` deployed **before** the script change merges: the new script
  omits `content` for the unindexed document, which the old function rejects with a 400 that
  fails its whole 20-page batch.
- Rows written before this change carry no `chunk_base`. Harmless — nothing was chunked, so
  they have no siblings — and the orphan check treats such a row as its own base.
- The orphan check is **read-only** by design, matching `sync-wiki-to-donny.mjs`: a sync script
  with DELETE over `donny_knowledge` has a worse blast radius on a bad filter than the drift it
  would fix. It prints the SQL for a human.

## Key Decisions

- **Name the reader, not the store.** "The full text is still in `internal_docs`" was true and
  irrelevant. A mitigation is only a mitigation if it reaches the consumer of the data.
- **One producer, or the rule drifts.** `wiki-sync-payload.ts` had the invariant *written in
  its own header* and still broke it. Writing a rule down does not make it hold; removing the
  decision from the callers does. Same lesson as [[Donny RAG Scope Boundary]]'s dead
  `SYNC_CURATE` flag.
- **A gate must be about the same thing as the claim it licenses.** `expect(page.content.length)
  .toBeLessThanOrEqual(24_000)` passed on every fixture because no fixture was that big — it
  pinned nothing at all.
- **`LIKE` is not string matching.** `_` is a single-character wildcard and our ids are full of
  them (`DESIGN_SYSTEM`, `SHIPPED_LOG`, `DATABASE_SCHEMA`), on a query feeding DELETE. There
  are 0 collisions across the 142 real ids **today** — checked, not assumed — but that is a
  property of the filenames, not of the code.
- **Report every purge failure.** `purgeRag()` originally swallowed Supabase errors, so a
  failed delete recorded `skipped-unindexed` and the run ended `errors=0` with the document
  still retrievable — the same silent-success shape as the truncation.

## See Also

- [[Knowledge-Sync Automation]] — the sync plumbing this changes, and the content-verification
  rule that surfaced the defect
- [[Donny RAG Scope Boundary]] — who can retrieve what from the same table; source of the
  orphan-row class
- [[Self-Improving App]] — the content loop this is the transport for
- [[Updated-At Trigger Drift]] — the other case of "recorded ≠ actual" in this codebase
