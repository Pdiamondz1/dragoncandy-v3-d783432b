// donny-knowledge-sync
// Gated sync of verified wiki pages into Donny's RAG store (donny_knowledge).
// Part of the autoresearch loop: one research loop, two learners (wiki + Donny).
//
// - Service-role only (writes to donny_knowledge, which is service-role RLS).
// - Embeds each page with OpenAI text-embedding-3-small (1536d), matching the
//   existing embedding path so retrieval (match_donny_knowledge) just works.
// - Idempotent: one row per wiki page, keyed on metadata.source_id
//   ("wiki:<path>"). Re-syncing a page updates its row instead of duplicating.
//
// Request body: { pages: [{ source_id, content, metadata, scope?, full_content?,
//                           index_in_rag?, chunk_total? }], userId? }
//   source_id     e.g. "wiki:concepts/self-improving-app". A document too long for one
//                 embedding arrives as several pages: chunk 0 keeps the plain id and chunk N
//                 carries "<id>#N", so a single-chunk document updates its existing row rather
//                 than orphaning it.
//   content       text to embed + store (title + body). Required unless index_in_rag is false.
//   metadata      { title, type, path, tags? } — stored alongside; source_id is added.
//   scope         'internal' marks the row internal-only (AIOS): RLS + the scoped
//                 match_donny_knowledge keep it out of consumer Donny entirely.
//   full_content  internal pages only — full markdown additionally upserted into
//                 internal_docs (keyed on metadata.path) for the strategy viewer.
//   index_in_rag  false = store in internal_docs ONLY; do not embed, and delete any existing
//                 donny_knowledge row for this id and its chunk siblings. For documents that
//                 belong in the strategy viewer but not in retrieval (SHIPPED_LOG.md is 505k
//                 chars of raw changelog — a quarter of the corpus — that the wiki already
//                 synthesises). Internal scope only; requires full_content.
//   chunk_total   how many chunks this document produced. Sent on chunk 0 so a document that
//                 SHRANK has its now-unproduced siblings deleted; without it, a stale chunk
//                 stays retrievable forever because nothing else ever removes a row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
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
  chunk_total?: number;
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
    if (p.chunk_total !== undefined && (!Number.isInteger(p.chunk_total) || p.chunk_total < 1)) {
      return json({ error: "chunk_total must be a positive integer" }, 400);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  // 1. Batch-embed the indexed pages in one OpenAI call (order is preserved).
  //    Unindexed pages are skipped here, not sent-and-discarded: `embeddingFor` maps a page
  //    back to its own vector, so a batch mixing the two kinds cannot shift the alignment.
  const indexedPages = pages.filter(isIndexed);
  const embeddings: number[][] = [];
  if (indexedPages.length > 0) {
    const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: indexedPages.map((p) => p.content) }),
    });
    if (!embedResp.ok) {
      return json({ error: "Embedding API failed", details: await embedResp.text() }, 502);
    }
    const embedData = await embedResp.json();
    embeddings.push(...embedData.data.map((d: { embedding: number[] }) => d.embedding));
  }
  const embeddingFor = (page: WikiPage) => embeddings[indexedPages.indexOf(page)];

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

    // A row written with a null embedding is invisible to the cosine RPC while still counting
    // as "updated" — the exact silent-success shape this whole change exists to remove. The
    // index arithmetic above should make this unreachable; refuse the write if it is not.
    const embedding = embeddingFor(page);
    if (!embedding) {
      results.push({ source_id: page.source_id, action: "error", error: "no embedding for page" });
      continue;
    }

    const row = {
      content: page.content,
      embedding,
      source_type: "wiki",
      scope: page.scope === "internal" ? "internal" : null,
      metadata: { ...(page.metadata ?? {}), source_id: page.source_id },
    };

    const { data: existing, error: selErr } = await supabase
      .from("donny_knowledge")
      .select("id")
      .eq("source_type", "wiki")
      .eq("metadata->>source_id", page.source_id)
      .maybeSingle();

    if (selErr) {
      results.push({ source_id: page.source_id, action: "error", error: selErr.message });
      continue;
    }

    if (existing) {
      const { error } = await supabase.from("donny_knowledge").update(row).eq("id", existing.id);
      results.push(
        error
          ? { source_id: page.source_id, action: "error", error: error.message }
          : { source_id: page.source_id, action: "updated" },
      );
    } else {
      const { error } = await supabase.from("donny_knowledge").insert(row);
      results.push(
        error
          ? { source_id: page.source_id, action: "error", error: error.message }
          : { source_id: page.source_id, action: "inserted" },
      );
    }

    // A document that SHRANK — 6 chunks last sync, 4 this one — leaves "#4" and "#5" behind,
    // and nothing else in this system ever deletes a row. Sent only on chunk 0 (the id with no
    // '#'), so this runs once per document rather than once per chunk.
    if (page.chunk_total !== undefined && !page.source_id.includes("#")) {
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
          if (!Number.isInteger(s.index) || s.index < page.chunk_total) continue;
          const { error } = await supabase.from("donny_knowledge").delete().eq("id", s.id);
          if (error) fail(error.message);
        }
      }
    }
  }

  // 3. Best-effort cost logging (~chars/4 token estimate). Never blocks the sync.
  const approxTokens = Math.ceil(pages.reduce((n, p) => n + (p.content?.length ?? 0), 0) / 4);
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
  return json({ synced: inserted + updated, inserted, updated, skipped, unindexed, errors, results });
});
