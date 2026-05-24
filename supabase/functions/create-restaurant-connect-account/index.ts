import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-RESTAURANT-CONNECT] ${step}${detailsStr}`);
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
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const body = await req.json().catch(() => ({}));
    const { org_unit_id } = body;
    logStep("Request body parsed", { org_unit_id: org_unit_id ?? null });

    const { data: businessProfile, error: profileError } = await supabaseClient
      .from('business_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, business_name')
      .eq('user_id', user.id)
      .eq('account_type', 'restaurant')
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch business profile: ${profileError.message}`);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://dragoncandy.io";

    // Resolve existing Stripe account: org_units first, then business_profiles
    let accountId: string | null = null;

    if (org_unit_id) {
      const { data: orgUnit } = await supabaseClient
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', org_unit_id)
        .single();

      accountId = orgUnit?.stripe_account_id ?? null;
      if (accountId) {
        logStep("Found existing account in org_units", { accountId });
      }
    }

    if (!accountId) {
      accountId = businessProfile?.stripe_account_id ?? null;
      if (accountId) {
        logStep("Found existing account in business_profiles", { accountId });

        if (org_unit_id) {
          await supabaseClient
            .from('org_units')
            .update({ stripe_account_id: accountId })
            .eq('id', org_unit_id);
          logStep("Synced stripe_account_id to org_units", { org_unit_id });
        }
      }
    }

    // If already fully onboarded, return early
    if (accountId) {
      const existing = await stripe.accounts.retrieve(accountId);
      if (existing.charges_enabled && existing.payouts_enabled) {
        logStep("Account already fully onboarded", { accountId });

        await supabaseClient
          .from('business_profiles')
          .update({ stripe_onboarding_complete: true })
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant');

        if (org_unit_id) {
          await supabaseClient
            .from('org_units')
            .update({ stripe_onboarding_complete: true })
            .eq('id', org_unit_id);
        }

        return new Response(JSON.stringify({ alreadyComplete: true, accountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // Create account if none exists
    if (!accountId) {
      logStep("Creating new Express connected account");

      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        metadata: {
          user_id: user.id,
          platform: 'dragoncandy',
          account_type: 'restaurant',
          org_unit_id: org_unit_id ?? '',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: businessProfile?.business_name || undefined,
          product_description: 'Restaurant business receiving sponsorship payments via DragonCandy marketplace',
        },
      });

      accountId = account.id;
      logStep("Express account created", { accountId });

      await supabaseClient
        .from('business_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id)
        .eq('account_type', 'restaurant');

      if (org_unit_id) {
        await supabaseClient
          .from('org_units')
          .update({ stripe_account_id: accountId })
          .eq('id', org_unit_id);
      }
    }

    // Always use Stripe's hosted onboarding (works in both test and live mode)
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/business/settings?stripe_refresh=true`,
      return_url: `${origin}/dashboard/business/settings?stripe_onboarding=complete`,
      type: 'account_onboarding',
    });

    logStep("Account link created", { url: accountLink.url });

    return new Response(JSON.stringify({
      url: accountLink.url,
      accountId,
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
