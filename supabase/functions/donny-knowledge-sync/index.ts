// donny-knowledge-sync
// Gated sync of verified wiki pages into Donny's RAG store (donny_knowledge).
// Part of the autoresearch loop: one research loop, two learners (wiki + Donny).
//
// - Service-role only (writes to donny_knowledge, which is service-role RLS).
// - Embeds each page with OpenAI text-embedding-3-small (1536d), matching the
//   existing embedding path so retrieval (match_donny_knowledge) just works.
// - Idempotent, keyed on metadata.source_id ("wiki:<path>"). Re-syncing updates rather than
//   duplicating.
//
// CHUNKING HAPPENS HERE, not in the callers. A page longer than the chunker's target is stored
// as several rows: chunk 0 under the plain source_id and chunk N under "<id>#N". Callers send a
// DOCUMENT and know nothing about chunks — which is the point. There are two producers
// (`sync-internal-docs.mjs` for the full sync, `_shared/wiki-sync-payload.ts` for the
// merge→sync path), and an earlier version of this that chunked in the script only made them
// disagree: an incremental update would overwrite chunk 0 with a truncated whole-document row
// and leave the previous continuation chunks in place, serving a truncated head spliced onto a
// stale tail. See _shared/chunk-doc.ts for the full account.
//
// Request body: { pages: [{ source_id, content, metadata, scope?, full_content?,
//                           index_in_rag? }], userId? }
//   source_id     e.g. "wiki:concepts/self-improving-app" — the DOCUMENT id, not a chunk id.
//   content       the document text to chunk, embed and store. Required unless index_in_rag
//                 is false.
//   metadata      { title, type, path, tags? } — stored alongside; source_id, chunk_base and
//                 (when the document splits) chunk/chunk_total are added here.
//   scope         'internal' marks the row internal-only (AIOS): RLS + the scoped
//                 match_donny_knowledge keep it out of consumer Donny entirely.
//   full_content  internal pages only — full markdown additionally upserted into
//                 internal_docs (keyed on metadata.path) for the strategy viewer.
//   index_in_rag  false = store in internal_docs ONLY; do not embed, and delete any existing
//                 donny_knowledge row for this id and its chunk siblings. For documents that
//                 belong in the strategy viewer but not in retrieval (SHIPPED_LOG.md is 505k
//                 chars of raw changelog — a quarter of the corpus — that the wiki already
//                 synthesises). Internal scope only; requires full_content.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { chunkDocument, chunkSourceId, embedGroups } from "../_shared/chunk-doc.ts";
import { logEmbeddingCost } from "../_shared/cost-ledger.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";
import { sha256Hex } from "./hash.ts";

const EMBED_MODEL = "text-embedding-3-small";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"; // system sync, no end user

interface WikiPage {
  source_id: string;
  content?: string;
  metadata?: Record<string, unknown>;
  scope?: "internal";
  full_content?: string;
  index_in_rag?: boolean;
}

/** A page is embedded and stored in donny_knowledge unless it explicitly opts out. */
const isIndexed = (p: WikiPage) => p.index_in_rag !== false;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  // Service-role (internal callers) or AIOS_INGEST_SECRET (external/manual sync) —
  // exact match to prevent substring bypass. See _shared/ingest-auth.ts.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!isAuthorizedIngest(req)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let pages: WikiPage[];
  let userId: string;
  try {
    const body = await req.json();
    pages = body.pages;
    userId = typeof body.userId === "string" ? body.userId : SYSTEM_USER_ID;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 100) {
    return json({ error: "pages must be an array of 1-100 items" }, 400);
  }
  for (const p of pages) {
    if (!p?.source_id) return json({ error: "each page needs a source_id" }, 400);
    if (isIndexed(p) && (typeof p.content !== "string" || !p.content.trim())) {
      return json({ error: "each indexed page needs non-empty content" }, 400);
    }
    if (p.scope !== undefined && p.scope !== "internal") {
      return json({ error: "scope must be 'internal' or omitted" }, 400);
    }
    if (p.full_content !== undefined && p.scope !== "internal") {
      return json({ error: "full_content is only valid on internal pages" }, 400);
    }
    // Opting out of the RAG only makes sense for a doc that still has somewhere to live.
    // Without full_content on an internal page, index_in_rag:false would store the document
    // nowhere at all while reporting success.
    if (!isIndexed(p) && (p.scope !== "internal" || !p.full_content)) {
      return json({ error: "index_in_rag:false requires scope 'internal' and full_content" }, 400);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  // 1. Chunk every indexed page, then batch-embed all the chunks in one OpenAI call.
  //    Each chunk is keyed back to its page and index, so a batch mixing indexed and unindexed
  //    pages — or documents that split into different numbers of chunks — cannot shift the
  //    alignment between a chunk and its vector.
  const chunkPlan = pages.filter(isIndexed).flatMap((page) => {
    const label = typeof page.metadata?.title === "string" && page.metadata.title
      ? page.metadata.title
      : page.source_id;
    const chunks = chunkDocument(page.content!, label);
    return chunks.map((content, index) => ({ page, index, total: chunks.length, content }));
  });

  //    The embedding call is SPLIT BY TOTAL SIZE, not sent as one array. The per-input limit
  //    is 8,192 tokens — which chunking already keeps us far below — but the endpoint also
  //    caps the TOTAL tokens across the `input` array, and chunking is what makes that reachable:
  //    long documents used to arrive pre-truncated at 24k, and now arrive whole. One request
  //    over the aggregate limit fails ALL of it, which is precisely how a single 33 KB page
  //    stopped 41 unrelated pages reaching the RAG on 2026-07-26.
  const embeddings: number[][] = [];
  for (const group of embedGroups(chunkPlan.map((c) => c.content))) {
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: group }),
    });
    if (!embedResp.ok) {
      return json({ error: "Embedding API failed", details: await embedResp.text() }, 502);
    }
    const embedData = await embedResp.json();
    // Order within a group is preserved by the API, and the groups are consumed in order, so
    // `embeddings[i]` stays aligned with `chunkPlan[i]`.
    embeddings.push(...embedData.data.map((d: { embedding: number[] }) => d.embedding));
  }
  const chunksByPage = new Map<WikiPage, { index: number; total: number; content: string; embedding: number[] }[]>();
  chunkPlan.forEach((c, i) => {
    const list = chunksByPage.get(c.page) ?? [];
    list.push({ index: c.index, total: c.total, content: c.content, embedding: embeddings[i] });
    chunksByPage.set(c.page, list);
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  // 2. Idempotent upsert per page, keyed on metadata.source_id.
  // Every chunk of a document carries `metadata.chunk_base`, and siblings are found by matching
  // it EXACTLY. The obvious alternative — `like('metadata->>source_id', `${base}#%`)` — is
  // wrong on this data: `_` is a single-character LIKE wildcard and our ids are full of them
  // (`internal-doc:DESIGN_SYSTEM`, `internal-doc:SHIPPED_LOG`, `internal-doc:DATABASE_SCHEMA`),
  // so a pattern built from one id can match another document's chunks — and this list feeds
  // DELETE. No filename collides today, but that is a property of the filenames, not of the
  // code. Equality has no such failure mode.
  //
  // Returns the read error rather than swallowing it: an empty list from a FAILED read is
  // indistinguishable from an empty list from a successful one, and treating the first as the
  // second is how a purge reports success having deleted nothing.
  const chunkSiblings = async (base: string) => {
    const { data, error } = await supabase
      .from("donny_knowledge")
      .select("id, metadata")
      .eq("source_type", "wiki")
      .eq("metadata->>chunk_base", base);
    if (error) return { error: error.message, siblings: [] };
    const siblings = (data ?? [])
      .map((r: { id: string; metadata: Record<string, unknown> | null }) => {
        const id = String(r.metadata?.source_id ?? "");
        // Chunk 0 keeps the unsuffixed id, so "no #" means index 0 — not "unparseable".
        return { id: r.id, index: id.includes("#") ? Number.parseInt(id.split("#")[1], 10) : 0 };
      })
      // The base row is handled by its own exact-id delete; excluding it here keeps each
      // caller's intent explicit rather than depending on ordering.
      .filter((s) => s.index !== 0);
    return { error: null as string | null, siblings };
  };

  const results: {
    source_id: string;
    action: "inserted" | "updated" | "error" | "skipped-archived" | "skipped-unindexed";
    error?: string;
  }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    // Internal pages feed the strategy viewer (internal_docs) AND carry the
    // archive flag that gates the RAG write below.
    let archived = false;
    if (page.scope === "internal") {
      const meta = page.metadata ?? {};
      const docPath = typeof meta.path === "string" && meta.path ? meta.path : page.source_id;

      if (page.full_content) {
        const tagsRaw = meta.tags;
        const tags = Array.isArray(tagsRaw)
          ? tagsRaw.map(String)
          : typeof tagsRaw === "string" && tagsRaw
            ? tagsRaw.split(",").map((t: string) => t.trim()).filter(Boolean)
            : [];
        // Upsert ONLY content columns — never is_core or archived_* (the trigger
        // owns is_core; omission preserves a manual promotion + the archive stamp).
        const { data: docRow, error: docErr } = await supabase
          .from("internal_docs")
          .upsert(
            {
              path: docPath,
              title: typeof meta.title === "string" && meta.title ? meta.title : page.source_id,
              content_md: page.full_content,
              tags,
              source_hash: await sha256Hex(page.full_content),
            },
            { onConflict: "path" },
          )
          .select("archived_at")
          .maybeSingle();
        if (docErr) {
          // Fail-open: on an upsert error we leave `archived = false` and let the
          // RAG write proceed (prior behavior). If this doc was archived, a stray
          // RAG row may briefly reappear — self-healed on the next successful sync.
          results.push({ source_id: `${page.source_id} (internal_docs)`, action: "error", error: docErr.message });
        } else {
          archived = !!docRow?.archived_at;
        }
      } else {
        // No full_content: still honor an existing archive flag for this path.
        // Same fail-open as above — a select error yields archived=false.
        const { data: docRow } = await supabase
          .from("internal_docs").select("archived_at").eq("path", docPath).maybeSingle();
        archived = !!docRow?.archived_at;
      }
    }

    // Both exits below must clear the chunk siblings as well as the base row. Deleting only
    // the exact source_id would leave "<id>#1…#N" retrievable — the doc would read as removed
    // while most of its text was still being served.
    //
    // Every failure here is REPORTED, never swallowed. A purge that silently fails would leave
    // the document retrievable while the run printed `errors=0` — the same shape as the
    // truncation this whole change removes, and the reason the truncation survived for months.
    const purgeRag = async (): Promise<string | null> => {
      const { error: baseErr } = await supabase.from("donny_knowledge").delete()
        .eq("source_type", "wiki").eq("metadata->>source_id", page.source_id);
      if (baseErr) return baseErr.message;
      const { error: readErr, siblings } = await chunkSiblings(page.source_id);
      if (readErr) return readErr;
      for (const s of siblings) {
        const { error } = await supabase.from("donny_knowledge").delete().eq("id", s.id);
        if (error) return error.message;
      }
      return null;
    };

    // Stored for the strategy viewer, deliberately kept out of retrieval. The internal_docs
    // upsert above already ran, so the document is not lost — only unindexed.
    if (!isIndexed(page)) {
      const err = await purgeRag();
      results.push(
        err
          ? { source_id: page.source_id, action: "error", error: `unindex purge failed: ${err}` }
          : { source_id: page.source_id, action: "skipped-unindexed" },
      );
      continue;
    }

    // KEYSTONE: archived internal docs stay OUT of the RAG. Self-heal any stray
    // row, then skip the embed/upsert so re-sync never resurrects the doc.
    if (archived) {
      const err = await purgeRag();
      results.push(
        err
          ? { source_id: page.source_id, action: "error", error: `archive purge failed: ${err}` }
          : { source_id: page.source_id, action: "skipped-archived" },
      );
      continue;
    }

    const chunks = chunksByPage.get(page) ?? [];
    if (chunks.length === 0) {
      results.push({ source_id: page.source_id, action: "error", error: "page produced no chunks" });
      continue;
    }

    for (const chunk of chunks) {
      const chunkId = chunkSourceId(page.source_id, chunk.index);

      // A row written with a null embedding is invisible to the cosine RPC while still counting
      // as "updated" — the exact silent-success shape this whole change exists to remove. The
      // plan/embedding arithmetic above should make this unreachable; refuse the write if not.
      if (!chunk.embedding) {
        results.push({ source_id: chunkId, action: "error", error: "no embedding for chunk" });
        continue;
      }

      const row = {
        content: chunk.content,
        embedding: chunk.embedding,
        source_type: "wiki",
        scope: page.scope === "internal" ? "internal" : null,
        metadata: {
          ...(page.metadata ?? {}),
          source_id: chunkId,
          // On EVERY chunk, single-chunk documents included: it is what sibling lookup matches
          // on, and a document dropping from 3 chunks to 1 still has to find #1 and #2.
          chunk_base: page.source_id,
          ...(chunk.total > 1 ? { chunk: chunk.index, chunk_total: chunk.total } : {}),
        },
      };

      const { data: existing, error: selErr } = await supabase
        .from("donny_knowledge")
        .select("id")
        .eq("source_type", "wiki")
        .eq("metadata->>source_id", chunkId)
        .maybeSingle();

      if (selErr) {
        results.push({ source_id: chunkId, action: "error", error: selErr.message });
        continue;
      }

      const { error } = existing
        ? await supabase.from("donny_knowledge").update(row).eq("id", existing.id)
        : await supabase.from("donny_knowledge").insert(row);
      results.push(
        error
          ? { source_id: chunkId, action: "error", error: error.message }
          : { source_id: chunkId, action: existing ? "updated" : "inserted" },
      );
    }

    // A document that SHRANK — 6 chunks last sync, 4 this one — leaves "#4" and "#5" behind,
    // and nothing else in this system ever deletes a row.
    {
      const total = chunks[0].total;
      const { error: readErr, siblings } = await chunkSiblings(page.source_id);
      // Reported under a distinct label so it cannot be mistaken for the upsert's own result,
      // which already succeeded. A stale chunk left behind is served as current text.
      const fail = (msg: string) =>
        results.push({ source_id: `${page.source_id} (stale chunks)`, action: "error", error: msg });
      if (readErr) {
        fail(readErr);
      } else {
        for (const s of siblings) {
          // A sibling whose index does not parse is not one this sync produced; leave it for
          // the orphan report rather than guessing.
          if (!Number.isInteger(s.index) || s.index < total) continue;
          const { error } = await supabase.from("donny_knowledge").delete().eq("id", s.id);
          if (error) fail(error.message);
        }
      }
    }
  }

  // 3. Best-effort cost logging (~chars/4 token estimate). Never blocks the sync.
  //    Counts what was actually SENT to the embedding API — the chunks, including their
  //    part-of prefixes — not the pages, which is neither what was billed nor what was
  //    truncated away back when this counted whole documents against a 24k slice.
  const approxTokens = Math.ceil(chunkPlan.reduce((n, c) => n + c.content.length, 0) / 4);
  await logEmbeddingCost(supabase, {
    userId,
    edgeFunction: "donny-knowledge-sync",
    model: EMBED_MODEL,
    inputTokens: approxTokens,
  });

  const inserted = results.filter((r) => r.action === "inserted").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.action === "skipped-archived").length;
  const unindexed = results.filter((r) => r.action === "skipped-unindexed").length;
  const errors = results.filter((r) => r.action === "error").length;
  // `skipped` stays archived-only: existing callers read it as "archived", so folding a second
  // meaning into it would silently change what they report. Unindexed gets its own counter.
  //
  // `chunks` and `split` let a caller SEE the chunking it no longer performs. The truncation
  // this replaced was invisible precisely because the response said nothing about it.
  const split = [...chunksByPage.entries()]
    .filter(([, cs]) => cs.length > 1)
    .map(([p, cs]) => ({ source_id: p.source_id, chunks: cs.length }));
  return json({
    synced: inserted + updated,
    inserted, updated, skipped, unindexed, errors,
    chunks: chunkPlan.length, split, results,
  });
});
