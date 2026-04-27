import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

interface PitchResult {
  pitch: string;
  suggested_rate: number;
  suggested_portfolio_piece_url: string | null;
  pitch_source: "claude" | "template";
}

function buildTemplatePitch(
  creatorName: string,
  skills: string[] | null,
  rating: number | null
): string {
  const skill = skills?.length ? skills[0] : "content";
  const ratingStr = rating ? `${rating.toFixed(1)}-star` : "top";
  return `${creatorName} — ${skill} specialist with ${ratingStr} rating, ready to deliver.`;
}

function clampRate(
  creatorRate: number | null,
  budgetMin: number | null,
  budgetMax: number | null
): number {
  const base = creatorRate ?? budgetMin ?? 100;
  const min = budgetMin ?? 0;
  const max = budgetMax ?? Infinity;
  return Math.max(min, Math.min(max, base));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (!user || authError) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { creator_id, campaign_id } = await req.json();
    if (!creator_id || !campaign_id) {
      return new Response(
        JSON.stringify({ error: "creator_id and campaign_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch creator profile
    const { data: creator } = await supabaseAdmin
      .from("creator_profiles")
      .select(
        "creator_name, base_rate_per_hour, portfolio_urls, skills, average_rating"
      )
      .eq("user_id", creator_id)
      .single();

    // Fetch campaign
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("title, description, goals, budget_min, budget_max")
      .eq("id", campaign_id)
      .single();

    // Fetch campaign deliverables for content types
    const { data: deliverables } = await supabaseAdmin
      .from("campaign_deliverables")
      .select("content_type")
      .eq("campaign_id", campaign_id)
      .limit(5);

    if (!creator || !campaign) {
      return new Response(
        JSON.stringify({ error: "Creator or campaign not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch last 3 successful deliveries by this creator
    const { data: pastWork } = await supabaseAdmin
      .from("campaign_collaborations")
      .select("campaign_id, campaigns(title)")
      .eq("creator_id", creator_id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(3);

    const suggestedRate = clampRate(
      creator.base_rate_per_hour,
      campaign.budget_min,
      campaign.budget_max
    );

    const portfolioUrls: string[] = creator.portfolio_urls || [];
    const suggestedPortfolio = portfolioUrls[0] || null;

    // Attempt Claude pitch generation with 5-second timeout
    let pitch: string;
    let pitchSource: "claude" | "template" = "template";

    if (ANTHROPIC_API_KEY) {
      const contentTypes =
        deliverables?.map((d: { content_type: string }) => d.content_type).join(", ") || "content";
      const pastTitles =
        pastWork
          ?.map((p: { campaigns: { title: string } | null }) => p.campaigns?.title)
          .filter(Boolean)
          .join(", ") || "none yet";

      const systemPrompt =
        "You are Donny. Write a 1-sentence pitch (max 25 words) from this creator to this business explaining why they're a great fit. Plain text only. No emoji. No greeting. No signoff.";
      const userPrompt = `Creator: ${creator.creator_name}, skills: ${(creator.skills || []).join(", ") || "general"}, rating: ${creator.average_rating ?? "N/A"}, past campaigns: ${pastTitles}.
Campaign: "${campaign.title}" — ${campaign.description || "No description"}. Goals: ${campaign.goals || "N/A"}. Content needed: ${contentTypes}. Budget: $${campaign.budget_min ?? "?"}–$${campaign.budget_max ?? "?"}.`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 100,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const text = data.content?.[0]?.text?.trim();
          if (text && text.length > 0 && text.length <= 200) {
            pitch = text;
            pitchSource = "claude";
          } else {
            pitch = buildTemplatePitch(
              creator.creator_name,
              creator.skills,
              creator.average_rating
            );
          }
        } else {
          console.error("donny-apply-pitch: Claude API error", response.status);
          pitch = buildTemplatePitch(
            creator.creator_name,
            creator.skills,
            creator.average_rating
          );
        }
      } catch (e) {
        clearTimeout(timeout);
        console.error("donny-apply-pitch: Claude timeout or error", e);
        pitch = buildTemplatePitch(
          creator.creator_name,
          creator.skills,
          creator.average_rating
        );
      }
    } else {
      pitch = buildTemplatePitch(
        creator.creator_name,
        creator.skills,
        creator.average_rating
      );
    }

    const result: PitchResult = {
      pitch,
      suggested_rate: suggestedRate,
      suggested_portfolio_piece_url: suggestedPortfolio,
      pitch_source: pitchSource,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("donny-apply-pitch: unexpected error", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
