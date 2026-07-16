import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { getModelConfig, type ModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { buildDonnyFirstSystemPrompt, buildDonnyFirstUserPrompt, parseCampaignJson } from "./lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

/** New-format input error that maps to a 400 on the sync path. */
class ValidationError extends Error {}

/**
 * Schedule work to continue after the response is sent. Supabase's edge
 * runtime exposes EdgeRuntime.waitUntil for background tasks; if it's ever
 * absent, fall back to an unawaited promise (best effort) and log it.
 */
function scheduleBackground(task: Promise<unknown>): void {
  // The task must never surface an unhandled rejection — if it dies without
  // writing a terminal status, the row stays 'processing' and the client's
  // poll timeout is the recovery path.
  const safe = task.catch((err) => console.error("[campaign-generate] background task crashed:", err));
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(safe);
  } else {
    // Unreliable by design — the isolate may terminate right after the
    // response. Degrades to the stuck-'processing' + client-timeout path.
    console.warn("[campaign-generate] EdgeRuntime.waitUntil unavailable — background task may not complete");
  }
}

interface FetchedContent {
  title: string;
  description: string;
  bodyText: string;
}

function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;
    if (h === '169.254.169.254' || h === 'metadata.google.internal') return true;
    const parts = h.split('.').map(Number);
    if (parts.length === 4 && parts.every(p => !isNaN(p))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function fetchAndExtract(url: string): Promise<FetchedContent> {
  if (isBlockedUrl(url)) {
    throw new Error("URL targets a blocked address range");
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "DragonCandy-Bot/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) { throw new Error("Failed to fetch URL: " + response.status); }
  const html = await response.text();

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = metaMatch ? metaMatch[1].trim() : "";

  // Strip script and style blocks, then all remaining tags
  let bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  return { title, description, bodyText };
}

async function generateCampaignIdeas(
  pageContent: string,
  sourceType: string,
  role: string | null,
  modelConfig: ModelConfig,
  connectedPlatforms?: Array<{ platform: string; platform_handle: string | null }>,
  maxTokensOverride?: number,
): Promise<{
  result: { business_context: Record<string, unknown>; campaign_ideas: unknown[] };
  usage: { input_tokens: number; output_tokens: number };
}> {
  const systemPrompt = buildDonnyFirstSystemPrompt(connectedPlatforms);
  const userPrompt = buildDonnyFirstUserPrompt(pageContent, sourceType, role);
  // Clamp any caller override into [512, modelConfig.maxTokens]; default to the full budget.
  const maxTokens = Math.min(Math.max(maxTokensOverride ?? modelConfig.maxTokens, 512), modelConfig.maxTokens);

  const requestBody = {
    model: modelConfig.model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
    // NOTE: sampling params omitted — claude-opus-4-8 rejects them with a 400.
  };
  console.log(`[campaign-generate] Calling Anthropic: model=${modelConfig.model}, max_tokens=${maxTokens}, prompt_len=${userPrompt.length}`);

  const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(requestBody),
  }, 0);

  if (!response.ok) {
    const err = await response.text();
    console.error(`[campaign-generate] Anthropic API failed: status=${response.status}, body=${err}`);
    throw new Error(`Anthropic ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = await response.json();
  // With thinking off, content[0] is the text block; use find() defensively.
  const rawContent: string = (data.content ?? []).find((b: { type?: string }) => b.type === "text")?.text ?? "{}";
  return {
    result: parseCampaignJson(rawContent) as { business_context: Record<string, unknown>; campaign_ideas: unknown[] },
    usage: { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 },
  };
}

interface NewFormatBody {
  source_url?: string;
  source_type: string;
  photo_url?: string;
  manual_text?: string;
  role?: string | null;
  inspiration_refs?: Array<{ content_label: string; creator_name: string; media_type: string; media_url: string }>;
  connected_platforms?: Array<{ platform: string; platform_handle: string | null }>;
  max_tokens?: number;
}

/**
 * The new-format ("Donny-First") generation pipeline, shared verbatim by the
 * sync response path and the async job path. `onPhase` reports progress on the
 * async path and is a no-op on the sync path.
 */
async function runNewFormatGeneration(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  userId: string,
  body: NewFormatBody,
  onPhase?: (progress: string) => Promise<void> | void,
): Promise<Record<string, unknown>> {
  const { source_url, source_type, photo_url, manual_text, role, inspiration_refs, connected_platforms } = body;

  const contentParts: string[] = [];
  let urlExtracted = false;

  if (source_url) {
    await onPhase?.("Reading your link…");
    try {
      const extracted = await fetchAndExtract(source_url);
      if (extracted.title || extracted.description || extracted.bodyText) {
        contentParts.push(`Title: ${extracted.title}\nDescription: ${extracted.description}\nContent: ${extracted.bodyText}`);
        urlExtracted = true;
      }
    } catch {
      contentParts.push(`Source URL (could not read): ${source_url}`);
    }
  }

  if (source_type === 'photo' && photo_url) {
    contentParts.push(`[Photo uploaded: ${photo_url}]`);
  }

  if (manual_text) {
    contentParts.push(manual_text);
  }

  const pageContent = contentParts.join('\n\n');

  if (!pageContent.trim()) {
    throw new ValidationError("Please provide a link, photo, or description");
  }

  let inspirationContext = '';
  if (inspiration_refs?.length) {
    const lines = inspiration_refs.map(
      (ref) => `- ${ref.content_label} by @${ref.creator_name} (${ref.media_type}): ${ref.media_url}`
    );
    inspirationContext = `\n\nStyle references the user selected:\n${lines.join('\n')}\n\nGenerate campaign ideas that match these content styles and formats.`;
  }

  await onPhase?.("Generating campaign ideas…");
  const usageStage = await getUserUsageStage(supabaseAdmin, userId);
  const modelConfig = getModelConfig("donny-campaign-generate", usageStage);
  const { result: ideasResponse, usage } = await generateCampaignIdeas(pageContent + inspirationContext, source_type, role ?? null, modelConfig, connected_platforms, body.max_tokens);

  await logCost(supabaseAdmin, {
    userId,
    edgeFunction: "donny-campaign-generate",
    model: modelConfig.model,
    tier: modelConfig.tier,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  });
  await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);

  return { ...ideasResponse, _meta: { url_extracted: urlExtracted } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Dual-client auth: try Supabase JWT first, fallback to Donny OAuth token
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let userId: string;
    let authViaSessionJwt = false;
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (user && !authError) {
      userId = user.id;
      authViaSessionJwt = true;
    } else {
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (!requireScope(oauthResult.scopes, "campaigns:write")) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient scope: campaigns:write required" }),
          { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      userId = oauthResult.user_id;
    }

    const hourlyCheck = await checkHourlyRateLimit(supabaseAdmin, userId);
    if (!hourlyCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "rate_limited", retry_after: hourlyCheck.retryAfterSeconds }),
        { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(hourlyCheck.retryAfterSeconds) } }
      );
    }

    // Parse and validate request body
    const body = await req.json();

    // Detect the new "Donny-First" campaign creator format
    const isNewFormat = 'source_type' in body;

    if (isNewFormat) {
      const newBody = body as NewFormatBody & { async?: boolean };

      // Async job path: create the row, keep working after the response, and
      // return the job id immediately. The client polls its own row, which
      // survives mobile connection drops / tab backgrounding (the old single
      // ~60s fetch did not — see spec 2026-07-14-campaign-generate-async-jobs).
      // Session-JWT callers only: an OAuth caller has no auth.uid() and could
      // never read the job row, so it falls through to the sync path.
      if (newBody.async === true && authViaSessionJwt) {
        // Cheap pre-validation so an obviously empty request never creates a job.
        if (!newBody.source_url && !(newBody.source_type === 'photo' && newBody.photo_url) && !newBody.manual_text) {
          return new Response(
            JSON.stringify({ success: false, error: "Please provide a link, photo, or description" }),
            { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
          );
        }

        const { async: _async, ...requestForRow } = newBody;
        const { data: job, error: jobError } = await supabaseAdmin
          .from("campaign_generation_jobs")
          .insert({ user_id: userId, status: "processing", progress: "Starting…", request: requestForRow })
          .select("id")
          .single();
        if (jobError || !job) {
          console.error("[campaign-generate] job insert failed:", jobError);
          throw new Error("Could not start generation job");
        }
        const jobId = job.id as string;

        const updateJob = (fields: Record<string, unknown>) =>
          supabaseAdmin
            .from("campaign_generation_jobs")
            .update({ ...fields, updated_at: new Date().toISOString() })
            .eq("id", jobId);

        scheduleBackground((async () => {
          try {
            const payload = await runNewFormatGeneration(supabaseAdmin, userId, requestForRow, async (progress) => {
              await updateJob({ progress });
            });
            const { error: doneError } = await updateJob({ status: "done", result: payload, progress: null });
            if (doneError) console.error("[campaign-generate] job done-write failed:", doneError);
          } catch (err) {
            const message = String((err as Error)?.message ?? err).slice(0, 500);
            console.error(`[campaign-generate] job ${jobId} failed:`, message);
            const { error: errWrite } = await updateJob({ status: "error", error: message });
            if (errWrite) console.error("[campaign-generate] job error-write failed:", errWrite);
          }
          // Best-effort retention: clear this user's stale jobs (>7 days).
          try {
            await supabaseAdmin
              .from("campaign_generation_jobs")
              .delete()
              .eq("user_id", userId)
              .lt("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
          } catch { /* non-blocking */ }
        })());

        return new Response(JSON.stringify({ job_id: jobId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Sync path — behavior unchanged for existing callers.
      try {
        const payload = await runNewFormatGeneration(supabaseAdmin, userId, newBody);
        return new Response(JSON.stringify(payload), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    // Legacy format — existing callers continue unchanged below
    const {
      source_url,
      page_content,
      text_brief,
      brief,
      target_audience,
      budget_range,
      content_types,
      timeline,
      page_context,
      preferences,
    }: {
      source_url?: string;
      page_content?: string;
      text_brief?: string;
      brief?: string;
      target_audience?: string;
      budget_range?: string;
      content_types?: string[];
      timeline?: string;
      page_context?: { url?: string; title?: string; description?: string; platform?: string };
      preferences?: {
        platform?: string;
        budget_range?: { min: number; max: number };
      };
    } = body;

    // Normalise: accept both legacy fields and Chrome Extension field names
    const effectiveBrief = text_brief || brief;
    const effectiveSourceUrl = source_url || page_context?.url;

    if (!effectiveSourceUrl && !page_content && !effectiveBrief) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "At least one of source_url, page_content, or text_brief is required",
        }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Content assembly — priority: page_content > fetched URL > brief
    let contentSections: string[] = [];

    if (page_content) {
      contentSections.push(`Page Content:\n${page_content.slice(0, 5000)}`);
    } else if (effectiveSourceUrl) {
      try {
        const fetched = await fetchAndExtract(effectiveSourceUrl);
        const parts: string[] = [];
        if (fetched.title) parts.push(`Page Title: ${fetched.title}`);
        if (fetched.description) parts.push(`Meta Description: ${fetched.description}`);
        if (fetched.bodyText) parts.push(`Page Body:\n${fetched.bodyText}`);
        if (parts.length > 0) contentSections.push(parts.join("\n"));
      } catch (fetchErr) {
        contentSections.push(`Note: Failed to fetch URL content (${fetchErr.message}). Proceeding with other inputs.`);
      }
    }

    // Always append brief/text_brief if provided
    if (effectiveBrief) {
      contentSections.push(`Additional Brief:\n${effectiveBrief}`);
    }

    // Append source URL as context
    if (effectiveSourceUrl) {
      contentSections.push(`Source URL: ${effectiveSourceUrl}`);
    }

    // Append Chrome Extension fields as additional context
    if (target_audience) {
      contentSections.push(`Target Audience: ${target_audience}`);
    }
    if (budget_range) {
      contentSections.push(`Budget Range: ${budget_range}`);
    }
    if (content_types?.length) {
      contentSections.push(`Content Types: ${content_types.join(", ")}`);
    }
    if (timeline) {
      contentSections.push(`Timeline: ${timeline}`);
    }
    if (page_context?.title) {
      contentSections.push(`Page Title: ${page_context.title}`);
    }
    if (page_context?.description) {
      contentSections.push(`Page Description: ${page_context.description}`);
    }

    // Append preferences as additional context
    if (preferences?.platform) {
      contentSections.push(`Preferred Platform: ${preferences.platform}`);
    }
    if (preferences?.budget_range) {
      contentSections.push(
        `Budget Range: $${preferences.budget_range.min} – $${preferences.budget_range.max}`
      );
    }

    const assembledContent = contentSections.join("\n\n");

    // Call Anthropic Claude
    const legacyUsageStage = await getUserUsageStage(supabaseAdmin, userId);
    const legacyModelConfig = getModelConfig("donny-campaign-generate", legacyUsageStage);
    const legacySystemPrompt = `You are Donny, a bold, creative campaign strategist for DragonCandy, a platform connecting local businesses with content creators. Generate a compelling, specific campaign draft — fresh, not generic.

Respond with valid JSON only — no markdown fences, no additional text, just raw JSON. Use this exact structure:
{
  "title": "Campaign title (catchy, concise)",
  "description": "Full campaign brief describing what the brand wants and what creators should deliver",
  "platform": "Primary platform (e.g. TikTok, Instagram, YouTube)",
  "budget_min": 500,
  "budget_max": 2000,
  "content_type": "Type of content (e.g. Short-form video, Reel, Story, Review)",
  "goals": ["List", "of", "campaign", "goals"],
  "target_audience": "Description of the ideal target audience",
  "recommended_platforms": ["TikTok", "Instagram"],
  "content_ideas": [
    {
      "concept": "Idea name",
      "format": "Content format (e.g. 60-second Reel)",
      "description": "Detailed description of the content idea"
    }
  ],
  "hashtags": ["#example", "#hashtags"],
  "style_direction": {
    "visual_style": "Description of visual aesthetic",
    "mood": "Tone and mood of the content",
    "references": "References or inspiration sources"
  }
}`;

    console.log(`[campaign-generate-legacy] Calling Anthropic: model=${legacyModelConfig.model}, max_tokens=${legacyModelConfig.maxTokens}`);

    const anthropicResponse = await anthropicFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: legacyModelConfig.model,
        max_tokens: legacyModelConfig.maxTokens,
        system: legacySystemPrompt,
        messages: [
          {
            role: "user",
            content: `Generate a campaign draft based on the following brand information:\n\n${assembledContent}`,
          },
        ],
      }),
    }, 0);

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text();
      console.error(`[campaign-generate-legacy] Anthropic API failed: status=${anthropicResponse.status}, body=${errBody}`);
      throw new Error(`Anthropic ${anthropicResponse.status}: ${errBody.slice(0, 300)}`);
    }
    const anthropicResult = await anthropicResponse.json();
    const rawContent: string = anthropicResult.content?.[0]?.text ?? "";

    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-campaign-generate",
      model: legacyModelConfig.model,
      tier: legacyModelConfig.tier,
      inputTokens: anthropicResult.usage?.input_tokens ?? 0,
      outputTokens: anthropicResult.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, legacyModelConfig.actionCost);

    // Opus can prepend a preamble to the JSON — use the same robust extractor
    // as the new-format path (this legacy path now shares the Opus routing).
    const campaignData = parseCampaignJson(rawContent);

    return new Response(
      JSON.stringify({ success: true, data: campaignData }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[campaign-generate] Unhandled error:", err.message ?? err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
