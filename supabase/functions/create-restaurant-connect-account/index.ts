import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveOwnedOrgUnit } from "../_shared/org-unit-access.ts";
import { isTestKey } from "../_shared/stripe-mode.ts";
import { createTestModeEnabledAccount } from "../_shared/test-mode-connect.ts";

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
    const { org_unit_id, action, previous_account_id } = body;
    logStep("Request body parsed", { org_unit_id: org_unit_id ?? null, action: action ?? null });

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
    const origin = req.headers.get("origin") || "https://dragoncandy.com";

    // `org_unit_id` is body-supplied and everything below runs on the SERVICE-ROLE client, so
    // `org_units`' active-member RLS never applies. This is the highest-blast-radius instance
    // of that gap: naming another tenant's unit returned their connected-account id, and the
    // `account_onboarding` link minted further down is issued FOR THAT ACCOUNT — whoever holds
    // it can complete or alter the account's onboarding, including payout bank details. That
    // is a payout-hijack primitive, not merely a read.
    //
    // Proven on prod 2026-08-08 in a rolled-back transaction: 0 rows under RLS for an
    // unrelated restaurant user, 1 row via the service-role client. See
    // `_shared/org-unit-access.ts`. A unit that doesn't exist degrades to the profile
    // fallback; a unit that exists and isn't yours is refused.
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

    // Resolve existing Stripe account: org_units first, then business_profiles
    let accountId: string | null = null;

    if (ownedOrgUnitId) {
      const { data: orgUnit } = await supabaseClient
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', ownedOrgUnitId)
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

        if (ownedOrgUnitId) {
          await supabaseClient
            .from('org_units')
            .update({ stripe_account_id: accountId })
            .eq('id', ownedOrgUnitId);
          logStep("Synced stripe_account_id to org_units", { org_unit_id: ownedOrgUnitId });
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

        if (ownedOrgUnitId) {
          await supabaseClient
            .from('org_units')
            .update({ stripe_onboarding_complete: true })
            .eq('id', ownedOrgUnitId);
        }

        return new Response(JSON.stringify({ alreadyComplete: true, accountId }), {
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // TEST MODE: instant enabled Custom account, no hosted onboarding. Reached
    // only when not already enabled (the charges/payouts check above returns
    // early), so this also re-provisions an EXISTING but incomplete account
    // (old unverified Express account) by replacing it with a fresh enabled
    // Custom account — Express can't be prefill-enabled. Live mode is unaffected.
    if (isTestKey(stripeKey)) {
      logStep("Test mode — creating instantly-enabled Custom account");
      const requestIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
      const acct = await createTestModeEnabledAccount(stripe, {
        email: user.email,
        businessName: businessProfile?.business_name || undefined,
        productDescription: "Restaurant business receiving sponsorship payments via DragonCandy marketplace",
        metadata: { user_id: user.id, platform: "dragoncandy", account_type: "restaurant", org_unit_id: ownedOrgUnitId ?? "" },
        requestIp,
      });
      await supabaseClient
        .from('business_profiles')
        .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
        .eq('user_id', user.id)
        .eq('account_type', 'restaurant');
      if (ownedOrgUnitId) {
        await supabaseClient
          .from('org_units')
          .update({ stripe_account_id: acct.id, stripe_onboarding_complete: true })
          .eq('id', ownedOrgUnitId);
      }
      logStep("Test account enabled", { accountId: acct.id, charges: acct.charges_enabled, payouts: acct.payouts_enabled });
      return new Response(JSON.stringify({ alreadyComplete: true, accountId: acct.id }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Check for a previously disconnected account
    if (!accountId) {
      let disconnectedId: string | null = null;

      if (ownedOrgUnitId) {
        const { data: ou } = await supabaseClient
          .from('org_units')
          .select('disconnected_stripe_account_id')
          .eq('id', ownedOrgUnitId)
          .single();
        disconnectedId = ou?.disconnected_stripe_account_id ?? null;
      }
      if (!disconnectedId) {
        const { data: bp } = await supabaseClient
          .from('business_profiles')
          .select('disconnected_stripe_account_id')
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant')
          .single();
        disconnectedId = bp?.disconnected_stripe_account_id ?? null;
      }

      if (disconnectedId) {
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
              .from('business_profiles')
              .update({
                stripe_account_id: accountId,
                stripe_onboarding_complete: isComplete,
                disconnected_stripe_account_id: null,
              })
              .eq('user_id', user.id)
              .eq('account_type', 'restaurant');

            if (ownedOrgUnitId) {
              await supabaseClient
                .from('org_units')
                .update({
                  stripe_account_id: accountId,
                  stripe_onboarding_complete: isComplete,
                  disconnected_stripe_account_id: null,
                })
                .eq('id', ownedOrgUnitId);
            }

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
              .from('business_profiles')
              .update({ disconnected_stripe_account_id: null })
              .eq('user_id', user.id)
              .eq('account_type', 'restaurant');
            if (ownedOrgUnitId) {
              await supabaseClient
                .from('org_units')
                .update({ disconnected_stripe_account_id: null })
                .eq('id', ownedOrgUnitId);
            }
          }
        } catch (prevErr: any) {
          logStep("Previous account no longer valid, clearing", {
            error: prevErr?.message,
          });
          await supabaseClient
            .from('business_profiles')
            .update({ disconnected_stripe_account_id: null })
            .eq('user_id', user.id)
            .eq('account_type', 'restaurant');
          if (ownedOrgUnitId) {
            await supabaseClient
              .from('org_units')
              .update({ disconnected_stripe_account_id: null })
              .eq('id', ownedOrgUnitId);
          }
        }
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
          org_unit_id: ownedOrgUnitId ?? '',
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

      if (ownedOrgUnitId) {
        await supabaseClient
          .from('org_units')
          .update({ stripe_account_id: accountId })
          .eq('id', ownedOrgUnitId);
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
