// chunk-doc.mjs
//
// Splits a long markdown document into retrieval-sized pieces for Donny's RAG.
//
// WHY THIS EXISTS. `sync-internal-docs.mjs` used to send `${title}\n\n${body}`.slice(0, 24_000).
// The comment beside that slice read "embed input is truncated; full_content is not" — true, but
// it describes the wrong consumer. `full_content` lands in `internal_docs`, which only the
// /internal/strategy viewer reads. `donny-orchestrator/rag.ts` returns
// `donny_knowledge.content` on BOTH its paths (the cosine RPC and the FTS fallback) and never
// touches `internal_docs`. So the tail of every oversize doc reached Donny in no form at all:
// measured 2026-08-23, 13 of 142 files were over the cap and 723,000 of the corpus's 2,168,995
// characters — a third of it — were never embedded. `DESIGN_SYSTEM.md`'s row cut off mid-sentence
// inside the safe-area rule, dropping every design rule written after it.
//
// The slice was also silent. It reported `updated=142 errors=0` and moved `updated_at`, so every
// available signal said the sync had worked. Only searching the stored text for a string written
// that morning showed the tail missing. See [[Knowledge Sync]].
//
// Chunking is additionally CHEAPER at read time, not just more complete. `retrieveContext`
// returns 5 rows; at the old cap one retrieval could push 120,000 characters into Donny's prompt,
// where 5 chunks of this size push ~30,000.

// Target size for one chunk. Chosen for retrieval quality, not for the API ceiling: a 24k
// embedding is a blurry average of everything in it, so a smaller chunk matches a specific
// question far better. The embedding API's own cliff is much higher — empirically between 29,865
// and 33,369 chars (the calibration recorded in sync-wiki-to-donny.mjs) — so this leaves a wide
// margin and HARD_MAX below is the real guard.
export const TARGET_CHARS = 6_000;

// Nothing may leave here larger than this. Well under the observed ~30k cliff, so a chunk can
// never fail its whole embedding batch the way an oversize consumer page does.
export const HARD_MAX_CHARS = 20_000;

// Room reserved inside the budget for the "<title> — part N of M" prefix each chunk carries.
const PREFIX_RESERVE = 160;

/**
 * Split markdown into blocks at heading boundaries.
 * A block is one heading line plus everything up to the next heading — so a split between blocks
 * always lands on a section boundary a human would recognise.
 * Text before the first heading (frontmatter-stripped preamble) forms block 0 with no heading.
 */
function splitIntoBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];
  let current = { heading: "", lines: [] };

  for (const line of lines) {
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
function splitBlock(block, budget) {
  const pieces = [];
  const paragraphs = block.text.split(/\n\n+/);
  let buf = "";

  const flush = () => {
    if (buf.trim()) pieces.push(buf.trim());
    buf = "";
  };

  for (const para of paragraphs) {
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
 * @param {string} title  document title, repeated on every chunk so a chunk stands alone
 * @param {string} body   markdown body, frontmatter already stripped
 * @param {number} target soft budget per chunk
 * @returns {string[]} one or more chunk bodies, each <= HARD_MAX_CHARS
 *
 * A document that already fits returns EXACTLY `${title}\n\n${body}` — byte-identical to what the
 * pre-chunking sync sent for it. Measured 2026-08-23: 55 of the 142 internal documents are a
 * single chunk at this target, 86 split, and 1 (SHIPPED_LOG.md) is not embedded at all.
 */
export function chunkDocument(title, body, target = TARGET_CHARS) {
  const whole = `${title}\n\n${body}`;
  if (whole.length <= target) return [whole];

  const budget = Math.max(500, target - PREFIX_RESERVE);
  const blocks = splitIntoBlocks(body);

  // Pack whole blocks together, splitting only a block that cannot fit on its own.
  const packed = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) packed.push(buf.trim());
    buf = "";
  };

  for (const block of blocks) {
    if (block.text.length > budget) {
      flush();
      packed.push(...splitBlock(block, budget));
      continue;
    }
    if (buf && buf.length + 2 + block.text.length > budget) flush();
    buf = buf ? `${buf}\n\n${block.text}` : block.text;
  }
  flush();

  if (packed.length === 0) return [whole.slice(0, HARD_MAX_CHARS)];
  if (packed.length === 1) return [`${title}\n\n${packed[0]}`];

  const total = packed.length;
  return packed.map((text, i) => {
    const chunk = `${title} — part ${i + 1} of ${total}\n\n${text}`;
    // The reserve should make this unreachable; slicing here rather than shipping an oversize
    // chunk that could 502 its entire embedding batch.
    return chunk.length > HARD_MAX_CHARS ? chunk.slice(0, HARD_MAX_CHARS) : chunk;
  });
}

/**
 * The source_id for chunk `i` of `total`.
 *
 * Chunk 0 keeps the UNSUFFIXED id. This is the property that makes the change safe to deploy:
 * every single-chunk doc keeps the id it already has, so its row updates in place instead of
 * being orphaned. Nothing in this system deletes a row whose source_id stopped being produced
 * (the orphan class sync-wiki-to-donny.mjs documents at length), so renaming all 142 ids would
 * strand all 142 rows.
 */
export function chunkSourceId(baseSourceId, index) {
  return index === 0 ? baseSourceId : `${baseSourceId}#${index}`;
}
