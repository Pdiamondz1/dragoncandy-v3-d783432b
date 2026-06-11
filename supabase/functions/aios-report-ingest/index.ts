// aios-report-ingest
// The single audited choke point through which AIOS scheduled agents write
// reports. Report-only autonomy is enforced structurally: this function can
// only write briefing rows (findings support arrives in PR 8).
//
// - Service-role only (exact bearer match, same gate as donny-knowledge-sync).
// - Idempotent: briefings upsert on week_start, so a re-run replaces the
//   week's draft instead of duplicating it.
// - Publish gate: payload.publish=true publishes immediately; false unpublishes;
//   omitted leaves the existing publish state untouched (re-posting an updated
//   draft never silently unpublishes a brief an admin already released).
//
// Request body: { type: "briefing", payload: {
//   week_start: "YYYY-MM-DD", title, body_md,
//   kpis?: [{ key, label, value, target?, status? }],
//   generated_by?, publish?: boolean
// } }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface BriefingPayload {
  week_start: string;
  title: string;
  body_md: string;
  kpis?: Array<Record<string, unknown>>;
  generated_by?: string;
  publish?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  // Service role only — exact match to prevent substring bypass.
  if (req.headers.get("Authorization") !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let type: string;
  let payload: BriefingPayload;
  try {
    const body = await req.json();
    type = body.type;
    payload = body.payload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (type !== "briefing") {
    return json({ error: `Unsupported type "${type}" — this endpoint accepts 'briefing' only (v1)` }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ error: "payload is required" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.week_start ?? "")) {
    return json({ error: "payload.week_start must be YYYY-MM-DD" }, 400);
  }
  if (typeof payload.title !== "string" || payload.title.trim().length === 0) {
    return json({ error: "payload.title is required" }, 400);
  }
  if (typeof payload.body_md !== "string" || payload.body_md.trim().length === 0) {
    return json({ error: "payload.body_md is required" }, 400);
  }
  if (payload.kpis !== undefined && !Array.isArray(payload.kpis)) {
    return json({ error: "payload.kpis must be an array when provided" }, 400);
  }
  if (payload.publish !== undefined && typeof payload.publish !== "boolean") {
    return json({ error: "payload.publish must be a boolean when provided" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const fields: Record<string, unknown> = {
    title: payload.title.trim(),
    body_md: payload.body_md,
    kpis: payload.kpis ?? [],
    generated_by: payload.generated_by ?? "weekly-brief-agent",
  };
  if (payload.publish !== undefined) {
    fields.published_at = payload.publish ? new Date().toISOString() : null;
  }

  try {
    const { data: existing, error: selectError } = await supabase
      .from("aios_briefings")
      .select("id, published_at")
      .eq("week_start", payload.week_start)
      .maybeSingle();
    if (selectError) throw selectError;

    let id: string;
    if (existing) {
      const { error } = await supabase
        .from("aios_briefings")
        .update(fields)
        .eq("id", existing.id);
      if (error) throw error;
      id = existing.id;
    } else {
      const { data: inserted, error } = await supabase
        .from("aios_briefings")
        .insert({ week_start: payload.week_start, published_at: null, ...fields })
        .select("id")
        .single();
      if (error) throw error;
      id = inserted.id;
    }

    return json({ success: true, id, week_start: payload.week_start, updated: !!existing });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest failed";
    console.error("[aios-report-ingest]", message);
    return json({ error: message }, 500);
  }
});
