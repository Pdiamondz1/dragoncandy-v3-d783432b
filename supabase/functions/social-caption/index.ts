import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

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
  source?: "campaign" | "promotion" | "dragonshare";
  context?: Record<string, string>;
  business_name?: string;
  business_location?: string;
  business_category?: string;
  deliverable_types?: string[];
  campaign_goals?: string;
  deliverable_descriptions?: string[];
  deliverable_number?: number;
  total_deliverables?: number;
  filename?: string;
}

const PLATFORM_CONFIG: Record<string, { maxLength: number; hashtagCount: string; tone: string }> = {
  instagram: { maxLength: 2200, hashtagCount: "10-15", tone: "visual storytelling with emojis, engaging and energetic" },
  tiktok: { maxLength: 300, hashtagCount: "3-5", tone: "casual, trendy, short and punchy with a hook" },
  twitter: { maxLength: 280, hashtagCount: "1-2", tone: "concise, witty, conversational" },
  facebook: { maxLength: 500, hashtagCount: "3-5", tone: "community-focused, warm and inviting" },
  youtube: { maxLength: 5000, hashtagCount: "5-8", tone: "descriptive, SEO-friendly with clear CTA" },
  linkedin: { maxLength: 3000, hashtagCount: "3-5", tone: "professional, value-driven" },
  threads: { maxLength: 500, hashtagCount: "3-5", tone: "conversational, authentic" },
};

const DEFAULT_PLATFORM_CONFIG = { maxLength: 500, hashtagCount: "3-5", tone: "engaging and authentic" };

const ROLE_PROMPTS: Record<string, string> = {
  restaurant:
    "You are a social media manager writing a caption for a restaurant showcasing campaign content. Use an inviting, proud tone that highlights the dining experience. Include a clear call-to-action (visit, reserve, try it). Mention what makes this place special.",
  creator:
    "You are writing a social media caption for a content creator sharing their authentic experience. Use a personal, genuine first-person tone. Talk about what you loved about the experience. Avoid sounding like an ad.",
  brand:
    "You are a social media manager writing a caption for a brand amplifying a creator-restaurant collaboration they sponsored. Use professional co-marketing tone. Reference the partnership value and the experience.",
};

const PROMOTION_PROMPT =
  "You are writing a social media caption for a restaurant sharing a customer's video review. Celebrate the customer, mention the promotion, keep it authentic and grateful. Include a call-to-action inviting others to participate.";

const DRAGONSHARE_ROLE_PROMPTS: Record<string, string> = {
  restaurant:
    "You are writing a caption for a restaurant amplifying a creator's content about their business. Thank the creator, highlight the experience, encourage followers to visit.",
  creator:
    "You are writing a caption for a content creator cross-posting their featured content. Reference the restaurant/business, keep it authentic and personal.",
  brand:
    "You are writing a caption for a brand amplifying sponsored content from a creator-restaurant collaboration. Professional co-marketing tone with brand hashtags.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const body = (await req.json()) as CaptionRequest;
    const {
      campaign_title, campaign_description, content_type, party_role, platform,
      user_id, source, context, business_name, business_location,
      business_category, deliverable_types, campaign_goals, deliverable_descriptions,
      deliverable_number, total_deliverables, filename,
    } = body;

    if (!party_role || !platform) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // --- Authorization -------------------------------------------------------
    // This is an uncapped Claude proxy on the platform's ANTHROPIC_API_KEY that also writes
    // `donny_cost_ledger` — the source of truth for the ≤15%-of-revenue AI kill-switch. It
    // previously read no Authorization header, and `verify_jwt=true` is not a gate because the
    // anon key is a valid JWT shipped in the frontend bundle. Worse, `user_id` came from the
    // BODY, so spend could be attributed to an arbitrary victim, poisoning the very signal
    // `aios_cost_stats()` reports. See [[Service-Role Data Exposure]] check 4 (server-derived ids).
    //
    // Two legitimate caller shapes, so two accepted credentials:
    //   - service role — the three server hooks (fire-campaign / fire-dragonshare /
    //     fire-promotion -social-hook), which pass a `user_id` for a party that is not the caller.
    //   - a signed-in user — three browser call sites, whose id must come from the JWT, never
    //     the body.
    const isIngest = isAuthorizedIngest(req);
    let resolvedUserId: string | null = null;

    if (isIngest) {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      resolvedUserId = user_id; // trusted backend attributing spend to the party it is drafting for
    } else {
      const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (token) {
        const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
        const { data: userData } = await anon.auth.getUser(token);
        resolvedUserId = userData?.user?.id ?? null; // the anon key yields no user — that is the point
      }
      if (!resolvedUserId) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }
    }
    // --- end authorization ---------------------------------------------------

    const config = getModelConfig("social-caption");
    const platformCfg = PLATFORM_CONFIG[platform.toLowerCase()] ?? DEFAULT_PLATFORM_CONFIG;

    const title = campaign_title || context?.title || "Content";
    const description = campaign_description || context?.description || "";

    let systemPrompt: string;
    if (source === "promotion") {
      const customerName = context?.customer_name || "a valued customer";
      const promoTitle = context?.promotion_title || title;
      systemPrompt = `${PROMOTION_PROMPT}\n\nCustomer name: ${customerName}\nPromotion: "${promoTitle}"`;
    } else if (source === "dragonshare") {
      systemPrompt = DRAGONSHARE_ROLE_PROMPTS[party_role] ?? DRAGONSHARE_ROLE_PROMPTS.restaurant;
      const creatorName = context?.creator_name || "";
      const businessName = context?.business_name || "";
      if (creatorName) systemPrompt += `\nCreator: ${creatorName}`;
      if (businessName) systemPrompt += `\nBusiness: ${businessName}`;
    } else {
      systemPrompt = ROLE_PROMPTS[party_role] ?? ROLE_PROMPTS.restaurant;
    }

    const businessContext = [
      business_name ? `Business: ${business_name}` : null,
      business_location ? `Location: ${business_location}` : null,
      business_category ? `Category: ${business_category}` : null,
    ].filter(Boolean).join("\n");

    const deliverableContext = [
      deliverable_types?.length ? `Content types: ${deliverable_types.join(", ")}` : null,
      deliverable_descriptions?.length ? `Deliverable details: ${deliverable_descriptions.join("; ")}` : null,
      campaign_goals ? `Campaign goals: ${campaign_goals}` : null,
    ].filter(Boolean).join("\n");

    const locationHashtagHint = business_location
      ? `Include location-relevant hashtags for ${business_location} (e.g., #${business_location.replace(/[^a-zA-Z]/g, "")}Eats, #${business_location.replace(/[^a-zA-Z]/g, "")}Food).`
      : "";

    const multiDeliverableHint = (total_deliverables ?? 0) > 1
      ? `\nThis is deliverable ${deliverable_number} of ${total_deliverables} in a multi-post series for the same campaign. The file is "${filename ?? "unknown"}". Create a caption that stands on its own and uses a different hook/angle than sibling posts. Vary opening lines and tone while staying on-brand.\n`
      : "";

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
              content: `${systemPrompt}

Campaign: "${title}"
Description: ${description || "N/A"}
${businessContext}
${deliverableContext}
Content type: ${content_type}
Platform: ${platform}

Write an engaging, platform-native caption optimized for ${platform} (aim for under ${platformCfg.maxLength} characters). Tone: ${platformCfg.tone}.${multiDeliverableHint}

Generate ${platformCfg.hashtagCount} relevant hashtags. Always include #DragonDashed as one of the hashtags. ${locationHashtagHint}

The caption should feel like a real social media manager wrote it — specific to this campaign, not generic. Reference the actual content and experience described above.

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

    const hashtags: string[] = parsed.hashtags ?? [];
    if (!hashtags.some((h: string) => h.toLowerCase().includes("dragondashed"))) {
      hashtags.push("#DragonDashed");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await logCost(supabaseAdmin, {
      userId: resolvedUserId, // JWT-derived for browser callers; body value only on the service-role path
      edgeFunction: "social-caption",
      model: config.model,
      tier: config.tier,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    });

    return new Response(
      JSON.stringify({ caption: parsed.caption ?? "", hashtags }),
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
