import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CREATOR-CONNECT] ${step}${detailsStr}`);
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

    // Check if creator already has a Stripe account
    const { data: creatorProfile, error: profileError } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, creator_name')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch creator profile: ${profileError.message}`);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";
    const isTestMode = stripeKey.startsWith('sk_test_');

    let accountId = creatorProfile?.stripe_account_id;

    if (isTestMode && creatorProfile?.stripe_onboarding_complete) {
      logStep("Test mode: account already fully provisioned", { accountId });
      return new Response(JSON.stringify({ autoCreated: true, accountId }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If no existing account, create one
    if (!accountId) {
      logStep("Creating new Express connected account");

      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        metadata: {
          user_id: user.id,
          platform: 'dragoncandy',
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: creatorProfile?.creator_name || undefined,
          product_description: 'Content creation services via DragonCandy marketplace',
        },
      });

      accountId = account.id;
      logStep("Express account created", { accountId });

      // Save the account ID to creator profile
      const { error: updateError } = await supabaseClient
        .from('creator_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id);

      if (updateError) {
        logStep("Warning: Failed to save stripe_account_id", { error: updateError.message });
      }
    } else {
      logStep("Using existing connected account", { accountId });
    }

    // Test mode: auto-provision the account with test data instead of redirecting
    if (isTestMode) {
      logStep("Test mode: checking Stripe account state before provisioning");

      const existingAccount = await stripe.accounts.retrieve(accountId);
      if (existingAccount.charges_enabled && existingAccount.payouts_enabled) {
        logStep("Test mode: account already fully onboarded in Stripe, syncing DB");
        await supabaseClient
          .from('creator_profiles')
          .update({ stripe_onboarding_complete: true })
          .eq('user_id', user.id);
        return new Response(JSON.stringify({ autoCreated: true, accountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Existing account with broken capabilities — delete and recreate
      if (creatorProfile?.stripe_account_id) {
        logStep("Test mode: existing account has disabled capabilities, replacing it", { accountId });
        await stripe.accounts.del(accountId);

        const newAccount = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          metadata: {
            user_id: user.id,
            platform: 'dragoncandy',
          },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_profile: {
            name: creatorProfile?.creator_name || undefined,
            product_description: 'Content creation services via DragonCandy marketplace',
          },
        });
        accountId = newAccount.id;
        logStep("Replacement account created", { accountId });
      }

      logStep("Test mode: auto-provisioning account with test data");

      const nameParts = (creatorProfile?.creator_name || 'Test Creator').split(' ');
      const firstName = nameParts[0] || 'Test';
      const lastName = nameParts.slice(1).join(' ') || 'Creator';

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

      await supabaseClient
        .from('creator_profiles')
        .update({ stripe_account_id: accountId, stripe_onboarding_complete: true })
        .eq('user_id', user.id);

      logStep("Test mode: account fully provisioned", { accountId });
      return new Response(JSON.stringify({ autoCreated: true, accountId }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Production mode: create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/creator/settings?stripe_refresh=true`,
      return_url: `${origin}/dashboard/creator/settings?stripe_onboarding=complete`,
      type: 'account_onboarding',
    });

    logStep("Account link created", { url: accountLink.url });

    return new Response(JSON.stringify({
      url: accountLink.url,
      accountId,
      isNew: !creatorProfile?.stripe_account_id
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
