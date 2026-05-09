import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { corsHeaders } from "../_shared/cors.ts";

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
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

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

    const body = await req.json().catch(() => ({}));
    const org_id: string | undefined = body?.org_id;
    const legacy_customer_id: string | undefined = body?.customer_id;

    if (!org_id && !legacy_customer_id) {
      return new Response(JSON.stringify({ error: 'org_id is required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Resolve org by org_id (preferred) or by legacy customer_id (backward compat)
    const orgQuery = supabase.from('organizations').select('id, stripe_customer_id');
    const { data: org } = org_id
      ? await orgQuery.eq('id', org_id).single()
      : await orgQuery.eq('stripe_customer_id', legacy_customer_id!).single();

    if (!org) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 404, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }
    const customer_id = org.stripe_customer_id;
    if (!customer_id) {
      return new Response(JSON.stringify({ error: 'No Stripe customer for this organization' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .eq('invitation_status', 'active')
      .single();

    if (membership?.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only org owners can manage billing' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer_id,
      return_url: `${siteUrl}/dashboard/business`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[create-billing-portal-session]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
