import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0';
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { org_id } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), {
        status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Verify caller is an admin/owner of this org
    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', caller.id)
      .eq('org_id', org_id)
      .eq('invitation_status', 'active')
      .single();
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return new Response(JSON.stringify({ error: 'Only org admins can sync seats' }), {
        status: 403, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { count } = await supabase
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org_id)
      .eq('invitation_status', 'active');

    const seatCount = count ?? 1;

    await supabase
      .from('organizations')
      .update({ seat_count: seatCount, updated_at: new Date().toISOString() })
      .eq('id', org_id);

    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_subscription_id, subscription_tier')
      .eq('id', org_id)
      .single();

    if (org?.stripe_subscription_id && stripeSecretKey) {
      const stripe = new Stripe(stripeSecretKey, { apiVersion: '2025-08-27.basil' });
      const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

      const seatItem = subscription.items.data.find(
        (item: any) => item.price.recurring?.usage_type !== 'metered' && item.quantity !== undefined
      );

      if (seatItem) {
        const additionalSeats = Math.max(0, seatCount - 1);
        await stripe.subscriptionItems.update(seatItem.id, {
          quantity: additionalSeats,
          proration_behavior: 'create_prorations',
        });
      }
    }

    return new Response(JSON.stringify({ seat_count: seatCount }), {
      status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
