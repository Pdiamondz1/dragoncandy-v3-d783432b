import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DISCONNECT-STRIPE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const body = await req.json().catch(() => ({}));
    const { org_unit_id } = body;

    // Resolve which table holds the Stripe account
    let stripeAccountId: string | null = null;
    let pendingBalance = 0;
    let sourceTable: 'org_units' | 'business_profiles' | 'creator_profiles' = 'business_profiles';
    let sourceFilter: Record<string, string> = {};

    // Check org_units first (location-scoped)
    if (org_unit_id) {
      const { data: orgUnit } = await supabaseClient
        .from('org_units')
        .select('stripe_account_id, pending_balance')
        .eq('id', org_unit_id)
        .single();

      if (orgUnit?.stripe_account_id) {
        stripeAccountId = orgUnit.stripe_account_id;
        pendingBalance = orgUnit.pending_balance ?? 0;
        sourceTable = 'org_units';
        sourceFilter = { id: org_unit_id };
        logStep("Found account in org_units", { stripeAccountId });
      }
    }

    // Check creator_profiles
    if (!stripeAccountId) {
      const { data: creator } = await supabaseClient
        .from('creator_profiles')
        .select('stripe_account_id, pending_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (creator?.stripe_account_id) {
        stripeAccountId = creator.stripe_account_id;
        pendingBalance = creator.pending_balance ?? 0;
        sourceTable = 'creator_profiles';
        sourceFilter = { user_id: user.id };
        logStep("Found account in creator_profiles", { stripeAccountId });
      }
    }

    // Check business_profiles
    if (!stripeAccountId) {
      const { data: business } = await supabaseClient
        .from('business_profiles')
        .select('stripe_account_id, pending_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (business?.stripe_account_id) {
        stripeAccountId = business.stripe_account_id;
        pendingBalance = business.pending_balance ?? 0;
        sourceTable = 'business_profiles';
        sourceFilter = { user_id: user.id };
        logStep("Found account in business_profiles", { stripeAccountId });
      }
    }

    if (!stripeAccountId) {
      return new Response(JSON.stringify({ error: 'NO_STRIPE_ACCOUNT' }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Block disconnect if pending balance exists
    if (pendingBalance > 0) {
      logStep("Blocked: pending balance remaining", { pendingBalance });
      return new Response(JSON.stringify({
        error: 'BALANCE_REMAINING',
        balance: pendingBalance,
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 409,
      });
    }

    // Preserve the account ID for potential reconnection, then unlink
    let query = supabaseClient
      .from(sourceTable)
      .update({
        stripe_account_id: null,
        stripe_onboarding_complete: false,
        disconnected_stripe_account_id: stripeAccountId,
      });

    for (const [key, value] of Object.entries(sourceFilter)) {
      query = query.eq(key, value);
    }

    const { error: clearError } = await query;
    if (clearError) {
      logStep("Warning: Failed to clear Stripe fields", { error: clearError.message });
      throw new Error(`Failed to clear Stripe account: ${clearError.message}`);
    }

    logStep("Stripe account disconnected successfully", { sourceTable });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
