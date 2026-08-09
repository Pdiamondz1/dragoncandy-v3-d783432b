// content-strategy-recommend — creator picks a restaurant (organization_id) → Donny returns a content brief.
// Auth: in-code Supabase JWT (verify_jwt=false). All data access via service role (cross-user context reads).
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY(optional)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { getUserUsageStage, incrementUsage, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { embedQuery, retrieveContext } from "../donny-orchestrator/rag.ts";
import { aggregateCreatorPerformance, buildPrompt, parseBrief, type PerfRow } from "./brief.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

function json(status: number, body: unknown, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "no_authorization" }, req);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json(401, { error: "unauthorized" }, req);
    const creatorId = user.id;

    const rate = await checkHourlyRateLimit(admin, creatorId);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after: rate.retryAfterSeconds }), {
        status: 429,
        headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
      });
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organization_id;
    if (!organizationId || typeof organizationId !== "string") {
      return json(400, { error: "organization_id required" }, req);
    }

    // --- Identity resolution: organization_id → restaurant business_profiles + owner user_id ---
    // No FK between business_profiles and org_members (both reference auth.users), so PostgREST cannot
    // embed them. Resolve in two queries, mirroring the proven search_restaurants RPC join.
    const { data: members } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", organizationId)
      .eq("invitation_status", "active");
    const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
    if (memberIds.length === 0) return json(404, { error: "no active members for organization" }, req);

    const { data: bp } = await admin
      .from("business_profiles")
      .select("id, user_id, business_name, industry, description, location, sample_content_urls")
      .in("user_id", memberIds)
      .eq("account_type", "restaurant")
      .order("id", { ascending: true })   // stable resolution if an org has >1 restaurant profile
      .limit(1)
      .maybeSingle();
    if (!bp) return json(404, { error: "no restaurant profile for organization" }, req);
    const ownerUserId = bp.user_id as string;

    // Business context (latest non-expired extract; tolerate null expires_at = never expires)
    const nowIso = new Date().toISOString();
    const { data: ctx } = await admin
      .from("business_contexts")
      .select("extracted_data, extracted_at")
      .eq("profile_id", ownerUserId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("extracted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Connected platforms
    const { data: accts } = await admin
      .from("business_outstand_accounts")
      .select("platform")
      .eq("user_id", ownerUserId)
      .neq("status", "revoked");
    const connectedPlatforms = [...new Set((accts ?? []).map((a) => String(a.platform)))];

    // Creator profile
    const { data: creator } = await admin
      .from("creator_profiles")
      .select("creator_name, bio, skills, location")
      .eq("user_id", creatorId)
      .maybeSingle();
    const creatorSummary = creator
      ? `${creator.creator_name ?? "creator"} — skills: ${(creator.skills ?? []).join(", ") || "n/a"}; ${creator.bio ?? ""}`.slice(0, 600)
      : "an early creator (no profile yet)";

    // Creator's OWN performance (graceful)
    const { data: perfRows } = await admin
      .from("content_performance")
      .select("outstand_post_id, platform, post_type, engagement_rate, is_settled")
      .eq("user_id", creatorId);
    const perf = aggregateCreatorPerformance((perfRows ?? []) as PerfRow[]);
    const usedPerformanceData = perf.hasSignal;

    // RAG
    const ragQuery = `content strategy for ${bp.business_name} ${bp.industry ?? ""}`.trim();
    const embedding = await embedQuery(ragQuery);
    const ragChunks = await retrieveContext(admin, ragQuery, embedding, 4);

    // Assemble business context text
    const ctxData = (ctx?.extracted_data ?? {}) as Record<string, unknown>;
    const businessContext = [
      bp.industry ? `Industry: ${bp.industry}` : "",
      bp.description ? `Description: ${bp.description}` : "",
      bp.location ? `Location: ${JSON.stringify(bp.location)}` : "",
      Object.keys(ctxData).length ? `Extracted: ${JSON.stringify(ctxData).slice(0, 1500)}` : "",
      (bp.sample_content_urls ?? []).length ? `Sample content: ${(bp.sample_content_urls as string[]).slice(0, 5).join(", ")}` : "",
    ].filter(Boolean).join("\n") || "No extra context available.";

    const { system, user: userPrompt } = buildPrompt({
      businessName: bp.business_name ?? "the restaurant",
      businessContext,
      connectedPlatforms,
      creatorSummary,
      perfSummary: perf.summary,
      ragChunks,
    });

    // --- Generate ---
    const usageStage = await getUserUsageStage(admin, creatorId);
    const modelConfig = getModelConfig("content-strategy-recommend", usageStage);

    let parsed;
    let lastErr: unknown;
    let usage = { input_tokens: 0, output_tokens: 0 };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800));  // brief backoff before the retry
      const resp = await anthropicFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: modelConfig.model, max_tokens: modelConfig.maxTokens, temperature: 0.7,
          system, messages: [{ role: "user", content: userPrompt }],
        }),
      }, 0);
      if (!resp.ok) { lastErr = new Error(`Anthropic ${resp.status}`); continue; }
      const data = await resp.json();
      usage = { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 };
      try { parsed = parseBrief(data.content?.[0]?.text ?? ""); break; }
      catch (e) { lastErr = e; }
    }

    // Cost is logged regardless of parse success (tokens were spent).
    await logCost(admin, {
      userId: creatorId, edgeFunction: "content-strategy-recommend",
      model: modelConfig.model, tier: modelConfig.tier,
      inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    });
    await incrementUsage(admin, creatorId, modelConfig.actionCost);

    if (!parsed) {
      console.error("[content-strategy-recommend] brief parse failed:", lastErr);
      return json(502, { error: "generation_failed" }, req);
    }

    // --- Persist ---
    const { data: inserted, error: insErr } = await admin.from("content_briefs").insert({
      creator_id: creatorId,
      organization_id: organizationId,
      context_snapshot: { businessName: bp.business_name, connectedPlatforms, perfSummary: perf.summary, ragChunkCount: ragChunks.length },
      brief: parsed,
      model: modelConfig.model,
      used_performance_data: usedPerformanceData,
    }).select("id").maybeSingle();
    if (insErr || !inserted?.id) {
      console.warn("[content-strategy-recommend] brief persist failed:", insErr?.message ?? "no id returned");
    }

    return json(200, { brief: parsed, brief_id: inserted?.id ?? null, used_performance_data: usedPerformanceData }, req);
  } catch (err) {
    console.error("[content-strategy-recommend] error:", (err as Error)?.message ?? err);
    return json(500, { error: (err as Error)?.message ?? "internal_error" }, req);
  }
});
