import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveOwnedOrgUnit } from "../_shared/org-unit-access.ts";
import { isTestKey } from "../_shared/stripe-mode.ts";

const logStep = (step: string, details?: any) => {
  console.log(`[GET-STRIPE-DASHBOARD-LINK] ${step}`, details ? JSON.stringify(details) : '');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    logStep('Starting dashboard link generation');

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Authentication failed");
    logStep('User authenticated', { userId: user.id });

    const url = new URL(req.url);
    const orgUnitId = url.searchParams.get('org_unit_id');

    let stripeAccountId: string | null = null;

    // `org_unit_id` is caller-supplied and this runs on the SERVICE-ROLE client, so `org_units`'
    // active-member RLS never applies. The resolved account is handed to
    // `stripe.accounts.createLoginLink` — a session into that account's Stripe Express
    // dashboard.
    //
    // This one is INERT TODAY and that is exactly why it is being fixed now: prod runs
    // test-mode keys with Custom accounts, for which `createLoginLink` throws for every
    // account, so the handler falls through to its "not available for test accounts" branch
    // and nothing leaks. The day live keys are used (Express accounts), the same unchanged
    // code becomes connected-account takeover. Don't wait for the flag flip to close it.
    //
    // Proven on prod 2026-08-08 in a rolled-back transaction. See `_shared/org-unit-access.ts`.
    if (orgUnitId) {
      const access = await resolveOwnedOrgUnit(supabaseClient, orgUnitId, user.id);
      if (!access.ok && access.reason === "lookup_failed") {
        return new Response(JSON.stringify({ error: 'Authorization check unavailable' }), {
          status: 503,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
      if (!access.ok && access.reason !== "not_found") {
        logStep('Blocked org_unit access', { orgUnitId, userId: user.id, reason: access.reason });
        return new Response(JSON.stringify({ error: 'Not permitted for this location' }), {
          status: 403,
          headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }

      if (access.ok && access.unit.stripe_account_id && access.unit.stripe_onboarding_complete) {
        stripeAccountId = access.unit.stripe_account_id;
        logStep('Found Stripe account in org_units', { accountId: stripeAccountId });
      }
    }

    // Check creator_profiles
    if (!stripeAccountId) {
      const { data: creatorProfile } = await supabaseClient
        .from('creator_profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();

      if (creatorProfile?.stripe_account_id && creatorProfile?.stripe_onboarding_complete) {
        stripeAccountId = creatorProfile.stripe_account_id;
        logStep('Found creator Stripe account', { accountId: stripeAccountId });
      }
    }

    // Check business_profiles
    if (!stripeAccountId) {
      const { data: businessProfile } = await supabaseClient
        .from('business_profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('user_id', user.id)
        .maybeSingle();

      if (businessProfile?.stripe_account_id && businessProfile?.stripe_onboarding_complete) {
        stripeAccountId = businessProfile.stripe_account_id;
        logStep('Found business Stripe account', { accountId: stripeAccountId });
      }
    }

    if (!stripeAccountId) {
      throw new Error("No connected Stripe account found. Please set up your payout account first.");
    }

    // Initialize Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
    });

    // Create login link for the Express account
    let loginUrl: string;
    try {
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      loginUrl = loginLink.url;
    } catch (linkErr) {
      // Test-mode sandbox payout accounts are Custom accounts, which have no
      // Express dashboard, so createLoginLink throws — degrade gracefully there.
      // In live mode, a real failure must surface, so re-throw to the outer
      // error path (preserves the prior 400 behavior).
      if (!isTestKey(stripeKey)) throw linkErr;
      logStep('createLoginLink unavailable (Custom/test account)', { error: (linkErr as Error).message });
      return new Response(
        JSON.stringify({ success: false, error: 'Dashboard link not available for test accounts.' }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
      );
    }

    logStep('Dashboard link created successfully');

    return new Response(
      JSON.stringify({ url: loginUrl, success: true }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep('Error creating dashboard link', { error: error.message });
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
      }),
      {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
