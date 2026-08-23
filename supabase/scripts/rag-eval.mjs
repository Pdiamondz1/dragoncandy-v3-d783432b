// rag-eval.mjs  (Node 18+, uses global fetch)
//
// Measures whether Donny's internal RAG actually retrieves the right thing — against 53 REAL
// queries taken from `donny_tool_executions`, not questions invented for the occasion.
//
//   npm run eval:rag
//
// Full method, results and limits: docs/wiki/concepts/rag-retrieval-evaluation.md
//
// WHY IT EXISTS. On 2026-08-23 the internal sync stopped truncating documents at 24,000 chars and
// started chunking them (see [[RAG Document Chunking]]). That fixed a third of the corpus being
// unreachable, but it also changed what a retrieval returns: `search_internal_knowledge` now gets
// chunks where it used to get whole documents, and five chunks can all come from one document.
// "The text is in the database" was verified; "Donny finds it" was not. This is that check.
//
// AUTH. Needs SUPABASE_SECRET_KEY (same key as the sync scripts). Query embeddings need the same
// model the index was built with; the OpenAI key is an edge secret, not available locally, so if
// OPENAI_API_KEY is set this calls OpenAI directly, and otherwise it borrows the server's key by
// writing short-lived internal-scope rows through donny-knowledge-sync and deleting them. Both
// paths produce identical vectors. The borrowed path is announced, and cleans up on the way out.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rank, controlSeparation, recallPrecision, tailShare } from "./rag-eval/score.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// TARGET comes from DONNY_SYNC_URL, exactly as the sync scripts take it — `with-env.mjs`
// documents that variable as the way to point at staging instead of prod. Hardcoding the prod
// ref here would silently ignore that override and write rows into production for someone who
// believed they were pointed at staging. This script CREATES AND DELETES rows, so the target has
// to be the one the caller chose.
const SYNC = process.env.DONNY_SYNC_URL
  ?? "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync";
const REST = SYNC.replace(/\/functions\/v1\/.*$/, "/rest/v1/");
if (REST === SYNC) {
  console.error(`DONNY_SYNC_URL does not look like a functions endpoint: ${SYNC}`);
  process.exit(1);
}
const OLD_CAP = 24_000;   // the truncation point this change removed
const K_MAX = 12;

// Prefix for the temporary rows this script writes when it has to borrow the server's embedding
// key. Rows carrying it are EXCLUDED from the index unconditionally: their content IS the query
// text, so a leftover from an interrupted run would rank against itself at ~1.0 and silently
// corrupt the controls, the tail share and the recall figures all at once — a report that looks
// spectacular and means nothing.
const TEMP_PREFIX = "internal-doc:ZZZ_RAGEVAL_Q";
const TEMP_DOC_PREFIX = "docs/ZZZ_RAGEVAL_Q";

const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Set SUPABASE_SECRET_KEY (the same key the sync scripts use).");
  process.exit(1);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const parseVec = (e) => (typeof e === "string" ? JSON.parse(e) : e);

/**
 * Delete every temporary evaluation row, from THIS run and from any earlier interrupted one, and
 * verify by re-reading. Returns null when both tables come back empty, or a message otherwise.
 *
 * Lives at top level, and runs on BOTH embedding paths. It used to sit inside the borrowed-key
 * branch, so a run with OPENAI_API_KEY set printed the warning promising a sweep and then never
 * swept — leaving internal-scope rows containing the query text retrievable indefinitely.
 *
 * Rows are read first and deleted BY ID, never by the `like` pattern used to find them: `_` is a
 * single-character LIKE wildcard, this prefix is full of them, and this is a DELETE.
 */
async function sweepTempRows() {
  // Never throws. It is called from a `finally`, and an exception raised there would replace the
  // error that got us into the finally, skip the reporting path, and leave the rows in place —
  // which is the exact outcome this function exists to prevent.
  try {
    return await sweep();
  } catch (e) {
    return `cleanup FAILED to run: ${e instanceof Error ? e.message : String(e)}. ` +
      `Prune: delete from donny_knowledge where metadata->>'source_id' like '${TEMP_PREFIX}%';`;
  }
}

async function sweep() {
  let failed = 0;
  for (const [table, sel, filter, keyName, prefix] of [
    ["donny_knowledge", "id,metadata", `metadata->>source_id=like.${TEMP_PREFIX}*`, "id", TEMP_PREFIX],
    ["internal_docs", "path", "path=like.docs/ZZZ_RAGEVAL_Q*", "path", TEMP_DOC_PREFIX],
  ]) {
    const rows = await (await fetch(`${REST}${table}?select=${sel}&${filter}`, { headers: H })).json();
    if (!Array.isArray(rows)) { failed++; continue; }
    for (const row of rows) {
      const idStr = table === "internal_docs" ? row.path : String(row.metadata?.source_id ?? "");
      if (!idStr.startsWith(prefix)) continue;   // literal re-check; the filter above is a LIKE
      const d = await fetch(`${REST}${table}?${keyName}=eq.${encodeURIComponent(row[keyName])}`, { method: "DELETE", headers: H });
      if (!d.ok) failed++;
    }
  }
  // Verified by RE-READING both tables, not by trusting the DELETE responses.
  const leftRag = await (await fetch(`${REST}donny_knowledge?select=id&metadata->>source_id=like.${TEMP_PREFIX}*`, { headers: H })).json();
  const leftDocs = await (await fetch(`${REST}internal_docs?select=path&path=like.docs/ZZZ_RAGEVAL_Q*`, { headers: H })).json();
  const nRag = Array.isArray(leftRag) ? leftRag.length : -1;
  const nDocs = Array.isArray(leftDocs) ? leftDocs.length : -1;
  if (failed === 0 && nRag === 0 && nDocs === 0) return null;
  return `cleanup incomplete — ${failed} DELETE(s) failed, ${nRag} donny_knowledge and ${nDocs} ` +
    `internal_docs row(s) remain. Prune: delete from donny_knowledge where ` +
    `metadata->>'source_id' like '${TEMP_PREFIX}%';`;
}

const { real, control } = JSON.parse(readFileSync(join(HERE, "rag-eval", "queries.json"), "utf8"));
const labelRows = JSON.parse(readFileSync(join(HERE, "rag-eval", "labels.json"), "utf8"));
const labelsByQuery = new Map();
for (const l of labelRows) {
  if (!labelsByQuery.has(l.query)) labelsByQuery.set(l.query, new Map());
  labelsByQuery.get(l.query).set(l.doc, l.relevant);
}

// ── the live index ───────────────────────────────────────────────────────────────────────────
const index = [];
let stale = 0;
for (let offset = 0; ; offset += 50) {
  const r = await fetch(`${REST}donny_knowledge?select=content,metadata,embedding&scope=eq.internal&order=id.asc&limit=50&offset=${offset}`, { headers: H });
  if (!r.ok) { console.error(`index read failed: ${r.status}`); process.exit(1); }
  const page = await r.json();
  if (page.length === 0) break;
  for (const row of page) {
    if (String(row.metadata?.source_id ?? "").startsWith(TEMP_PREFIX)) { stale++; continue; }
    index.push({
      id: row.metadata?.source_id,
      doc: row.metadata?.chunk_base ?? row.metadata?.source_id,
      path: row.metadata?.path,
      content: row.content,
      embedding: parseVec(row.embedding),
    });
  }
  if (page.length < 50) break;
}
console.log(`index: ${index.length} chunks, ${new Set(index.map((r) => r.doc)).size} documents`);
if (stale > 0) {
  console.warn(`WARNING: ${stale} leftover evaluation row(s) found and excluded from the index — a ` +
    `previous run was interrupted before cleanup.`);
}
// Unconditional, and BOTH tables. `stale` counts donny_knowledge rows only, so gating on it
// missed an interrupted run that cleared its RAG rows but left internal_docs behind — invisible
// to that counter and, on the OPENAI_API_KEY path, never swept at all. Two SELECTs when clean.
{
  const err = await sweepTempRows();
  if (err) console.warn(`startup sweep: ${err}`);
  else if (stale > 0) console.log("  leftovers removed (verified by re-reading both tables)");
}

// ── where does each chunk sit in its source document? ────────────────────────────────────────
// Needed for the one metric that requires no human judgment: how much of what we return is text
// the old 24,000-char slice could not have held.
function frontmatterStripped(raw, fallbackTitle) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return `${fallbackTitle}\n\n${raw}`;
  const title = (m[1].match(/^title:\s*(.*)$/m) ?? [])[1]?.trim() ?? fallbackTitle;
  return `${title}\n\n${m[2].trim()}`;
}
const docCache = new Map();
for (const row of index) {
  if (!row.path) { row.offset = -1; continue; }
  if (!docCache.has(row.path)) {
    try {
      const raw = readFileSync(join(HERE, "..", "..", row.path), "utf8");
      docCache.set(row.path, frontmatterStripped(raw, row.path.split("/").pop().replace(/\.md$/, "")));
    } catch { docCache.set(row.path, null); }
  }
  const doc = docCache.get(row.path);
  const body = row.content.replace(/^.*? — part \d+ of \d+\n\n/, "");
  // Several probes, because a chunk's opening is not always verbatim: `splitBlock` trims, and a
  // continuation piece has its section heading re-attached, so the first characters may not
  // appear in the source in that order. A probe from the middle of the body catches those.
  // Dropping from three probes to two cost 99 of 401 chunks — measured, not guessed.
  const probes = [body.slice(0, 200), body.slice(0, 80), body.slice(40, 160), body.slice(200, 320)];
  row.offset = doc ? probes.map((p) => (p.length > 20 ? doc.indexOf(p) : -1)).find((i) => i >= 0) ?? -1 : -1;
}
const located = index.filter((r) => r.offset >= 0).length;
console.log(`located in source: ${located}/${index.length}` +
  `${located < index.length ? ` (${index.length - located} unlocatable — hard-split or reflowed; excluded from the tail metric)` : ""}`);

// ── query embeddings ─────────────────────────────────────────────────────────────────────────
const all = [...real.map((q) => ({ q, kind: "real" })), ...control.map((q) => ({ q, kind: "control" }))];
const openai = process.env.OPENAI_API_KEY;
let vectors;

if (openai) {
  console.log("embedding queries via OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openai}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: all.map((x) => x.q) }),
  });
  if (!r.ok) { console.error(`embedding failed: ${r.status}`); process.exit(1); }
  vectors = (await r.json()).data.map((d) => d.embedding);
} else {
  console.log("no OPENAI_API_KEY — borrowing the server's key via short-lived internal rows (deleted below)");
  let mintError = null, cleanupError = null;
  const id = (i) => `internal-doc:ZZZ_RAGEVAL_Q${String(i).padStart(3, "0")}`;
  const path = (i) => `docs/ZZZ_RAGEVAL_Q${String(i).padStart(3, "0")}.md`;
  const pages = all.map((x, i) => ({
    source_id: id(i), content: x.q, scope: "internal", full_content: x.q,
    metadata: { title: `ragevalq${i}`, type: "internal_doc", path: path(i), tags: "" },
  }));
  try {
    for (let i = 0; i < pages.length; i += 40) {
      const r = await fetch(SYNC, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ pages: pages.slice(i, i + 40) }) });
      const b = await r.json();
      // THROW, never process.exit(): exit() skips `finally`, so a failure here would leave the
      // temporary rows in place — retrievable by internal Donny — which is precisely what the
      // cleanup below exists to prevent.
      if (!r.ok || b.errors) throw new Error(`mint failed: ${r.status} errors=${b.errors}`);
    }
    const rows = await (await fetch(`${REST}donny_knowledge?select=metadata,embedding&metadata->>source_id=like.internal-doc:ZZZ_RAGEVAL_Q*&limit=500`, { headers: H })).json();
    const byId = new Map(rows.map((r) => [r.metadata.source_id, parseVec(r.embedding)]));
    vectors = all.map((_, i) => byId.get(id(i)));
  } catch (e) {
    mintError = e;
  } finally {
    // Always clean up, including on failure — a leaked row is retrievable by internal Donny.
    cleanupError = await sweepTempRows();
    if (!cleanupError) console.log("temporary rows cleaned up (verified by re-reading both tables)");
  }
  // Surfaced only after cleanup has run, so the failure is reported AND the rows are gone.
  if (cleanupError) console.error(cleanupError);
  if (mintError) console.error(String(mintError.message ?? mintError));
  if (mintError || cleanupError) process.exit(1);
}
if (vectors.some((v) => !v)) { console.error("some query embeddings are missing; aborting"); process.exit(1); }

// ── rank ─────────────────────────────────────────────────────────────────────────────────────
const ranked = all.map((x, i) => {
  const hits = rank(vectors[i], index).slice(0, 40);
  return { query: x.q, kind: x.kind, top1: hits[0].sim, hits };
});
const realR = ranked.filter((r) => r.kind === "real");

// ── 1. controls first: is similarity informative? ────────────────────────────────────────────
const sep = controlSeparation(realR.map((r) => r.top1), ranked.filter((r) => r.kind === "control").map((r) => r.top1));
console.log(`\n1. CONTROLS  real top-1 ${sep.realMin.toFixed(3)}–${sep.realMax.toFixed(3)} | ` +
  `control ${sep.controlMin.toFixed(3)}–${sep.controlMax.toFixed(3)}`);
console.log(`   controls scoring above the weakest real query: ${sep.controlsAboveWeakestReal}/${sep.controlCount}` +
  `${sep.controlsAboveWeakestReal === 0 ? "  — separated; the numbers below mean something" : "  — OVERLAP: treat everything below as unreliable"}`);

// ── 2. tail: what the old truncating index could not have returned ───────────────────────────
console.log("\n2. TAIL (text beyond the old 24,000-char cut)");
for (const k of [5, 10]) {
  const t = tailShare(realR.map((r) => ({ offsets: r.hits.slice(0, k).map((h) => h.row.offset).filter((o) => o >= 0) })), OLD_CAP);
  console.log(`   k=${String(k).padStart(2)}  ${(t.share * 100).toFixed(1)}% of located hits  |  ${t.queriesTouched}/${t.queries} queries surface at least one`);
}

// ── 3. recall/precision over the labelled pool ───────────────────────────────────────────────
const rows = recallPrecision(realR.map((r) => ({ query: r.query, docs: r.hits.map((h) => h.row.doc) })), labelsByQuery, K_MAX);
const labelled = realR.filter((r) => labelsByQuery.has(r.query)).length;
console.log(`\n3. RECALL / PRECISION  (${labelled} of ${realR.length} queries carry relevance labels)`);
console.log("   k   recall  precision  unjudged-in-k  queries with a hit");
for (const r of rows) {
  console.log(`  ${String(r.k).padStart(2)}   ${(r.recall * 100).toFixed(0).padStart(4)}%     ${(r.precision * 100).toFixed(0).padStart(4)}%` +
    `        ${String(r.unknown).padStart(3)}            ${r.queriesWithAHit}/${labelled}`);
}
const at5 = rows[4], at10 = rows[9];
console.log(`\n   k=5 recall ${(at5.recall * 100).toFixed(0)}%  vs  k=10 recall ${(at10.recall * 100).toFixed(0)}%` +
  `  — search_internal_knowledge currently asks for 10.`);
console.log("   'unjudged-in-k' is the honest part: those documents were never assessed, so they");
console.log("   count as neither hit nor miss. A large number means this report is guessing.");
