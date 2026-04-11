// TASK-008: toast-token-refresh — refreshes tokens expiring within 45 minutes
//
// ENV required:
//   TOAST_OAUTH_TOKEN_URL      — Toast's token endpoint (same as callback)
//   TOAST_CLIENT_ID / TOAST_CLIENT_SECRET
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// Invoked by pg_cron every 30 minutes. Also callable manually for debugging.
//
// For each active toast_connection with token_expires_at < now() + 45min:
//   1. Write a "pending" ledger event (ledger-first)
//   2. POST refresh_token grant to Toast
//   3. Update token + expiry on toast_connections
//   4. Update ledger event to "success" or "failed"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOAST_OAUTH_TOKEN_URL = Deno.env.get("TOAST_OAUTH_TOKEN_URL")!;
const TOAST_CLIENT_ID = Deno.env.get("TOAST_CLIENT_ID")!;
const TOAST_CLIENT_SECRET = Deno.env.get("TOAST_CLIENT_SECRET")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results: Array<{ connection_id: string; status: string; error?: string }> = [];

  try {
    // Find all active connections expiring within 45 minutes
    const cutoff = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    const { data: connections, error: fetchError } = await supabase
      .from("toast_connections")
      .select("id, business_id, restaurant_guid, refresh_token, token_expires_at")
      .eq("status", "active")
      .lt("token_expires_at", cutoff);

    if (fetchError) {
      console.error("toast-token-refresh: failed to query connections", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to query connections", detail: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tokens need refresh", refreshed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(`toast-token-refresh: ${connections.length} connection(s) need refresh`);

    for (const conn of connections) {
      // --- Ledger-first: write pending event ---
      const { data: ledgerRow, error: ledgerError } = await supabase
        .from("toast_sync_events")
        .insert({
          connection_id: conn.id,
          event_type: "token_refresh",
          direction: "outbound",
          status: "pending",
          request_payload: {
            restaurant_guid: conn.restaurant_guid,
            expires_at: conn.token_expires_at,
          },
        })
        .select("id")
        .single();

      if (ledgerError) {
        console.error(`toast-token-refresh: ledger write failed for ${conn.id}`, ledgerError);
        results.push({ connection_id: conn.id, status: "failed", error: "ledger_write_failed" });
        continue;
      }

      try {
        // --- Call Toast token endpoint ---
        const tokenResponse = await fetch(TOAST_OAUTH_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: conn.refresh_token,
            client_id: TOAST_CLIENT_ID,
            client_secret: TOAST_CLIENT_SECRET,
          }),
        });

        const tokenBody = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenBody.access_token) {
          throw new Error(
            tokenBody.error_description || tokenBody.error || `HTTP ${tokenResponse.status}`,
          );
        }

        const newAccessToken: string = tokenBody.access_token;
        const newRefreshToken: string = tokenBody.refresh_token || conn.refresh_token;
        const expiresIn: number = tokenBody.expires_in || 86400;
        const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        // --- Update connection with new tokens ---
        const { error: updateError } = await supabase
          .from("toast_connections")
          .update({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            token_expires_at: newExpiresAt,
            status: "active",
            error_message: null,
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id);

        if (updateError) {
          throw new Error(`DB update failed: ${updateError.message}`);
        }

        // --- Update ledger to success ---
        await supabase
          .from("toast_sync_events")
          .update({
            status: "success",
            response_payload: { expires_in: expiresIn },
          })
          .eq("id", ledgerRow.id);

        results.push({ connection_id: conn.id, status: "success" });
        console.log(`toast-token-refresh: refreshed ${conn.id}`);
      } catch (refreshError: unknown) {
        const message = (refreshError as Error)?.message || "Unknown error";
        console.error(`toast-token-refresh: failed for ${conn.id}:`, message);

        // Mark connection as error
        await supabase
          .from("toast_connections")
          .update({
            status: "error",
            error_message: `Token refresh failed: ${message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conn.id);

        // Update ledger to failed
        await supabase
          .from("toast_sync_events")
          .update({
            status: "failed",
            error_message: message,
          })
          .eq("id", ledgerRow.id);

        results.push({ connection_id: conn.id, status: "failed", error: message });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${connections.length} connection(s)`,
        refreshed: results.filter((r) => r.status === "success").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("toast-token-refresh: unexpected error", error);
    return new Response(
      JSON.stringify({
        error: "server_error",
        message: (error as Error)?.message || "Unexpected error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
