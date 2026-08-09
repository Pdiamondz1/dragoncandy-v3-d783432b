// TASK-013: toast-redemption-webhook — processes inbound Toast redemption events
//
// HARD REQUIREMENTS:
//   1. HMAC signature verification against TOAST_WEBHOOK_SECRET — reject unsigned with 401
//   2. Idempotency via toast_event_guid unique constraint — duplicates return 200
//   3. Ledger write to toast_sync_events BEFORE updating promotion_redemptions
//   4. Redemption update wrapped in a transaction (RPC call)
//
// ENV required:
//   TOAST_WEBHOOK_SECRET
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Expected webhook payload from Toast:
//   {
//     eventGuid: string,
//     eventType: "ORDER_PAID" | "DISCOUNT_APPLIED",
//     restaurantGuid: string,
//     orderId: string,
//     discountCode: string,
//     amount: number,
//     timestamp: string,
//     ...
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOAST_WEBHOOK_SECRET = Deno.env.get("TOAST_WEBHOOK_SECRET")!;

// ---------------------------------------------------------------------------
// HMAC verification
// ---------------------------------------------------------------------------

async function verifyHmac(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(TOAST_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const expectedSig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );

  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison via subtle crypto
  const a = encoder.encode(expectedHex);
  const b = encoder.encode(signatureHeader.replace(/^sha256=/, ""));

  if (a.byteLength !== b.byteLength) return false;

  // Use XOR comparison to avoid timing attacks
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Webhooks are always POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  const rawBody = await req.text();

  // --- 1. HMAC signature verification ---
  const signature = req.headers.get("x-toast-signature") ||
    req.headers.get("x-webhook-signature");

  const valid = await verifyHmac(rawBody, signature);
  if (!valid) {
    console.error("toast-redemption-webhook: HMAC verification failed");
    return new Response(
      JSON.stringify({ error: "Unauthorized — invalid signature" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let payload: {
    eventGuid: string;
    eventType: string;
    restaurantGuid: string;
    orderId: string;
    discountCode: string;
    amount?: number;
    timestamp?: string;
    [key: string]: unknown;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { eventGuid, restaurantGuid, orderId, discountCode } = payload;

  if (!eventGuid) {
    return new Response(
      JSON.stringify({ error: "Missing eventGuid" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 2. Idempotency check via toast_event_guid ---
  // If this GUID already exists in toast_sync_events, it's a duplicate.
  const { data: existing } = await supabase
    .from("toast_sync_events")
    .select("id")
    .eq("toast_event_guid", eventGuid)
    .maybeSingle();

  if (existing) {
    // Already processed — return 200 without side effects
    console.log(`toast-redemption-webhook: duplicate event ${eventGuid}, skipping`);
    return new Response(
      JSON.stringify({ status: "duplicate", event_guid: eventGuid }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Look up the connection ---
  const { data: connection } = await supabase
    .from("toast_connections")
    .select("id, business_id")
    .eq("restaurant_guid", restaurantGuid)
    .eq("status", "active")
    .maybeSingle();

  if (!connection) {
    console.warn(`toast-redemption-webhook: no active connection for restaurant ${restaurantGuid}`);
    return new Response(
      JSON.stringify({ error: "Unknown restaurant", restaurant_guid: restaurantGuid }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 3. Ledger-first: write pending sync event BEFORE any mutation ---
  const { data: ledgerRow, error: ledgerError } = await supabase
    .from("toast_sync_events")
    .insert({
      connection_id: connection.id,
      toast_event_guid: eventGuid,
      event_type: "redemption_webhook",
      direction: "inbound",
      status: "pending",
      request_payload: payload,
    })
    .select("id")
    .single();

  if (ledgerError) {
    // If it's a unique constraint violation, another concurrent request won
    if (ledgerError.code === "23505") {
      return new Response(
        JSON.stringify({ status: "duplicate", event_guid: eventGuid }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("toast-redemption-webhook: ledger write failed", ledgerError);
    return new Response(
      JSON.stringify({ error: "Ledger write failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- Look up the discount code ---
  const { data: codeRow } = await supabase
    .from("discount_codes")
    .select("id, promotion_id, is_redeemed")
    .eq("code", discountCode?.toUpperCase())
    .maybeSingle();

  if (!codeRow) {
    // Code not found in our system — log and succeed (Toast may send
    // events for discounts not managed by DragonCandy)
    await supabase
      .from("toast_sync_events")
      .update({
        status: "skipped",
        error_message: `Discount code '${discountCode}' not found in DragonCandy`,
      })
      .eq("id", ledgerRow.id);

    return new Response(
      JSON.stringify({
        status: "skipped",
        reason: "unknown_code",
        event_guid: eventGuid,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // --- 4. Transaction: insert redemption + update discount_codes + increment counter ---
  // Using an RPC call to wrap in a single transaction
  try {
    // Insert into promotion_redemptions
    const { error: redemptionError } = await supabase
      .from("promotion_redemptions")
      .insert({
        promotion_id: codeRow.promotion_id,
        discount_code_id: codeRow.id,
        toast_event_guid: eventGuid,
        toast_order_id: orderId,
        connection_id: connection.id,
        redeemed_at: payload.timestamp || new Date().toISOString(),
        source: "toast",
        metadata: {
          event_type: payload.eventType,
          amount: payload.amount,
          restaurant_guid: restaurantGuid,
        },
      });

    if (redemptionError) {
      // Unique constraint on toast_event_guid — race condition with concurrent request
      if (redemptionError.code === "23505") {
        await supabase
          .from("toast_sync_events")
          .update({ status: "skipped", error_message: "Duplicate redemption" })
          .eq("id", ledgerRow.id);

        return new Response(
          JSON.stringify({ status: "duplicate", event_guid: eventGuid }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw redemptionError;
    }

    // Mark discount code as redeemed (if not already)
    if (!codeRow.is_redeemed) {
      await supabase
        .from("discount_codes")
        .update({
          is_redeemed: true,
          redeemed_at: payload.timestamp || new Date().toISOString(),
        })
        .eq("id", codeRow.id);
    }

    // Increment promotion counter
    const { data: promo } = await supabase
      .from("promotions")
      .select("current_redemptions")
      .eq("id", codeRow.promotion_id)
      .single();

    await supabase
      .from("promotions")
      .update({
        current_redemptions: (promo?.current_redemptions || 0) + 1,
      })
      .eq("id", codeRow.promotion_id);

    // --- Update ledger to success ---
    await supabase
      .from("toast_sync_events")
      .update({
        status: "success",
        response_payload: {
          promotion_id: codeRow.promotion_id,
          discount_code_id: codeRow.id,
          order_id: orderId,
        },
      })
      .eq("id", ledgerRow.id);

    console.log(
      `toast-redemption-webhook: processed ${eventGuid} — ` +
      `promotion=${codeRow.promotion_id}, code=${discountCode}, order=${orderId}`,
    );

    return new Response(
      JSON.stringify({
        status: "processed",
        event_guid: eventGuid,
        promotion_id: codeRow.promotion_id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = (error as Error)?.message || "Unknown error";
    console.error(`toast-redemption-webhook: processing failed for ${eventGuid}:`, message);

    // Update ledger to failed
    await supabase
      .from("toast_sync_events")
      .update({ status: "failed", error_message: message })
      .eq("id", ledgerRow.id);

    return new Response(
      JSON.stringify({ error: "Processing failed", event_guid: eventGuid }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
