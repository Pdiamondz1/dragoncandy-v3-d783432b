import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[INVOICE-RUSH] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (!user || authError) throw new Error("Unauthorized");

    const { userId } = await req.json() as { userId: string };
    if (userId !== user.id) throw new Error("User ID mismatch");

    logStep("Invoicing rush surcharges", { userId });

    // Rate limit: skip if any row was invoiced in the last minute
    const { data: recentlyInvoiced } = await supabase
      .from("rush_surcharge_log")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "invoiced")
      .gte("invoiced_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);

    if (recentlyInvoiced && recentlyInvoiced.length > 0) {
      logStep("Recently invoiced, skipping", { userId });
      return new Response(JSON.stringify({ invoiced: 0, skipped: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch pending surcharges
    const { data: pending, error: fetchError } = await supabase
      .from("rush_surcharge_log")
      .select("id, campaign_id, platform_count, surcharge_cents")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (fetchError) throw new Error(`Failed to fetch pending rows: ${fetchError.message}`);
    if (!pending || pending.length === 0) {
      logStep("No pending surcharges");
      return new Response(JSON.stringify({ invoiced: 0 }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Look up org via org_members (profiles has no org_id column)
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("invitation_status", "active")
      .limit(1)
      .single();

    if (!membership?.org_id) throw new Error("User has no organization");

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id, subscription_tier, stripe_subscription_id")
      .eq("id", membership.org_id)
      .single();

    if (!org?.stripe_customer_id) throw new Error("Organization has no Stripe customer");
    if (!org.stripe_subscription_id) throw new Error("Organization has no active subscription");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let totalCents = 0;
    let invoicedCount = 0;

    for (const row of pending) {
      // Log pickup event per spec
      await writePaymentEvent(supabase, {
        event_type: "rush_surcharge_logged",
        entity_type: "rush",
        entity_id: row.id,
        campaign_id: row.campaign_id,
        actor_role: "system",
        amount_cents: row.surcharge_cents,
      }, "[INVOICE-RUSH]");

      try {
        const description = `DragonDash Rush — ${row.platform_count} platform${row.platform_count > 1 ? 's' : ''}`;

        const invoiceItem = await stripe.invoiceItems.create({
          customer: org.stripe_customer_id,
          amount: row.surcharge_cents,
          currency: "usd",
          description,
          subscription: org.stripe_subscription_id,
          metadata: { rush_surcharge_log_id: row.id },
        });

        await supabase
          .from("rush_surcharge_log")
          .update({
            status: "invoiced",
            stripe_invoice_item_id: invoiceItem.id,
            invoiced_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await writePaymentEvent(supabase, {
          event_type: "rush_surcharge_invoiced",
          entity_type: "rush",
          entity_id: row.id,
          campaign_id: row.campaign_id,
          actor_role: "system",
          amount_cents: row.surcharge_cents,
          stripe_id: invoiceItem.id,
        }, "[INVOICE-RUSH]");

        totalCents += row.surcharge_cents;
        invoicedCount++;
      } catch (rowErr) {
        const errMsg = rowErr instanceof Error ? rowErr.message : "unknown";
        logStep("Stripe invoice item failed, row stays pending", { rowId: row.id, error: errMsg });

        await writePaymentEvent(supabase, {
          event_type: "rush_surcharge_invoice_failed",
          entity_type: "rush",
          entity_id: row.id,
          campaign_id: row.campaign_id,
          actor_role: "system",
          amount_cents: row.surcharge_cents,
          metadata: { error: errMsg },
        }, "[INVOICE-RUSH]");
      }
    }

    logStep("Invoiced successfully", { count: invoicedCount, totalCents });

    return new Response(
      JSON.stringify({ invoiced: invoicedCount, total_cents: totalCents }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    logStep("ERROR", { error: msg });

    if (msg.includes("Unauthorized") || msg.includes("authorization") || msg.includes("mismatch")) {
      return new Response(JSON.stringify({ error: msg }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
