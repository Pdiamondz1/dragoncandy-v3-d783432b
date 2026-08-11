import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Base64url encode a SHA-256 hash (for PKCE verification)
async function sha256Base64url(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await req.json();
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function oauthError(error: string, description: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return oauthError("method_not_allowed", "Only POST is supported", 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await parseBody(req);
    const grantType = body["grant_type"];

    // -------------------------------------------------------------------------
    // grant_type=authorization_code
    // -------------------------------------------------------------------------
    if (grantType === "authorization_code") {
      const code = body["code"];
      const clientId = body["client_id"];
      const redirectUri = body["redirect_uri"];
      const codeVerifier = body["code_verifier"];

      if (!code || !clientId || !redirectUri || !codeVerifier) {
        return oauthError(
          "invalid_request",
          "Missing required parameters: code, client_id, redirect_uri, code_verifier"
        );
      }

      // Hash the code and look it up
      const codeHash = await sha256Hash(code);
      const { data: codeRow, error: codeError } = await supabase
        .from("donny_oauth_codes")
        .select("id, code_hash, user_id, client_id, redirect_uri, scopes, code_challenge, used, expires_at")
        .eq("code_hash", codeHash)
        .maybeSingle();

      if (codeError || !codeRow) {
        return oauthError("invalid_grant", "Authorization code is invalid or not found");
      }

      // Check used status
      if (codeRow.used) {
        return oauthError("invalid_grant", "Authorization code has already been used");
      }

      // Check expiry
      if (new Date(codeRow.expires_at).getTime() < Date.now()) {
        return oauthError("invalid_grant", "Authorization code has expired");
      }

      // Check redirect_uri match
      if (codeRow.redirect_uri !== redirectUri) {
        return oauthError("invalid_grant", "redirect_uri does not match the one used during authorization");
      }

      // Look up client by text client_id
      const { data: client, error: clientError } = await supabase
        .from("donny_oauth_clients")
        .select("id, client_id, is_active")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .maybeSingle();

      if (clientError || !client) {
        return oauthError("invalid_client", "Unknown or inactive client");
      }

      // Verify the code belongs to this client (uuid FK match)
      if (codeRow.client_id !== client.id) {
        return oauthError("invalid_grant", "Authorization code was not issued to this client");
      }

      // PKCE verification: sha256Base64url(code_verifier) must equal stored code_challenge
      const computedChallenge = await sha256Base64url(codeVerifier);
      if (computedChallenge !== codeRow.code_challenge) {
        return oauthError("invalid_grant", "PKCE code_verifier does not match code_challenge");
      }

      // Mark code as used
      const { error: markUsedError } = await supabase
        .from("donny_oauth_codes")
        .update({ used: true })
        .eq("id", codeRow.id);

      if (markUsedError) {
        console.error("donny-oauth-token: failed to mark code as used", markUsedError);
        return oauthError("server_error", "Failed to process authorization code", 500);
      }

      // Generate access and refresh tokens
      const accessToken = generateToken(48);
      const refreshToken = generateToken(48);
      const accessTokenHash = await sha256Hash(accessToken);
      const refreshTokenHash = await sha256Hash(refreshToken);

      const { error: insertError } = await supabase.from("donny_oauth_tokens").insert({
        user_id: codeRow.user_id,
        client_id: client.id,
        access_token_hash: accessTokenHash,
        refresh_token_hash: refreshTokenHash,
        scopes: codeRow.scopes,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      if (insertError) {
        console.error("donny-oauth-token: failed to insert token", insertError);
        return oauthError("server_error", "Failed to issue access token", 500);
      }

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: refreshToken,
          scope: (codeRow.scopes as string[]).join(" "),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // -------------------------------------------------------------------------
    // grant_type=refresh_token
    // -------------------------------------------------------------------------
    if (grantType === "refresh_token") {
      const refreshToken = body["refresh_token"];
      const clientId = body["client_id"];

      if (!refreshToken || !clientId) {
        return oauthError(
          "invalid_request",
          "Missing required parameters: refresh_token, client_id"
        );
      }

      // Hash refresh token and look up
      const refreshTokenHash = await sha256Hash(refreshToken);
      const { data: tokenRow, error: tokenError } = await supabase
        .from("donny_oauth_tokens")
        .select("id, user_id, client_id, scopes, created_at")
        .eq("refresh_token_hash", refreshTokenHash)
        .maybeSingle();

      if (tokenError || !tokenRow) {
        return oauthError("invalid_grant", "Refresh token is invalid or not found");
      }

      // Look up client by text client_id
      const { data: client, error: clientError } = await supabase
        .from("donny_oauth_clients")
        .select("id, client_id, is_active")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .maybeSingle();

      if (clientError || !client) {
        return oauthError("invalid_client", "Unknown or inactive client");
      }

      // Verify the token belongs to this client (uuid FK match)
      if (tokenRow.client_id !== client.id) {
        return oauthError("invalid_grant", "Refresh token was not issued to this client");
      }

      // Check 30-day refresh token expiry
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const tokenAge = Date.now() - new Date(tokenRow.created_at).getTime();
      if (tokenAge > thirtyDaysMs) {
        // Delete the expired token and return error
        await supabase.from("donny_oauth_tokens").delete().eq("id", tokenRow.id);
        return oauthError("invalid_grant", "Refresh token has expired — please re-authorize");
      }

      // Delete old token (rotation)
      const { error: deleteError } = await supabase
        .from("donny_oauth_tokens")
        .delete()
        .eq("id", tokenRow.id);

      if (deleteError) {
        console.error("donny-oauth-token: failed to delete old token during rotation", deleteError);
        return oauthError("server_error", "Failed to rotate refresh token", 500);
      }

      // Generate new token pair
      const newAccessToken = generateToken(48);
      const newRefreshToken = generateToken(48);
      const newAccessTokenHash = await sha256Hash(newAccessToken);
      const newRefreshTokenHash = await sha256Hash(newRefreshToken);

      const { error: insertError } = await supabase.from("donny_oauth_tokens").insert({
        user_id: tokenRow.user_id,
        client_id: client.id,
        access_token_hash: newAccessTokenHash,
        refresh_token_hash: newRefreshTokenHash,
        scopes: tokenRow.scopes,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      if (insertError) {
        console.error("donny-oauth-token: failed to insert rotated token", insertError);
        return oauthError("server_error", "Failed to issue new access token", 500);
      }

      return new Response(
        JSON.stringify({
          access_token: newAccessToken,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: newRefreshToken,
          scope: (tokenRow.scopes as string[]).join(" "),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // -------------------------------------------------------------------------
    // Unsupported grant_type
    // -------------------------------------------------------------------------
    return oauthError(
      "unsupported_grant_type",
      `grant_type "${grantType || ""}" is not supported. Supported types: authorization_code, refresh_token`
    );
  } catch (error: unknown) {
    const message = (error as Error)?.message || "Unexpected error";
    console.error("donny-oauth-token: unexpected error", error);
    return oauthError("server_error", message, 500);
  }
});
