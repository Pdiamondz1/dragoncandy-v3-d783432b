import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

interface ExternalCreator {
  username: string;
  platform: string;
  displayName?: string;
  followerCount?: string;
  bio?: string;
}

interface MatchFilters {
  niche?: string;
  location?: string;
  min_rating?: number;
  budget_range?: string;
}

interface CreatorProfile {
  user_id: string;
  creator_name: string;
  bio: string | null;
  skills: string[] | null;
  location: string | null;
  city: string | null;
  country: string | null;
  base_rate_per_hour: number | null;
  average_rating: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  avatar_url: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Auth: Supabase JWT or Donny OAuth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!requireScope(oauthResult.scopes, "creators:read")) {
        return new Response(
          JSON.stringify({ error: "Insufficient scope: creators:read required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = oauthResult.user_id;
    }

    const body = await req.json();
    const externalCreator: ExternalCreator = body.external_creator;
    const filters: MatchFilters = body.filters || {};

    if (!externalCreator?.username || !externalCreator?.platform) {
      return new Response(
        JSON.stringify({ error: "external_creator with username and platform is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch creator profiles from database
    let query = supabaseAdmin
      .from("creator_profiles")
      .select("user_id, creator_name, bio, skills, location, city, country, base_rate_per_hour, average_rating, instagram_url, tiktok_url, youtube_url, avatar_url")
      .eq("is_completed", true)
      .limit(50);

    if (filters.location) {
      query = query.or(`city.ilike.%${filters.location}%,country.ilike.%${filters.location}%,location.ilike.%${filters.location}%`);
    }
    if (filters.min_rating) {
      query = query.gte("average_rating", filters.min_rating);
    }

    const { data: creators, error: dbError } = await query;

    if (dbError) {
      console.error("donny-creator-match: db error", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to query creators" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!creators || creators.length === 0) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use AI to score and rank matches
    const creatorSummaries = (creators as CreatorProfile[]).map((c, i) => {
      const socials = [c.instagram_url, c.tiktok_url, c.youtube_url].filter(Boolean);
      return `${i + 1}. ${c.creator_name} | Skills: ${(c.skills || []).join(", ") || "N/A"} | Location: ${c.city || c.country || c.location || "N/A"} | Rating: ${c.average_rating ?? "N/A"} | Rate: $${c.base_rate_per_hour ?? "N/A"}/hr | Bio: ${(c.bio || "").slice(0, 100)} | Socials: ${socials.length}`;
    }).join("\n");

    const prompt = `You are a creator-matching assistant for an influencer marketing platform.

An external creator was found on ${externalCreator.platform}:
- Username: ${externalCreator.username}
- Display Name: ${externalCreator.displayName || "N/A"}
- Followers: ${externalCreator.followerCount || "N/A"}
- Bio: ${externalCreator.bio || "N/A"}
${filters.niche ? `- Niche filter: ${filters.niche}` : ""}

Here are creators on our platform:
${creatorSummaries}

Return the top 5 best matches as a JSON array. Each element must have:
- "index": the 1-based index from the list above
- "match_score": integer 0-100
- "niche_tags": array of 1-3 relevant niche tags
- "reason": one sentence explaining why they match

Return ONLY a valid JSON array, no other text.`;

    const modelConfig = getModelConfig("donny-creator-match");

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: modelConfig.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiResponse.ok) {
      console.error("donny-creator-match: AI API error", aiResponse.status);
      return new Response(
        JSON.stringify({ error: "AI matching failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.content?.[0]?.text || "[]";

    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-creator-match",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: aiData.usage?.input_tokens ?? 0,
      outputTokens: aiData.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);

    let aiMatches: Array<{ index: number; match_score: number; niche_tags: string[]; reason: string }>;
    try {
      const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      aiMatches = JSON.parse(cleaned);
    } catch {
      console.error("donny-creator-match: failed to parse AI response", rawContent);
      aiMatches = [];
    }

    // Map AI results back to creator profiles
    const matches = aiMatches
      .filter((m) => m.index >= 1 && m.index <= creators.length)
      .map((m) => {
        const c = creators[m.index - 1] as CreatorProfile;
        return {
          creator_id: c.user_id,
          name: c.creator_name,
          avatar_url: c.avatar_url || undefined,
          match_score: Math.min(100, Math.max(0, m.match_score)),
          niche_tags: m.niche_tags || [],
          location: c.city || c.country || c.location || undefined,
          rating: c.average_rating || undefined,
          reason: m.reason,
        };
      })
      .sort((a, b) => b.match_score - a.match_score);

    return new Response(
      JSON.stringify({ matches }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("donny-creator-match: unexpected error", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
