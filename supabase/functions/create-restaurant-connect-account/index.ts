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

    // Check if business already has a Stripe account
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
    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";
    const isTestMode = stripeKey.startsWith('sk_test_');

    // Resolution order: org_units first (when org_unit_id provided), then business_profiles
    let stripeAccountId: string | null = null;
    let sourceTable: 'org_units' | 'business_profiles' = 'business_profiles';

    if (org_unit_id) {
      const { data: orgUnit } = await supabaseClient
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', org_unit_id)
        .single();

      if (orgUnit?.stripe_account_id) {
        stripeAccountId = orgUnit.stripe_account_id;
        sourceTable = 'org_units';
        logStep("Found existing account in org_units", { stripeAccountId });
      }

      if (isTestMode && orgUnit?.stripe_onboarding_complete) {
        logStep("Test mode: account already fully provisioned", { stripeAccountId });
        return new Response(JSON.stringify({ autoCreated: true, accountId: stripeAccountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    if (!stripeAccountId) {
      stripeAccountId = businessProfile?.stripe_account_id ?? null;
      if (stripeAccountId) {
        logStep("Found existing account in business_profiles", { stripeAccountId });

        // Self-healing: sync stripe_account_id to org_units so dashboard sees it
        if (org_unit_id) {
          const { error: syncError } = await supabaseClient
            .from('org_units')
            .update({ stripe_account_id: stripeAccountId })
            .eq('id', org_unit_id);
          if (syncError) {
            logStep("Warning: Failed to sync stripe_account_id to org_units", { error: syncError.message });
          } else {
            logStep("Self-healed: synced stripe_account_id from business_profiles to org_units", { org_unit_id });
            sourceTable = 'org_units';
          }
        }
      }

      if (isTestMode && businessProfile?.stripe_onboarding_complete) {
        logStep("Test mode: account already fully provisioned", { stripeAccountId });
        return new Response(JSON.stringify({ autoCreated: true, accountId: stripeAccountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    let accountId = stripeAccountId;

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

      if (org_unit_id) {
        sourceTable = 'org_units';
        const { error: updateError } = await supabaseClient
          .from('org_units')
          .update({ stripe_account_id: accountId })
          .eq('id', org_unit_id);

        if (updateError) {
          logStep("Warning: Failed to save stripe_account_id to org_units", { error: updateError.message });
        }
      } else {
        const { error: updateError } = await supabaseClient
          .from('business_profiles')
          .update({ stripe_account_id: accountId })
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant');

        if (updateError) {
          logStep("Warning: Failed to save stripe_account_id to business_profiles", { error: updateError.message });
        }
      }
    } else {
      logStep("Using existing connected account", { accountId });
    }

    // Test mode: auto-provision the account with test data instead of redirecting
    if (isTestMode) {
      logStep("Test mode: auto-provisioning account with test data");

      const nameParts = (businessProfile?.business_name || 'Test Business').split(' ');
      const firstName = nameParts[0] || 'Test';
      const lastName = nameParts.slice(1).join(' ') || 'Business';
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('cf-connecting-ip')
        || '127.0.0.1';

      await stripe.accounts.update(accountId, {
        business_type: 'individual',
        individual: {
          first_name: firstName,
          last_name: lastName,
          email: user.email,
          dob: { day: 1, month: 1, year: 1990 },
          address: {
            line1: '123 Test St',
            city: 'Hoboken',
            state: 'NJ',
            postal_code: '07030',
            country: 'US',
          },
          ssn_last_4: '0000',
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip: clientIp,
        },
      });

      await stripe.accounts.createExternalAccount(accountId, {
        external_account: {
          object: 'bank_account',
          country: 'US',
          currency: 'usd',
          routing_number: '110000000',
          account_number: '000123456789',
        },
      });

      if (sourceTable === 'org_units' && org_unit_id) {
        await supabaseClient
          .from('org_units')
          .update({ stripe_onboarding_complete: true })
          .eq('id', org_unit_id);
      } else {
        await supabaseClient
          .from('business_profiles')
          .update({ stripe_onboarding_complete: true })
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant');
      }

      logStep("Test mode: account fully provisioned", { accountId });
      return new Response(JSON.stringify({ autoCreated: true, accountId }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Production mode: create account link for onboarding
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
      isNew: !stripeAccountId,
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
