import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

interface CaptionRequest {
  campaign_title: string;
  campaign_description: string;
  content_type: string;
  party_role: "restaurant" | "creator" | "brand";
  platform: string;
  user_id: string;
}

const ROLE_PROMPTS: Record<string, string> = {
  restaurant:
    "You are writing a social media caption for a restaurant posting campaign content. Use a promotional, inviting tone. Include a call-to-action. Mention the restaurant experience.",
  creator:
    "You are writing a social media caption for a content creator sharing their work. Use an authentic, personal tone. Credit the creator's work. Use creator-style language.",
  brand:
    "You are writing a social media caption for a brand amplifying campaign content. Use professional amplification tone. Include sponsor messaging and brand hashtags.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const body = (await req.json()) as CaptionRequest;
    const { campaign_title, campaign_description, content_type, party_role, platform, user_id } = body;

    if (!campaign_title || !party_role || !platform || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const config = getModelConfig("social-caption");

    const response = await anthropicFetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens,
          messages: [
            {
              role: "user",
              content: `${ROLE_PROMPTS[party_role] ?? ROLE_PROMPTS.restaurant}

Campaign: "${campaign_title}"
Description: ${campaign_description || "N/A"}
Content type: ${content_type}
Platform: ${platform}

Write a short, engaging caption (under 200 characters) and suggest 3-5 relevant hashtags.

Respond in JSON: {"caption": "...", "hashtags": ["#tag1", "#tag2"]}`,
            },
          ],
        }),
      },
      0,
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic ${response.status}: ${errText.slice(0, 300)}`);
    }

    const data = await response.json();
    const rawContent = data.content?.[0]?.text ?? "{}";
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await logCost(supabaseAdmin, {
      userId: user_id,
      edgeFunction: "social-caption",
      model: config.model,
      tier: config.tier,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    });

    return new Response(
      JSON.stringify({ caption: parsed.caption ?? "", hashtags: parsed.hashtags ?? [] }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[social-caption] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
