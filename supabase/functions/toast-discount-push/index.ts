// TASK-010: toast-discount-push — syncs DragonCandy promotions to Toast discounts
//
// GATED ON PARTNER TIER. Current implementation is a STUB for standard-access
// tier. It logs the intent, writes a ledger row, and returns 200 so the UI
// shows "Tier-Unavailable" rather than "Failed".
//
// When partner tier is approved, replace the stub block with the actual
// POST to Toast's discount config endpoint.
//
// ENV required:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   TOAST_DISCOUNT_ENDPOINT (future — not read in stub mode)
//
// Body: { promotion_id, action: 'publish' | 'update' | 'end', payload: {...} }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json();
    const { promotion_id, action, payload } = body as {
      promotion_id: string;
      action: "publish" | "update" | "end";
      payload?: Record<string, unknown>;
    };

    if (!promotion_id || !action) {
      return new Response(
        JSON.stringify({ error: "promotion_id and action are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } },
      );
    }

    // --- Look up the restaurant's Toast connection ---
    // Join through promotions → business_profiles → toast_connections
    const { data: promotion, error: promoError } = await supabase
      .from("promotions")
      .select("id, business_id, title")
      .eq("id", promotion_id)
      .single();

    if (promoError || !promotion) {
      return new Response(
        JSON.stringify({ error: "Promotion not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders(req) } },
      );
    }

    const { data: connection } = await supabase
      .from("toast_connections")
      .select("id, restaurant_guid, status")
      .eq("business_id", promotion.business_id)
      .eq("status", "active")
      .maybeSingle();

    // --- No active connection → Not-Connected ---
    if (!connection) {
      return new Response(
        JSON.stringify({
          sync_status: "not_connected",
          message: "No active Toast connection for this business",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } },
      );
    }

    // =========================================================================
    // TIER GATE — Standard tier stub
    // =========================================================================
    // Partner tier is not yet approved. Log intent and return Tier-Unavailable.
    // When partner access is granted:
    //   1. Add TOAST_DISCOUNT_ENDPOINT env var
    //   2. Replace this block with the actual POST to Toast
    //   3. Change event_type to 'discount_push' with status 'success'/'failed'
    // =========================================================================

    console.warn(
      `toast-discount-push: SKIPPED (standard tier) — ` +
      `promotion=${promotion_id}, action=${action}, restaurant=${connection.restaurant_guid}`,
    );

    // --- Ledger-first: record the skipped attempt ---
    await supabase.from("toast_sync_events").insert({
      connection_id: connection.id,
      event_type: "discount_push_skipped_tier",
      direction: "outbound",
      status: "skipped",
      request_payload: {
        promotion_id,
        promotion_title: promotion.title,
        action,
        ...(payload || {}),
      },
      response_payload: {
        reason: "tier_unavailable",
        message:
          "Partner tier not yet approved. Discount code generation remains internal to DragonCandy.",
      },
    });

    return new Response(
      JSON.stringify({
        sync_status: "tier_unavailable",
        message:
          "Toast partner tier required for discount sync. " +
          "DragonCandy will continue generating codes internally.",
        promotion_id,
        action,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } },
    );
  } catch (error: unknown) {
    console.error("toast-discount-push: unexpected error", error);
    return new Response(
      JSON.stringify({
        error: "server_error",
        message: (error as Error)?.message || "Unexpected error",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } },
    );
  }
});
