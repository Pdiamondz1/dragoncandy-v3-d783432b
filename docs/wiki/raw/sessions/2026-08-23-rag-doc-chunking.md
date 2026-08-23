# Session — a third of the internal corpus reached Donny in no form at all (2026-08-23)

## How it was found

Not by looking for it. The session's actual task (#469) had merged, main had been refreshed,
and the post-merge hook had reported `updated=142 errors=0`. Every signal said the knowledge
layer was current.

The `knowledge-sync` skill says to verify by **content, never by `max(updated_at)`**. Following
that literally — searching `donny_knowledge` for a string written into `DESIGN_SYSTEM.md` that
morning — returned **zero rows**:

```
PublicPageHeader.test.tsx     count=*/0
HelpCenter.test.tsx           count=0-0/1     <- matched SHIPPED_LOG, not DESIGN_SYSTEM
```

The `internal-doc:DESIGN_SYSTEM` row was **exactly 24,000 characters** against a 30,668-char
source file, cut mid-sentence inside the safe-area rule.

## The defect

`sync-internal-docs.mjs` sent `${title}\n\n${body}`.slice(0, MAX_EMBED_CHARS)` with
`MAX_EMBED_CHARS = 24_000`. The comment beside it read:

> `// embed input is truncated; full_content is not`

That is true and it describes the **wrong consumer**. `full_content` is upserted into
`internal_docs`, which only the `/internal/strategy` viewer reads.
`donny-orchestrator/rag.ts` returns `donny_knowledge.content` on **both** its paths — the
`match_donny_knowledge` cosine RPC and the FTS fallback — and never touches `internal_docs`.
So the mitigation named in the comment does not reach the consumer of the data.

Measured on prod, 2026-08-23:

| | |
|---|---|
| internal documents | 142 |
| total source chars | 2,168,995 |
| chars embedded per run | 1,445,867 |
| **never embedded** | **723,128 (33%)** |
| rows pinned at exactly 24,000 | 14 |

Worst offenders: `SHIPPED_LOG.md` 505,021 chars (5% reached Donny), `PROJECT_CONTEXT.md`
91,841 (26%), `prd.md` 61,433 (39%), `DATABASE_SCHEMA.md` 47,280 (51%), `DESIGN_SYSTEM.md`
30,668 (78%).

It had been this way since **2026-06-11** — the `created_at` on the DESIGN_SYSTEM row.

## The fix

Chunking, at ~6,000 chars, split on markdown heading boundaries, each chunk carrying the
document name so a chunk retrieved alone still says what it is. Chunk 0 keeps the
**unsuffixed** `source_id` and chunk N takes `<id>#N` — which is what makes it deployable:
nothing in this pipeline deletes a row whose id stopped being produced, so renaming all 142
ids would have stranded all 142 rows.

Chunking is also **cheaper at read time**. `retrieveContext` returns a fixed number of rows;
at the old cap one retrieval could push 120,000 characters into Donny's prompt.

### SHIPPED_LOG is excluded, not chunked

505k chars of raw newest-first changelog — a quarter of the corpus, 85 chunks on its own,
competing for the retrieval slots with pages the wiki writes specifically **for** retrieval.
It is stored in `internal_docs` (fully readable at `/internal/strategy`) and not embedded. Its
existing row, which held only the newest 5%, is deleted.

That is a deliberate exclusion printed on every run, not a silent truncation.

### Chunking runs SERVER-SIDE, and that was the hard-won part

The first version chunked in `sync-internal-docs.mjs`. Codex found the flaw at review round 3:
there are **two producers**, not one. `wiki-merge-pr` builds its payload through
`_shared/wiki-sync-payload.ts`, whose own header requires it to "reproduce the EXACT
per-wiki-page payload `sync-internal-docs.mjs` POSTs" — and it still truncated at 24k.

Consequence: after a full sync created continuation chunks, an incremental merge→sync would
overwrite chunk 0 with a truncated whole-document row and leave `#1…#N` in place. Donny would
serve **a truncated head spliced onto a stale tail** — worse than the original bug.

Fixing it in both producers leaves two things that must agree. Chunking moved into
`donny-knowledge-sync`, so a producer sends a *document* and knows nothing about chunks. A
third producer added later cannot get it wrong.

## Codex findings (3 real, all mine)

1. **P2 — `purgeRag()` swallowed every Supabase error**, so a failed delete still recorded
   `skipped-unindexed` and the run finished `errors=0` with the document still retrievable.
   The same silent-success shape as the truncation itself. Also fixed: `chunkSiblings()`
   returned `[]` on a *failed* read, indistinguishable from a genuinely empty result; and the
   archive path had swallowed its delete error since before this change.
2. **P2 — sibling lookup used `LIKE`.** `_` is a single-character `LIKE` wildcard and our ids
   are full of them (`DESIGN_SYSTEM`, `SHIPPED_LOG`, `DATABASE_SCHEMA`), and that list feeds
   DELETE. Checked before dismissing it: **0 collisions across all 142 real ids today** — but
   that is a property of the filenames, not of the code. Replaced with an exact `.eq()` on a
   new `metadata.chunk_base`, which has no pattern semantics at all.
3. **P1 — the second producer** (above).

## Durable lessons

- **A mitigation has to reach the consumer of the data.** "The full text is still in
  `internal_docs`" was true and irrelevant, because `internal_docs` is not what Donny reads.
  Name the reader, not the store.
- **Verify by content, and pick a token that cannot straddle a line-wrap.** This bit twice in
  one session: once as the false-negative that hid a docs sync in the morning, and again when
  the first draft of the regression test asserted on `"is the document's scroll container"` —
  which wraps after `document's` — and failed against a file that plainly contains it.
- **One producer, or the rule lives in two places and drifts.** The wiki-sync-payload header
  had *written down* that it must match the script exactly. Writing it down did not make it
  hold; removing the decision from both callers did.
- **A test that passes on every fixture may be pinning nothing.**
  `expect(page.content.length).toBeLessThanOrEqual(24_000)` had never seen an input over 24k.

## Files

- `supabase/functions/_shared/chunk-doc.ts` (new, moved from `scripts/chunk-doc.mjs`)
- `supabase/functions/_shared/chunk-doc.test.ts` (new, 8 tests, controlled)
- `supabase/functions/donny-knowledge-sync/index.ts`
- `supabase/functions/_shared/wiki-sync-payload.ts` + `.test.ts`
- `supabase/functions/donny-chat/index.ts` (`search_internal_knowledge` 5 → 10 rows)
- `supabase/scripts/sync-internal-docs.mjs`, `supabase/scripts/sync-wiki-to-donny.mjs`

## Pending

- `donny-knowledge-sync` **must be deployed before this merges** — the new script omits
  `content` for the unindexed document, which the old function rejects.
- After deploy + merge: run the sync and re-probe by content.
