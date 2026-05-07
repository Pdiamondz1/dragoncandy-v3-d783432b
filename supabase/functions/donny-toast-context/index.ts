// TASK-018: donny-toast-context — aggregates Toast read-model views into a
// single compact JSON payload for Donny's get_toast_insights tool.
//
// Scoped to the calling restaurant's business_id. 30-day lookback enforced.
// Returns empty arrays (never null) when no data exists.
//
// ENV required:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    // Authenticate via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Resolve the user's business_id
    const { data: bizProfile, error: bizError } = await supabaseAdmin
      .from("business_profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (bizError || !bizProfile) {
      return new Response(JSON.stringify({ error: "No business profile found" }), {
        status: 404,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const businessId = bizProfile.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all three views in parallel, scoped to business_id
    const [menuResult, trafficResult, redemptionResult] = await Promise.all([
      supabaseAdmin
        .from("toast_menu_performance")
        .select("*")
        .eq("business_id", businessId),
      supabaseAdmin
        .from("toast_traffic_patterns")
        .select("*")
        .eq("business_id", businessId),
      supabaseAdmin
        .from("toast_redemption_history")
        .select("*")
        .eq("business_id", businessId)
        .gte("last_redemption_at", thirtyDaysAgo),
    ]);

    // Never return null — empty arrays as fallback
    const payload = {
      business_id: businessId,
      lookback_days: 30,
      generated_at: new Date().toISOString(),
      menu_performance: menuResult.data ?? [],
      traffic_patterns: trafficResult.data ?? [],
      redemption_history: redemptionResult.data ?? [],
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[donny-toast-context] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
