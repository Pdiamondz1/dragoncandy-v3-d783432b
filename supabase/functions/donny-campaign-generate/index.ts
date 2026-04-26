import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

interface FetchedContent {
  title: string;
  description: string;
  bodyText: string;
}

async function fetchAndExtract(url: string): Promise<FetchedContent> {
  const response = await fetch(url, {
    headers: { "User-Agent": "DragonCandy-Bot/1.0" },
    redirect: "follow",
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
  role: string | null
): Promise<{ business_context: Record<string, unknown>; campaign_ideas: unknown[] }> {
  const systemPrompt = `You are Donny, a creative AI assistant for DragonCandy — a marketplace connecting restaurants with content creators.

Given information about a business, you will:
1. Extract structured business context (name, location, cuisine, vibe, etc.)
2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign type.

Campaign types to choose from: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.
Platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.
Content types: photo, video_reel, story, carousel, tiktok, youtube_short.
Aspect ratios: 9:16, 16:9, 1:1, 4:5.
Delivery tiers: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days).

Respond ONLY with valid JSON matching this exact schema:
{
  "business_context": {
    "source_url": "<url or empty string>",
    "source_type": "<google_business|instagram|website|yelp|photo|manual>",
    "business_name": "<name>",
    "cuisine_type": "<type or null>",
    "location": { "city": "<city>", "state": "<state or null>", "country": "<country>" },
    "rating": <number or null>,
    "review_count": <number or null>,
    "price_range": "<$ or $$ or $$$ or $$$$ or null>",
    "photos": [],
    "vibe_tags": ["<tag1>", "<tag2>"],
    "review_highlights": ["<highlight1>"],
    "social_links": { "instagram": "<url or null>", "tiktok": "<url or null>", "website": "<url or null>" }
  },
  "campaign_ideas": [
    {
      "id": "<uuid>",
      "emoji": "<single emoji>",
      "title": "<short catchy title>",
      "description": "<one sentence>",
      "campaign_type": "<type>",
      "recommended_platforms": ["<platform>"],
      "deliverables": [
        {
          "description": "<what the creator makes>",
          "content_type": "<type>",
          "platform": "<platform>",
          "aspect_ratio": "<ratio>",
          "estimated_duration": <seconds or null>
        }
      ],
      "budget_range": { "min": <number>, "max": <number> },
      "timeline_days": <number>,
      "tier": "<dragondash|express|standard>",
      "tier_reasoning": "<one sentence why this tier>",
      "style_direction": "<visual style guidance>",
      "target_creator_persona": ["<persona>"],
      "key_messages": ["<message>"],
      "hashtags": ["<hashtag>"]
    }
  ]
}`;

  const userPrompt = `Source type: ${sourceType}
Role: ${role || 'anonymous'}

Business information:
${pageContent}

Generate 3 diverse campaign ideas based on this business.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Dual-client auth: try Supabase JWT first, fallback to Donny OAuth token
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let userId: string;
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (user && !authError) {
      userId = user.id;
    } else {
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!requireScope(oauthResult.scopes, "campaigns:write")) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient scope: campaigns:write required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = oauthResult.user_id;
    }

    // Parse and validate request body
    const body = await req.json();

    // Detect the new "Donny-First" campaign creator format
    const isNewFormat = 'source_type' in body;

    if (isNewFormat) {
      const { source_url, source_type, photo_url, manual_text, role } = body;

      let pageContent = '';

      if (source_type === 'manual' && manual_text) {
        pageContent = manual_text;
      } else if (source_type === 'photo' && photo_url) {
        pageContent = `[Photo uploaded: ${photo_url}]`;
      } else if (source_url) {
        const extracted = await fetchAndExtract(source_url);
        pageContent = `Title: ${extracted.title}\nDescription: ${extracted.description}\nContent: ${extracted.bodyText}`;
      }

      const ideasResponse = await generateCampaignIdeas(pageContent, source_type, role);

      return new Response(JSON.stringify(ideasResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Call OpenAI GPT-4o
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 3000,
        messages: [
          {
            role: "system",
            content: `You are an expert marketing strategist for DragonCandy, a platform connecting brands with social media content creators. Your job is to analyze brand content and generate a complete, compelling campaign draft.

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
}`,
          },
          {
            role: "user",
            content: `Generate a campaign draft based on the following brand information:\n\n${assembledContent}`,
          },
        ],
      }),
    });

    if (!openaiResponse.ok) { throw new Error("OpenAI API error: " + openaiResponse.status); }
    const openaiResult = await openaiResponse.json();
    const rawContent: string = openaiResult.choices?.[0]?.message?.content ?? "";

    // Strip markdown fences if present
    const cleaned = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const campaignData = JSON.parse(cleaned);

    return new Response(
      JSON.stringify({ success: true, data: campaignData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
