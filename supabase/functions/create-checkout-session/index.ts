import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { corsHeaders } from "../_shared/cors.ts";
import { testModePaymentMethodTypes } from "../_shared/test-mode-payment-methods.ts";
import { testModeCustomText } from "../_shared/test-mode-text.ts";

// Base price IDs per tier and billing period
const BASE_PRICES: Record<string, Record<string, string>> = {
  starter: { monthly: 'price_1TUHaMJi7lqzzhdMW9vjJIpb', annual: 'price_1TUHaPJi7lqzzhdM3IFf3Zqa' },
  growth:  { monthly: 'price_1TUHaSJi7lqzzhdMwmOKQnRa', annual: 'price_1TUHaUJi7lqzzhdMWNiKolGJ' },
  pro:     { monthly: 'price_1TUHaXJi7lqzzhdMDZPUOSFJ', annual: 'price_1TUHaaJi7lqzzhdMjFiX0cJl' },
};

// Per-seat add-on price IDs per tier
const SEAT_PRICES: Record<string, string> = {
  starter: 'price_1TUHagJi7lqzzhdMmQzixpeE',
  growth:  'price_1TUHajJi7lqzzhdM2J8RXusW',
  pro:     'price_1TUHamJi7lqzzhdMZiv9kst7',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')!;
    const siteUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://dragoncandy.io';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' });

    // Authenticate user via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { tier, billing_period, org_id } = await req.json();

    if (!tier || !billing_period || !org_id) {
      return new Response(JSON.stringify({ error: 'tier, billing_period, and org_id are required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!BASE_PRICES[tier] || !BASE_PRICES[tier][billing_period]) {
      return new Response(JSON.stringify({ error: 'Invalid tier or billing_period' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Verify user is org owner
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .eq('invitation_status', 'active')
      .single();

    if (membership?.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only org owners can manage billing' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Look up org to find or create Stripe customer
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id, seat_count')
      .eq('id', org_id)
      .single();

    if (orgError || !org) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    let customerId = org.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id, user_id: user.id },
      });
      customerId = customer.id;

      const { error: custError } = await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org_id);

      if (custError) {
        console.error('[create-checkout-session] Failed to store customer ID:', custError.message);
        return new Response(JSON.stringify({ error: 'Failed to link payment account' }), {
          status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
        });
      }
    }

    // Build line items: base price + per-seat add-on
    const additionalSeats = Math.max(0, (org.seat_count ?? 1) - 1);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: BASE_PRICES[tier][billing_period], quantity: 1 },
    ];

    if (additionalSeats > 0 && SEAT_PRICES[tier]) {
      lineItems.push({ price: SEAT_PRICES[tier], quantity: additionalSeats });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: lineItems,
      payment_method_types: testModePaymentMethodTypes(stripeSecretKey),
      custom_text: testModeCustomText(stripeSecretKey),
      metadata: { tier, billing_period, org_id },
      success_url: `${siteUrl}/dashboard/business?checkout=success`,
      cancel_url: `${siteUrl}/pricing`,
    });

    return new Response(JSON.stringify({ checkout_url: session.url }), {
      status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[create-checkout-session]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
