// supabase/functions/_shared/chunk-doc.ts
//
// Splits a long document into retrieval-sized pieces for Donny's RAG.
//
// WHY THIS EXISTS. `sync-internal-docs.mjs` used to send `${title}\n\n${body}`.slice(0, 24_000).
// The comment beside that slice read "embed input is truncated; full_content is not" — true, but
// it describes the wrong consumer. `full_content` lands in `internal_docs`, which only the
// /internal/strategy viewer reads. `donny-orchestrator/rag.ts` returns
// `donny_knowledge.content` on BOTH its paths (the cosine RPC and the FTS fallback) and never
// touches `internal_docs`. So the tail of every oversize document reached Donny in no form at
// all: measured 2026-08-23, 13 of 142 files were over the cap and 723,000 of the corpus's
// 2,168,995 characters — a third of it — were never embedded. `DESIGN_SYSTEM.md`'s row cut off
// mid-sentence inside the safe-area rule, dropping every design rule written after it.
//
// The slice was also silent. It reported `updated=142 errors=0` and moved `updated_at`, so every
// available signal said the sync had worked. Only searching the stored text for a string written
// that morning showed the tail missing.
//
// WHY IT LIVES IN _shared AND RUNS SERVER-SIDE. There are two producers, not one:
// `sync-internal-docs.mjs` (the full sync) and `_shared/wiki-sync-payload.ts` (the incremental
// merge→sync path used by `wiki-merge-pr`), and that file's own header requires it to
// "reproduce the EXACT per-wiki-page payload". A first version of this change chunked in the
// script only, which broke that invariant: an incremental update would overwrite chunk 0 with a
// truncated whole-document row and leave the previous run's continuation chunks in place, so
// Donny would serve a truncated head spliced onto a stale tail. Chunking where the rows are
// written — once — means a producer only has to send a document, and a third producer added
// later cannot get it wrong.
//
// Chunking is additionally CHEAPER at read time, not just more complete. `retrieveContext`
// returns a handful of rows; at the old cap one retrieval could push 120,000 characters into
// Donny's prompt, where the same number of chunks pushes a fraction of that.

// Target size for one chunk. Chosen for retrieval quality, not for the API ceiling: a 24k
// embedding is a blurry average of everything in it, so a smaller chunk matches a specific
// question far better. The embedding API's own cliff is much higher — empirically between 29,865
// and 33,369 chars (the calibration recorded in sync-wiki-to-donny.mjs) — so this leaves a wide
// margin and HARD_MAX_CHARS below is the real guard.
export const TARGET_CHARS = 6_000;

// Nothing may leave here larger than this. Well under the observed ~30k cliff, so a chunk can
// never fail its whole embedding batch.
export const HARD_MAX_CHARS = 20_000;

// Room reserved inside the budget for the "<label> — part N of M" prefix each chunk carries.
const PREFIX_RESERVE = 160;

interface Block {
  heading: string;
  text: string;
}

/**
 * Split markdown into blocks at heading boundaries.
 * A block is one heading line plus everything up to the next heading — so a split between blocks
 * always lands on a section boundary a human would recognise.
 * Text before the first heading forms block 0 with no heading.
 */
function splitIntoBlocks(body: string): Block[] {
  const blocks: { heading: string; lines: string[] }[] = [];
  let current = { heading: "", lines: [] as string[] };

  for (const line of body.split("\n")) {
    if (/^#{1,6} /.test(line)) {
      if (current.lines.length > 0 || current.heading) blocks.push(current);
      current = { heading: line, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.heading) blocks.push(current);

  return blocks
    .map((b) => ({ heading: b.heading, text: b.lines.join("\n") }))
    .filter((b) => b.text.trim().length > 0);
}

/**
 * Break one oversized block into budget-sized pieces.
 * Paragraph boundaries first; a single paragraph over budget is hard-sliced, which is the only
 * place this file ever cuts mid-sentence. Continuation pieces re-state the block's heading so an
 * isolated chunk still says what section it belongs to.
 */
function splitBlock(block: Block, budget: number): string[] {
  const pieces: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf.trim()) pieces.push(buf.trim());
    buf = "";
  };

  for (const para of block.text.split(/\n\n+/)) {
    if (para.length > budget) {
      flush();
      for (let i = 0; i < para.length; i += budget) pieces.push(para.slice(i, i + budget));
      continue;
    }
    if (buf && buf.length + 2 + para.length > budget) flush();
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  flush();

  // Piece 0 already opens with the heading line (it is the first line of block.text).
  return pieces.map((p, i) => (i === 0 || !block.heading ? p : `${block.heading}\n\n${p}`));
}

/**
 * Chunk a document for embedding.
 *
 * @param text   the document as the producer composed it (title line, blank line, body)
 * @param label  document name, repeated on every continuation chunk so a chunk stands alone
 * @param target soft budget per chunk
 * @returns one or more chunk bodies, each <= HARD_MAX_CHARS
 *
 * A document that already fits is returned UNCHANGED — byte-identical to what the pre-chunking
 * sync sent for it, so its existing row updates in place rather than churning. Measured
 * 2026-08-23: 55 of the 142 internal documents are a single chunk at this target and 86 split.
 */
export function chunkDocument(text: string, label: string, target = TARGET_CHARS): string[] {
  if (text.length <= target) return [text];

  const budget = Math.max(500, target - PREFIX_RESERVE);
  const packed: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) packed.push(buf.trim());
    buf = "";
  };

  // Pack whole blocks together, splitting only a block that cannot fit on its own.
  for (const block of splitIntoBlocks(text)) {
    if (block.text.length > budget) {
      flush();
      packed.push(...splitBlock(block, budget));
      continue;
    }
    if (buf && buf.length + 2 + block.text.length > budget) flush();
    buf = buf ? `${buf}\n\n${block.text}` : block.text;
  }
  flush();

  if (packed.length <= 1) return [text.slice(0, HARD_MAX_CHARS)];

  const total = packed.length;
  return packed.map((piece, i) => {
    const chunk = `${label} — part ${i + 1} of ${total}\n\n${piece}`;
    // The reserve should make this unreachable; slicing rather than shipping an oversize chunk
    // that could fail its entire embedding batch.
    return chunk.length > HARD_MAX_CHARS ? chunk.slice(0, HARD_MAX_CHARS) : chunk;
  });
}

/**
 * The source_id for chunk `index`.
 *
 * Chunk 0 keeps the UNSUFFIXED id. This is the property that makes the change safe to deploy:
 * every single-chunk document keeps the id it already has, so its row updates in place instead
 * of being orphaned. Nothing in this system deletes a row whose source_id stopped being produced
 * (the orphan class sync-wiki-to-donny.mjs documents at length), so renaming all 142 ids would
 * strand all 142 rows.
 */
export function chunkSourceId(baseSourceId: string, index: number): string {
  return index === 0 ? baseSourceId : `${baseSourceId}#${index}`;
}
