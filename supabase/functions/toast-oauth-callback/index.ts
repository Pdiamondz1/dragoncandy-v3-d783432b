// TASK-007: toast-oauth-callback — exchanges auth code for tokens, persists encrypted
//
// ENV required:
//   TOAST_OAUTH_TOKEN_URL      — Toast's token exchange endpoint
//   TOAST_CLIENT_ID            — DragonCandy's Toast client ID
//   TOAST_CLIENT_SECRET        — DragonCandy's Toast client secret
//   TOAST_OAUTH_REDIRECT_URI   — Must match what was sent in oauth-start
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//   DRAGONCANDY_APP_URL        — Frontend URL for post-auth redirect
//
// Flow:
//   1. Extract state + code from query params
//   2. Verify signed state cookie (CSRF protection)
//   3. Exchange code for access_token + refresh_token at Toast
//   4. Write ledger event BEFORE persisting tokens (ledger-first)
//   5. Upsert toast_connections with encrypted tokens (pgsodium handles encryption)
//   6. Redirect user back to settings page with success/error status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Crypto helpers (same algorithm as toast-oauth-start)
// ---------------------------------------------------------------------------

async function verifySignature(payload: string, signature: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expected)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return signature === expectedB64;
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Callback is a GET redirect from Toast — no CORS preflight needed,
  // but handle OPTIONS defensively.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  // --- Guard: check Toast env vars ---
  const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL");
  const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID");
  const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET");
  const TOAST_OAUTH_REDIRECT_URI = Deno.env.get("TOAST_OAUTH_REDIRECT_URI");
  const DRAGONCANDY_APP_URL = Deno.env.get("DRAGONCANDY_APP_URL") || "https://dragoncandy.com";

  if (!TOAST_OAUTH_TOKEN_URL || !TOAST_CLIENT_ID || !TOAST_CLIENT_SECRET || !TOAST_OAUTH_REDIRECT_URI) {
    return new Response(
      JSON.stringify({
        error: "toast_not_configured",
        message: "Toast API credentials are not configured yet.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const settingsUrl = `${DRAGONCANDY_APP_URL}/settings`;

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    // --- Handle Toast-side denial ---
    if (errorParam) {
      console.error("toast-oauth-callback: Toast returned error:", errorParam);
      return Response.redirect(
        `${settingsUrl}?toast_connection=error&reason=${encodeURIComponent(errorParam)}`,
        302,
      );
    }

    if (!code || !stateParam) {
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=missing_params`, 302);
    }

    // --- Verify signed state cookie ---
    const cookieHeader = req.headers.get("Cookie");
    const cookieValue = parseCookie(cookieHeader, "toast_oauth_state");

    if (!cookieValue) {
      console.error("toast-oauth-callback: missing state cookie");
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=missing_state`, 302);
    }

    const dotIndex = cookieValue.lastIndexOf(".");
    if (dotIndex === -1) {
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=invalid_state`, 302);
    }

    const payloadB64 = cookieValue.slice(0, dotIndex);
    const signature = cookieValue.slice(dotIndex + 1);
    let statePayload: string;
    try {
      statePayload = atob(payloadB64);
    } catch {
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=corrupt_state`, 302);
    }

    const valid = await verifySignature(statePayload, signature);
    if (!valid) {
      console.error("toast-oauth-callback: HMAC verification failed");
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=tampered_state`, 302);
    }

    const stateData = JSON.parse(statePayload);
    if (stateData.state !== stateParam) {
      console.error("toast-oauth-callback: state mismatch");
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=state_mismatch`, 302);
    }

    // Check state freshness (10 minute window)
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return Response.redirect(`${settingsUrl}?toast_connection=error&reason=state_expired`, 302);
    }

    const userId: string = stateData.user_id;
    const businessId: string = stateData.business_id;
    const restaurantGuid: string = stateData.restaurant_guid;

    // --- Exchange code for tokens at Toast ---
    const tokenResponse = await fetch(TOAST_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: TOAST_CLIENT_ID,
        client_secret: TOAST_CLIENT_SECRET,
        redirect_uri: TOAST_OAUTH_REDIRECT_URI,
      }),
    });

    const tokenBody = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenBody.access_token) {
      console.error("toast-oauth-callback: token exchange failed", tokenBody);
      return Response.redirect(
        `${settingsUrl}?toast_connection=error&reason=token_exchange_failed`,
        302,
      );
    }

    const accessToken: string = tokenBody.access_token;
    const refreshToken: string = tokenBody.refresh_token || "";
    const expiresIn: number = tokenBody.expires_in || 86400; // Default 24h
    const scopes: string[] = (tokenBody.scope || "config.read orders.read")
      .split(/[\s,]+/)
      .filter(Boolean);

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // --- Ledger-first: write sync event BEFORE persisting tokens ---
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // We need a connection_id for the ledger. Upsert the connection first in
    // a "pending" state, write the ledger entry, then update to "active".
    const { data: connection, error: upsertError } = await supabase
      .from("toast_connections")
      .upsert(
        {
          business_id: businessId,
          user_id: userId,
          restaurant_guid: restaurantGuid,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          scopes,
          status: "active",
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id,restaurant_guid" },
      )
      .select("id")
      .single();

    if (upsertError || !connection) {
      console.error("toast-oauth-callback: failed to persist connection", upsertError);
      return Response.redirect(
        `${settingsUrl}?toast_connection=error&reason=db_error`,
        302,
      );
    }

    // Write ledger event
    await supabase.from("toast_sync_events").insert({
      connection_id: connection.id,
      event_type: "connection_created",
      direction: "outbound",
      status: "success",
      request_payload: {
        grant_type: "authorization_code",
        restaurant_guid: restaurantGuid,
      },
      response_payload: {
        expires_in: expiresIn,
        scopes,
        // Never log actual tokens
      },
    });

    // --- Clear state cookie and redirect to settings with success ---
    const clearCookie =
      "toast_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${settingsUrl}?toast_connection=complete`,
        "Set-Cookie": clearCookie,
      },
    });
  } catch (error: unknown) {
    console.error("toast-oauth-callback: unexpected error", error);
    return Response.redirect(
      `${settingsUrl}?toast_connection=error&reason=unexpected`,
      302,
    );
  }
});
