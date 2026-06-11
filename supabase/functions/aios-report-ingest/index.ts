// aios-report-ingest
// The single audited choke point through which AIOS scheduled agents write
// reports. Report-only autonomy is enforced structurally: this function can
// only write briefing and finding rows.
//
// - Service-role only (exact bearer match, same gate as donny-knowledge-sync).
// - Idempotent: briefings upsert on week_start; findings upsert on fingerprint
//   (occurrences bump, and a recurrence of a RESOLVED finding reopens it).
// - Publish gate: payload.publish=true publishes immediately; false unpublishes;
//   omitted leaves the existing publish state untouched (re-posting an updated
//   draft never silently unpublishes a brief an admin already released).
//
// Request bodies:
//   { type: "briefing", payload: { week_start: "YYYY-MM-DD", title, body_md,
//     kpis?: [{ key, label, value, target?, status? }], generated_by?, publish?: boolean } }
//   { type: "findings", payload: { findings: [{ severity, title, summary_md,
//     evidence?, source?, fingerprint? }] } }   // "finding" + single object also accepted

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

interface FindingPayload {
  severity: string;
  title: string;
  summary_md: string;
  evidence?: Record<string, unknown>;
  source?: string;
  fingerprint?: string;
}

const SEVERITIES = new Set(["critical", "high", "medium", "low"]);

// Upsert one finding by fingerprint. Returns 'inserted' | 'updated' | 'reopened'.
// deno-lint-ignore no-explicit-any
async function upsertFinding(supabase: any, f: FindingPayload): Promise<string> {
  const row = {
    severity: f.severity,
    title: f.title.trim(),
    summary_md: f.summary_md,
    evidence: f.evidence ?? {},
    source: f.source ?? "bug-sweep-agent",
  };

  if (!f.fingerprint) {
    const { error } = await supabase.from("aios_findings").insert(row);
    if (error) throw error;
    return "inserted";
  }

  const { data: existing, error: selectError } = await supabase
    .from("aios_findings")
    .select("id, status, occurrences")
    .eq("fingerprint", f.fingerprint)
    .maybeSingle();
  if (selectError) throw selectError;

  if (!existing) {
    const { error } = await supabase.from("aios_findings").insert({ ...row, fingerprint: f.fingerprint });
    if (error) throw error;
    return "inserted";
  }

  // Recurrence: bump occurrences; a resolved finding that recurs is a
  // regression and reopens. acknowledged/wontfix triage states are preserved.
  const reopen = existing.status === "resolved";
  const { error } = await supabase
    .from("aios_findings")
    .update({
      ...row,
      occurrences: (existing.occurrences ?? 1) + 1,
      last_seen_at: new Date().toISOString(),
      ...(reopen ? { status: "open" } : {}),
    })
    .eq("id", existing.id);
  if (error) throw error;
  return reopen ? "reopened" : "updated";
}

function validateFinding(f: unknown): string | null {
  const x = f as FindingPayload;
  if (!x || typeof x !== "object") return "finding must be an object";
  if (!SEVERITIES.has(x.severity)) return `severity must be one of ${[...SEVERITIES].join("|")}`;
  if (typeof x.title !== "string" || x.title.trim().length === 0) return "title is required";
  if (typeof x.summary_md !== "string" || x.summary_md.trim().length === 0) return "summary_md is required";
  if (x.fingerprint !== undefined && typeof x.fingerprint !== "string") return "fingerprint must be a string";
  return null;
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
  // deno-lint-ignore no-explicit-any
  let rawPayload: any;
  try {
    const body = await req.json();
    type = body.type;
    rawPayload = body.payload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!rawPayload || typeof rawPayload !== "object") {
    return json({ error: "payload is required" }, 400);
  }

  // --- Findings (single or batch) ---
  if (type === "finding" || type === "findings") {
    const findings: unknown[] =
      type === "finding" ? [rawPayload] : Array.isArray(rawPayload.findings) ? rawPayload.findings : [];
    if (findings.length === 0) {
      return json({ error: "payload.findings must be a non-empty array (or use type 'finding' with a single object)" }, 400);
    }
    if (findings.length > 50) {
      return json({ error: "max 50 findings per request" }, 400);
    }
    for (const f of findings) {
      const problem = validateFinding(f);
      if (problem) return json({ error: problem }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results = { inserted: 0, updated: 0, reopened: 0 };
    try {
      for (const f of findings) {
        const outcome = await upsertFinding(supabase, f as FindingPayload);
        results[outcome as keyof typeof results] += 1;
      }
      return json({ success: true, ...results });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ingest failed";
      console.error("[aios-report-ingest] findings:", message);
      return json({ error: message, partial: results }, 500);
    }
  }

  if (type !== "briefing") {
    return json({ error: `Unsupported type "${type}" — this endpoint accepts 'briefing', 'finding', or 'findings'` }, 400);
  }
  const payload = rawPayload as BriefingPayload;
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
