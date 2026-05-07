import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  console.log(`[DONNY-DS-SCORE] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { post_id } = await req.json();
    if (!post_id) throw new Error("Missing post_id");

    logStep("Scoring post", { post_id });

    const { data: post, error: postError } = await supabase
      .from("dragonshare_posts")
      .select("*, creator:profiles!dragonshare_posts_creator_id_fkey(id, full_name)")
      .eq("id", post_id)
      .single();

    if (postError || !post) throw new Error(`Post not found: ${postError?.message}`);

    const { count: creatorPostCount } = await supabase
      .from("dragonshare_posts")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", post.creator_id)
      .eq("status", "verified");

    const { count: orgBoostCount } = await supabase
      .from("dragonshare_boosts")
      .select("id", { count: "exact", head: true })
      .eq("boosting_org_id", post.target_org_id)
      .in("status", ["captured", "transferred"]);

    const platformMultiplier: Record<string, number> = {
      tiktok: 1.3, instagram: 1.2, youtube: 1.1, x: 0.9, facebook: 0.8, other: 0.7,
    };
    const contentMultiplier: Record<string, number> = {
      reel: 1.4, video: 1.3, carousel: 1.1, story: 0.9, photo: 1.0,
    };

    const baseReach = 1500;
    const platformFactor = platformMultiplier[post.platform] ?? 1.0;
    const contentFactor = contentMultiplier[post.content_type] ?? 1.0;
    const experienceFactor = Math.min(1.5, 1 + (creatorPostCount ?? 0) * 0.1);

    const estimatedReach = Math.round(baseReach * platformFactor * contentFactor * experienceFactor);
    const matchQuality = Math.min(100, Math.round(50 + (orgBoostCount ?? 0) * 5 + (creatorPostCount ?? 0) * 3));

    let recommendedTier: number;
    if (estimatedReach >= 5000) recommendedTier = 250;
    else if (estimatedReach >= 3000) recommendedTier = 100;
    else if (estimatedReach >= 1500) recommendedTier = 50;
    else recommendedTier = 25;

    const rationale = `${post.platform} ${post.content_type} with est. ${estimatedReach.toLocaleString()} reach. Creator has ${creatorPostCount ?? 0} verified posts.`;

    logStep("Score calculated", { estimatedReach, recommendedTier, matchQuality });

    const { error: updateError } = await supabase
      .from("dragonshare_posts")
      .update({
        donny_recommended_tier: recommendedTier,
        donny_score: matchQuality,
        donny_reach_estimate: estimatedReach,
      })
      .eq("id", post_id);

    if (updateError) logStep("ERROR: Failed to update post score", { error: updateError.message });

    await supabase.from("dragonshare_events").insert({
      event_type: "donny_score_generated",
      actor_user_id: post.creator_id,
      post_id: post_id,
      payload: { estimatedReach, recommendedTier, matchQuality, rationale },
    });

    return new Response(JSON.stringify({
      estimated_reach: estimatedReach,
      recommended_tier: recommendedTier,
      match_quality: matchQuality,
      rationale,
    }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
