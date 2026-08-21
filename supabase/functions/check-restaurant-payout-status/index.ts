import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { flushPendingBalance } from "../_shared/flush-pending-balance.ts";
import { resolveOwnedOrgUnit } from "../_shared/org-unit-access.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-RESTAURANT-PAYOUT] ${step}${detailsStr}`);
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const url = new URL(req.url);
    const org_unit_id = url.searchParams.get('org_unit_id');
    logStep("Query params parsed", { org_unit_id: org_unit_id ?? null });

    const { data: businessProfile, error: profileError } = await supabaseClient
      .from('business_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', user.id)
      .eq('account_type', 'restaurant')
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch business profile: ${profileError.message}`);
    }

    // `org_unit_id` arrives from the query string, and every read/write below runs on the
    // SERVICE-ROLE client — so `org_units`' own active-member RLS never applies. Until this
    // gate existed, naming another tenant's unit returned their Stripe account id and
    // balances, and the write paths further down stamped or cleared their row.
    //
    // Proven on prod 2026-08-08 in a rolled-back transaction against a unit with a live
    // Stripe account: 0 rows visible to an unrelated restaurant user under RLS, 1 row via
    // the service-role client. See `_shared/org-unit-access.ts`.
    //
    // `ownedOrgUnitId` is the ONLY id allowed downstream. A unit that simply doesn't exist
    // degrades to the business_profiles fallback (a non-existent row can leak nothing), but a
    // unit that exists and isn't yours is refused outright rather than silently ignored —
    // quietly falling back would hide a probe that is never legitimate.
    let ownedOrgUnitId: string | null = null;
    if (org_unit_id) {
      const access = await resolveOwnedOrgUnit(supabaseClient, org_unit_id, user.id);
      if (access.ok) {
        ownedOrgUnitId = access.unit.id;
      } else if (access.reason === "lookup_failed") {
        return new Response(JSON.stringify({ error: "Authorization check unavailable" }), {
          status: 503,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      } else if (access.reason !== "not_found") {
        logStep("Blocked org_unit access", { org_unit_id, userId: user.id, reason: access.reason });
        return new Response(JSON.stringify({ error: "Not permitted for this location" }), {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
    }

    // Resolution order: org_units first (when an OWNED org_unit_id was provided), then business_profiles
    let stripeAccountId: string | null = null;
    let resolvedFromFallback = false;

    if (ownedOrgUnitId) {
      const { data: orgUnit } = await supabaseClient
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
        .eq('id', ownedOrgUnitId)
        .single();

      stripeAccountId = orgUnit?.stripe_account_id ?? null;
      if (stripeAccountId) {
        logStep("Found Stripe account in org_units", { stripeAccountId });
      }
    }

    if (!stripeAccountId) {
      stripeAccountId = businessProfile?.stripe_account_id ?? null;
      if (stripeAccountId) {
        resolvedFromFallback = true;
        logStep("Found Stripe account in business_profiles", { stripeAccountId });
      }
    }

    if (!stripeAccountId) {
      logStep("No Stripe account found for restaurant");
      return new Response(JSON.stringify({ 
        hasAccount: false,
        onboardingComplete: false,
        pendingBalance: 0,
        chargesEnabled: false,
        payoutsEnabled: false,
        platformPendingBalance: businessProfile?.pending_balance || 0,
      }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let account: Stripe.Account;
    try {
      account = await stripe.accounts.retrieve(stripeAccountId);
    } catch (retrieveErr: any) {
      if (retrieveErr?.statusCode === 404 || retrieveErr?.code === 'account_invalid') {
        logStep("Stripe account no longer exists, clearing stale reference", { stripeAccountId });
        await supabaseClient
          .from('business_profiles')
          .update({ stripe_account_id: null, stripe_onboarding_complete: false })
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant');
        if (ownedOrgUnitId) {
          await supabaseClient
            .from('org_units')
            .update({ stripe_account_id: null, stripe_onboarding_complete: false })
            .eq('id', ownedOrgUnitId);
        }
        return new Response(JSON.stringify({
          hasAccount: false,
          onboardingComplete: false,
          pendingBalance: 0,
          chargesEnabled: false,
          payoutsEnabled: false,
          platformPendingBalance: businessProfile?.pending_balance || 0,
        }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw retrieveErr;
    }
    logStep("Retrieved Stripe account", {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    });

    const onboardingComplete = account.charges_enabled && account.payouts_enabled;

    // Write onboarding status back to the source table
    if (ownedOrgUnitId) {
      if (resolvedFromFallback) {
        // Self-healing: sync stripe data from business_profiles to org_units
        const { error: syncError } = await supabaseClient
          .from('org_units')
          .update({
            stripe_account_id: stripeAccountId,
            stripe_onboarding_complete: onboardingComplete,
          })
          .eq('id', ownedOrgUnitId);
        if (syncError) {
          logStep("Warning: Failed to sync Stripe data to org_units", { error: syncError.message });
        } else {
          logStep("Self-healed: synced Stripe data from business_profiles to org_units", { org_unit_id: ownedOrgUnitId, stripeAccountId });
        }
      } else {
        const { error: updateError } = await supabaseClient
          .from('org_units')
          .update({ stripe_onboarding_complete: onboardingComplete })
          .eq('id', ownedOrgUnitId);
        if (updateError) {
          logStep("Warning: Failed to update onboarding status in org_units", { error: updateError.message });
        }
      }
    } else if (onboardingComplete !== businessProfile.stripe_onboarding_complete) {
      const { error: updateError } = await supabaseClient
        .from('business_profiles')
        .update({ stripe_onboarding_complete: onboardingComplete })
        .eq('user_id', user.id)
        .eq('account_type', 'restaurant');

      if (updateError) {
        logStep("Warning: Failed to update onboarding status in business_profiles", { error: updateError.message });
      }
    }

    // Onboarding-return backstop: if payout-ready, release any held pending_balance.
    // Best-effort — never fail the status response.
    if (onboardingComplete) {
      try {
        const flush = await flushPendingBalance(stripe, supabaseClient, stripeAccountId);
        if (flush.flushed) logStep("Auto-flushed pending balance", { amount: flush.amount, transferId: flush.transferId });
      } catch (flushErr) {
        logStep("Pending-balance auto-flush failed (non-fatal)", { error: String(flushErr) });
      }
    }

    let availableBalance = 0;
    let pendingStripeBalance = 0;

    if (onboardingComplete) {
      try {
        const balance = await stripe.balance.retrieve({
          stripeAccount: stripeAccountId,
        });

        availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
        pendingStripeBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;
        logStep("Balance retrieved", { availableBalance, pendingStripeBalance });
      } catch (balanceError) {
        logStep("Could not retrieve balance", { error: balanceError });
      }
    }

    return new Response(JSON.stringify({
      hasAccount: true,
      accountId: stripeAccountId,
      onboardingComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      availableBalance,
      pendingBalance: pendingStripeBalance,
      platformPendingBalance: businessProfile.pending_balance || 0,
    }), {
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
