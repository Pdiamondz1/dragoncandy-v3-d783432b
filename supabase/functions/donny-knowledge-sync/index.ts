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
// Request body: { pages: [{ source_id, content, metadata, scope?, full_content? }], userId? }
//   source_id     e.g. "wiki:concepts/self-improving-app"
//   content       text to embed + store (title + body)
//   metadata      { title, type, path, tags? } — stored alongside; source_id is added.
//   scope         'internal' marks the row internal-only (AIOS): RLS + the scoped
//                 match_donny_knowledge keep it out of consumer Donny entirely.
//   full_content  internal pages only — full markdown additionally upserted into
//                 internal_docs (keyed on metadata.path) for the strategy viewer.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { logEmbeddingCost } from "../_shared/cost-ledger.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";
import { sha256Hex } from "./hash.ts";

const EMBED_MODEL = "text-embedding-3-small";
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000"; // system sync, no end user

interface WikiPage {
  source_id: string;
  content: string;
  metadata?: Record<string, unknown>;
  scope?: "internal";
  full_content?: string;
}

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
    if (!p?.source_id || typeof p.content !== "string" || !p.content.trim()) {
      return json({ error: "each page needs a source_id and non-empty content" }, 400);
    }
    if (p.scope !== undefined && p.scope !== "internal") {
      return json({ error: "scope must be 'internal' or omitted" }, 400);
    }
    if (p.full_content !== undefined && p.scope !== "internal") {
      return json({ error: "full_content is only valid on internal pages" }, 400);
    }
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

  // 1. Batch-embed every page in one OpenAI call (order is preserved).
  const embedResp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: pages.map((p) => p.content) }),
  });
  if (!embedResp.ok) {
    return json({ error: "Embedding API failed", details: await embedResp.text() }, 502);
  }
  const embedData = await embedResp.json();
  const embeddings: number[][] = embedData.data.map((d: { embedding: number[] }) => d.embedding);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  // 2. Idempotent upsert per page, keyed on metadata.source_id.
  const results: { source_id: string; action: "inserted" | "updated" | "error" | "skipped-archived"; error?: string }[] = [];
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
          results.push({ source_id: `${page.source_id} (internal_docs)`, action: "error", error: docErr.message });
        } else {
          archived = !!docRow?.archived_at;
        }
      } else {
        // No full_content: still honor an existing archive flag for this path.
        const { data: docRow } = await supabase
          .from("internal_docs").select("archived_at").eq("path", docPath).maybeSingle();
        archived = !!docRow?.archived_at;
      }
    }

    // KEYSTONE: archived internal docs stay OUT of the RAG. Self-heal any stray
    // row, then skip the embed/upsert so re-sync never resurrects the doc.
    if (archived) {
      await supabase.from("donny_knowledge").delete()
        .eq("source_type", "wiki").eq("metadata->>source_id", page.source_id);
      results.push({ source_id: page.source_id, action: "skipped-archived" });
      continue;
    }

    const row = {
      content: page.content,
      embedding: embeddings[i],
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
  }

  // 3. Best-effort cost logging (~chars/4 token estimate). Never blocks the sync.
  const approxTokens = Math.ceil(pages.reduce((n, p) => n + p.content.length, 0) / 4);
  await logEmbeddingCost(supabase, {
    userId,
    edgeFunction: "donny-knowledge-sync",
    model: EMBED_MODEL,
    inputTokens: approxTokens,
  });

  const inserted = results.filter((r) => r.action === "inserted").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.action === "skipped-archived").length;
  const errors = results.filter((r) => r.action === "error").length;
  return json({ synced: inserted + updated, inserted, updated, skipped, errors, results });
});
