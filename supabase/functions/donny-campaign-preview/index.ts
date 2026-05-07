import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const VALID_PREVIEW_TYPES = [
  "mood_board",
  "example_clip",
  "content_template",
  "storyboard",
  "thumbnail",
] as const;

type PreviewType = typeof VALID_PREVIEW_TYPES[number];

function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function authenticateRequest(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabaseUser.auth.getUser();

  if (user && !authError) {
    return user.id;
  }

  const oauthResult = await validateDonnyToken(req);
  if (!oauthResult) {
    throw new Error("Unauthorized");
  }
  if (!requireScope(oauthResult.scopes, "donny:campaigns")) {
    throw new Error("Insufficient scope: donny:campaigns required");
  }
  return oauthResult.user_id;
}

// ---------------------------------------------------------------------------
// Claude API helpers
// ---------------------------------------------------------------------------

function buildPromptForType(
  previewType: PreviewType,
  campaign: Record<string, unknown>,
  styleNotes?: string,
): string {
  const campaignContext = [
    `Campaign title: ${campaign.title ?? "Untitled"}`,
    campaign.description ? `Description: ${campaign.description}` : null,
    (campaign.budget_min != null || campaign.budget_max != null)
      ? `Budget: $${campaign.budget_min ?? "?"} – $${campaign.budget_max ?? "?"}`
      : null,
    campaign.goals ? `Goals: ${campaign.goals}` : null,
    campaign.style ? `Style: ${campaign.style}` : null,
    campaign.tone ? `Tone: ${campaign.tone}` : null,
    campaign.platforms ? `Platforms: ${Array.isArray(campaign.platforms) ? (campaign.platforms as string[]).join(", ") : campaign.platforms}` : null,
    campaign.deliverables ? `Deliverables: ${campaign.deliverables}` : null,
    campaign.content_source ? `Content source: ${campaign.content_source}` : null,
    campaign.delivery_type ? `Delivery type: ${campaign.delivery_type}` : null,
    styleNotes ? `Style notes: ${styleNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const typeInstructions: Record<PreviewType, string> = {
    mood_board: `Generate a mood board as JSON with these exact keys:
- color_palette: array of 5-7 hex color strings
- typography: { heading: font name, body: font name }
- layout_description: string describing the visual layout
- reference_descriptions: array of 3-5 strings describing reference images/visuals that would fit this campaign`,

    content_template: `Generate a content template as JSON with these exact keys:
- platform: the best platform for this campaign
- dimensions: string like "1080x1920" or "1080x1080"
- zones: array of objects { name: string, position: string (e.g. "top-left"), description: string }
- text_overlays: array of suggested text overlay strings`,

    storyboard: `Generate a storyboard as JSON with these exact keys:
- frames: array of 4-8 objects { frame_number: number, duration_seconds: number, scene_description: string, camera_angle: string, text_overlay?: string, transition?: string }`,

    example_clip: `Generate an example clip plan as JSON with these exact keys:
- total_duration: string like "30s" or "60s"
- hook: string describing the opening hook
- scenes: array of 3-6 objects { timestamp: string, action: string, visual_style: string, audio_mood: string }
- cta: string describing the call-to-action`,

    thumbnail: `Generate a thumbnail design as JSON with these exact keys:
- layout: string describing the overall layout
- text_zones: array of strings describing where text goes and what it says
- visual_elements: array of strings describing key visual elements`,
  };

  return `${campaignContext}\n\nGenerate a ${previewType.replace(/_/g, " ")} for this campaign.\n\n${typeInstructions[previewType]}\n\nReturn ONLY valid JSON, no markdown fences or extra text.`;
}

interface ClaudeCallResult {
  text: string;
  usage: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  prompt: string,
  systemPrompt: string,
  modelConfig: ReturnType<typeof getModelConfig>,
): Promise<ClaudeCallResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
  }

  const result = await response.json();
  const textBlock = result.content?.find(
    (b: { type: string }) => b.type === "text",
  );
  return {
    text: textBlock?.text ?? "",
    usage: result.usage ?? { input_tokens: 0, output_tokens: 0 },
  };
}

function parseJsonFromResponse(raw: string): Record<string, unknown> {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Extract from markdown fences or surrounding text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Failed to parse AI-generated JSON");
    }
    return JSON.parse(match[0]);
  }
}

function generateMoodBoardSvg(
  previewData: Record<string, unknown>,
  title: string,
): string {
  const colors = (previewData.color_palette as string[]) ?? [
    "#4DD9C0",
    "#F9A8D4",
    "#111111",
  ];
  const typography = (previewData.typography as { heading: string; body: string }) ?? {
    heading: "Inter",
    body: "Inter",
  };
  const refs = (previewData.reference_descriptions as string[]) ?? [];

  const colorSwatches = colors
    .map(
      (c, i) =>
        `<rect x="${20 + i * 70}" y="80" width="60" height="60" rx="8" fill="${c}" />
     <text x="${20 + i * 70 + 30}" y="160" text-anchor="middle" font-size="10" fill="#555">${c}</text>`,
    )
    .join("\n");

  const refTexts = refs
    .map(
      (r, i) =>
        `<text x="20" y="${220 + i * 24}" font-size="12" fill="#555" font-family="${typography.body}">• ${r.length > 60 ? r.slice(0, 57) + "..." : r}</text>`,
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 ${260 + refs.length * 24}" width="600" height="${260 + refs.length * 24}">
  <rect width="100%" height="100%" fill="#FFFFFF" rx="16" />
  <text x="20" y="40" font-size="24" font-weight="bold" font-family="${typography.heading}" fill="#111">${title}</text>
  <text x="20" y="65" font-size="14" fill="#888" font-family="${typography.body}">Mood Board — ${typography.heading} / ${typography.body}</text>
  ${colorSwatches}
  <text x="20" y="200" font-size="14" font-weight="bold" fill="#111" font-family="${typography.heading}">Visual References</text>
  ${refTexts}
</svg>`;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are Donny, DragonCandy's creative director AI. Generate structured creative preview data for social media campaigns. Be specific, actionable, and on-brand. Always return valid JSON.";

async function handleGenerate(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { campaign_id, preview_types, style_notes } = body as {
    campaign_id: string;
    preview_types: string[];
    style_notes?: string;
  };

  if (!campaign_id) {
    return jsonResponse(req, { success: false, error: "campaign_id is required" }, 400);
  }
  if (!preview_types || !Array.isArray(preview_types) || preview_types.length === 0) {
    return jsonResponse(req, { success: false, error: "preview_types array is required" }, 400);
  }

  const invalidTypes = preview_types.filter(
    (t) => !VALID_PREVIEW_TYPES.includes(t as PreviewType),
  );
  if (invalidTypes.length > 0) {
    return jsonResponse(req, {
        success: false,
        error: `Invalid preview types: ${invalidTypes.join(", ")}. Valid: ${VALID_PREVIEW_TYPES.join(", ")}`,
      },
      400,
    );
  }

  // Fetch campaign data
  const { data: campaign, error: campaignErr } = await supabaseAdmin
    .from("campaigns")
    .select("id, title, description, budget_min, budget_max, goals, style, tone, platforms, deliverables, content_source, delivery_type")
    .eq("id", campaign_id)
    .single();

  if (campaignErr || !campaign) {
    return jsonResponse(req, { success: false, error: "Campaign not found" }, 404);
  }

  const usageStage = await getUserUsageStage(supabaseAdmin, userId);
  const modelConfig = getModelConfig("donny-campaign-preview", usageStage);

  const previews: Record<string, unknown>[] = [];

  for (let i = 0; i < preview_types.length; i++) {
    const previewType = preview_types[i] as PreviewType;
    const prompt = buildPromptForType(previewType, campaign, style_notes);
    const { text: raw, usage } = await callClaude(prompt, SYSTEM_PROMPT, modelConfig);
    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-campaign-preview",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
    const previewData = parseJsonFromResponse(raw);

    const title = `${previewType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — ${campaign.title}`;
    const description = `AI-generated ${previewType.replace(/_/g, " ")} for campaign "${campaign.title}"`;

    let mediaUrl: string | null = null;

    // For mood_board, generate and upload SVG
    if (previewType === "mood_board") {
      const svg = generateMoodBoardSvg(previewData, campaign.title ?? "Campaign");
      const fileName = `${campaign_id}/${previewType}_${Date.now()}.svg`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from("campaign-previews")
        .upload(fileName, new Blob([svg], { type: "image/svg+xml" }), {
          contentType: "image/svg+xml",
          upsert: true,
        });

      if (!uploadErr) {
        const { data: urlData } = supabaseAdmin.storage
          .from("campaign-previews")
          .getPublicUrl(fileName);
        mediaUrl = urlData?.publicUrl ?? null;
      }
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("donny_campaign_previews")
      .insert({
        campaign_id,
        user_id: userId,
        preview_type: previewType,
        title,
        description,
        preview_data: previewData,
        media_url: mediaUrl,
        ai_prompt_used: prompt,
        generation_model: modelConfig.model,
        sort_order: i,
      })
      .select()
      .single();

    if (insertErr) {
      return jsonResponse(req, { success: false, error: insertErr.message }, 500);
    }

    previews.push(inserted);
  }

  return jsonResponse(req, { success: true, data: { previews } });
}

async function handleRegenerate(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { preview_id, style_notes } = body as {
    preview_id: string;
    style_notes: string;
  };

  if (!preview_id) {
    return jsonResponse(req, { success: false, error: "preview_id is required" }, 400);
  }

  // Fetch original preview
  const { data: original, error: fetchErr } = await supabaseAdmin
    .from("donny_campaign_previews")
    .select("id, campaign_id, user_id, preview_type, ai_prompt_used, sort_order")
    .eq("id", preview_id)
    .single();

  if (fetchErr || !original) {
    return jsonResponse(req, { success: false, error: "Preview not found" }, 404);
  }

  // Build new prompt from original + style notes
  const newPrompt = `${original.ai_prompt_used}\n\nAdditional style notes: ${style_notes}`;
  const usageStage = await getUserUsageStage(supabaseAdmin, userId);
  const modelConfig = getModelConfig("donny-campaign-preview", usageStage);
  const { text: raw, usage } = await callClaude(newPrompt, SYSTEM_PROMPT, modelConfig);
  await logCost(supabaseAdmin, {
    userId,
    edgeFunction: "donny-campaign-preview",
    model: modelConfig.model,
    tier: modelConfig.tier,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  });
  await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
  const previewData = parseJsonFromResponse(raw);

  // Fetch campaign for title
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("title")
    .eq("id", original.campaign_id)
    .single();

  const previewType = original.preview_type as PreviewType;
  const title = `${previewType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — ${campaign?.title ?? "Campaign"}`;

  let mediaUrl: string | null = null;

  if (previewType === "mood_board") {
    const svg = generateMoodBoardSvg(previewData, campaign?.title ?? "Campaign");
    const fileName = `${original.campaign_id}/${previewType}_${Date.now()}.svg`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("campaign-previews")
      .upload(fileName, new Blob([svg], { type: "image/svg+xml" }), {
        contentType: "image/svg+xml",
        upsert: true,
      });

    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage
        .from("campaign-previews")
        .getPublicUrl(fileName);
      mediaUrl = urlData?.publicUrl ?? null;
    }
  }

  // Update existing preview record
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("donny_campaign_previews")
    .update({
      title,
      preview_data: previewData,
      media_url: mediaUrl,
      ai_prompt_used: newPrompt,
      is_approved: false,
    })
    .eq("id", preview_id)
    .select()
    .single();

  if (updateErr) {
    return jsonResponse(req, { success: false, error: updateErr.message }, 500);
  }

  return jsonResponse(req, { success: true, data: updated });
}

async function handleList(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { campaign_id } = body as { campaign_id: string };

  if (!campaign_id) {
    return jsonResponse(req, { success: false, error: "campaign_id is required" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("donny_campaign_previews")
    .select("*")
    .eq("campaign_id", campaign_id)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }

  return jsonResponse(req, { success: true, data: { previews: data } });
}

async function handleApprove(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Response> {
  const { preview_id, is_approved } = body as {
    preview_id: string;
    is_approved: boolean;
  };

  if (!preview_id) {
    return jsonResponse(req, { success: false, error: "preview_id is required" }, 400);
  }
  if (typeof is_approved !== "boolean") {
    return jsonResponse(req, { success: false, error: "is_approved (boolean) is required" }, 400);
  }

  // Verify user owns the preview
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("donny_campaign_previews")
    .select("id, user_id")
    .eq("id", preview_id)
    .single();

  if (fetchErr || !existing) {
    return jsonResponse(req, { success: false, error: "Preview not found" }, 404);
  }
  if (existing.user_id !== userId) {
    return jsonResponse(req, { success: false, error: "Unauthorized" }, 403);
  }

  const { data, error } = await supabaseAdmin
    .from("donny_campaign_previews")
    .update({ is_approved })
    .eq("id", preview_id)
    .select()
    .single();

  if (error) {
    return jsonResponse(req, { success: false, error: error.message }, 500);
  }

  return jsonResponse(req, { success: true, data });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { success: false, error: "Method not allowed" }, 405);
    }

    const userId = await authenticateRequest(req);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const hourlyCheck = await checkHourlyRateLimit(supabaseAdmin, userId);
    if (!hourlyCheck.allowed) {
      return jsonResponse(req, { error: "rate_limited", retry_after: hourlyCheck.retryAfterSeconds }, 429);
    }

    const body = await req.json();
    const { action } = body as { action: string };

    switch (action) {
      case "generate":
        return await handleGenerate(req, userId, body, supabaseAdmin);
      case "regenerate":
        return await handleRegenerate(req, userId, body, supabaseAdmin);
      case "list":
        return await handleList(req, userId, body, supabaseAdmin);
      case "approve":
        return await handleApprove(req, userId, body, supabaseAdmin);
      default:
        return jsonResponse(req, {
            success: false,
            error: `Unknown action: ${action}. Valid actions: generate, regenerate, list, approve`,
          },
          400,
        );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAuthError =
      msg.includes("Unauthorized") ||
      msg.includes("authorization") ||
      msg.includes("scope");
    return jsonResponse(req, { success: false, error: msg },
      isAuthError ? 401 : 500,
    );
  }
});
