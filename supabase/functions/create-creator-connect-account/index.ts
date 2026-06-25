import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { isTestKey } from "../_shared/stripe-mode.ts";
import { createTestModeEnabledAccount } from "../_shared/test-mode-connect.ts";

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

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const { data: creatorProfile, error: profileError } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, creator_name, disconnected_stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch creator profile: ${profileError.message}`);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://dragoncandy.io";

    let accountId = creatorProfile?.stripe_account_id;

    // If already fully onboarded, return early
    if (accountId) {
      const existing = await stripe.accounts.retrieve(accountId);
      if (existing.charges_enabled && existing.payouts_enabled) {
        logStep("Account already fully onboarded", { accountId });

        await supabaseClient
          .from('creator_profiles')
          .update({ stripe_onboarding_complete: true })
          .eq('user_id', user.id);

        return new Response(JSON.stringify({ alreadyComplete: true, accountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // TEST MODE: skip hosted onboarding entirely. Provision a fully-enabled
    // sandbox Custom account so "Connect" is one tap. We reach here only when the
    // account is NOT already enabled (the charges/payouts check above returns
    // early), so this also re-provisions an EXISTING but incomplete account
    // (e.g. an old hosted-onboarding Express account left unverified) — that
    // incomplete account can't be prefill-enabled (Express needs hosted ToS), so
    // we replace it with a fresh enabled Custom account. Live mode is unaffected.
    if (isTestKey(stripeKey)) {
      logStep("Test mode — creating instantly-enabled Custom account");
      const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
      const acct = await createTestModeEnabledAccount(stripe, {
        email: user.email,
        businessName: creatorProfile?.creator_name || undefined,
        productDescription: "Content creation services via DragonCandy marketplace",
        metadata: { user_id: user.id, platform: "dragoncandy" },
        requestIp,
      });
      await supabaseClient
        .from('creator_profiles')
        .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
        .eq('user_id', user.id);
      logStep("Test account enabled", { accountId: acct.id, charges: acct.charges_enabled, payouts: acct.payouts_enabled });
      return new Response(JSON.stringify({ alreadyComplete: true, accountId: acct.id }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check for a previously disconnected account
    if (!accountId && creatorProfile?.disconnected_stripe_account_id) {
      const disconnectedId = creatorProfile.disconnected_stripe_account_id;
      try {
        const prev = await stripe.accounts.retrieve(disconnectedId);
        const isComplete = prev.charges_enabled && prev.payouts_enabled;

        if (!action) {
          logStep("Found previous account, awaiting user choice", { disconnectedId });
          return new Response(JSON.stringify({
            previousAccount: {
              id: disconnectedId,
              chargesEnabled: prev.charges_enabled,
              payoutsEnabled: prev.payouts_enabled,
              onboardingComplete: isComplete,
            },
          }), {
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
            status: 200,
          });
        }

        if (action === 'reconnect') {
          logStep("Reconnecting to previous account", { disconnectedId });
          accountId = disconnectedId;
          await supabaseClient
            .from('creator_profiles')
            .update({
              stripe_account_id: accountId,
              stripe_onboarding_complete: isComplete,
              disconnected_stripe_account_id: null,
            })
            .eq('user_id', user.id);

          if (isComplete) {
            return new Response(JSON.stringify({ alreadyComplete: true, accountId }), {
              headers: { ...corsHeaders(req), "Content-Type": "application/json" },
              status: 200,
            });
          }
        }

        if (action === 'create_new') {
          logStep("User chose new account, clearing previous reference");
          await supabaseClient
            .from('creator_profiles')
            .update({ disconnected_stripe_account_id: null })
            .eq('user_id', user.id);
        }
      } catch (prevErr: any) {
        logStep("Previous account no longer valid, clearing", { error: prevErr?.message });
        await supabaseClient
          .from('creator_profiles')
          .update({ disconnected_stripe_account_id: null })
          .eq('user_id', user.id);
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

      await supabaseClient
        .from('creator_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', user.id);
    }

    // Always use Stripe's hosted onboarding (works in both test and live mode)
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
