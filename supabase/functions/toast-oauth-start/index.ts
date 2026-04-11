// TASK-006: toast-oauth-start — initiates Toast OAuth flow with signed state cookie
//
// ENV required:
//   TOAST_OAUTH_AUTHORIZE_URL — Toast's OAuth2 authorization endpoint
//   TOAST_CLIENT_ID            — DragonCandy's Toast client ID
//   TOAST_OAUTH_REDIRECT_URI   — Our callback URL (toast-oauth-callback)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Flow:
//   1. Authenticate the calling user via Supabase JWT
//   2. Generate a random state token
//   3. HMAC-sign state + user_id + business_id → store in HttpOnly cookie
//   4. Redirect to Toast authorization URL

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signState(payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Guard: check Toast env vars ---
  const TOAST_OAUTH_AUTHORIZE_URL = Deno.env.get("TOAST_OAUTH_AUTHORIZE_URL");
  const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID");
  const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI");

  if (!TOAST_OAUTH_AUTHORIZE_URL || !TOAST_CLIENT_ID || !TOAST_OAUTH_REDIRECT_URI) {
    return new Response(
      JSON.stringify({
        error: "toast_not_configured",
        message: "Toast API credentials are not configured yet.",
      }),
      { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }

  try {
    // --- Authenticate caller ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const jwt = authHeader.slice(7);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // --- Parse body for business_id & restaurant_guid ---
    const body = await req.json().catch(() => ({}));
    const businessId: string | undefined = body.business_id;
    const restaurantGuid: string | undefined = body.restaurant_guid;

    if (!businessId) {
      return new Response(
        JSON.stringify({ error: "business_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Verify the user owns this business
    const { data: biz, error: bizError } = await supabase
      .from("business_profiles")
      .select("id")
      .eq("id", businessId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bizError || !biz) {
      return new Response(
        JSON.stringify({ error: "Business profile not found or access denied" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // --- Build signed state ---
    const state = generateState();
    const statePayload = JSON.stringify({
      state,
      user_id: user.id,
      business_id: businessId,
      restaurant_guid: restaurantGuid || "",
      ts: Date.now(),
    });
    const signature = await signState(statePayload);
    const cookieValue = btoa(statePayload) + "." + signature;

    // --- Build Toast authorization URL ---
    const toastUrl = new URL(TOAST_OAUTH_AUTHORIZE_URL);
    toastUrl.searchParams.set("response_type", "code");
    toastUrl.searchParams.set("client_id", TOAST_CLIENT_ID);
    toastUrl.searchParams.set("redirect_uri", TOAST_OAUTH_REDIRECT_URI);
    toastUrl.searchParams.set("state", state);
    toastUrl.searchParams.set("scope", "config.read orders.read");

    // Set signed state cookie (HttpOnly, Secure, SameSite=Lax for redirect)
    // Max-Age 10 minutes — generous for the round-trip
    const setCookie =
      `toast_oauth_state=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;

    return new Response(
      JSON.stringify({ redirect_url: toastUrl.toString() }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": setCookie,
          ...corsHeaders,
        },
      },
    );
  } catch (error: unknown) {
    console.error("toast-oauth-start: unexpected error", error);
    return new Response(
      JSON.stringify({
        error: "server_error",
        message: (error as Error)?.message || "Unexpected error",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
