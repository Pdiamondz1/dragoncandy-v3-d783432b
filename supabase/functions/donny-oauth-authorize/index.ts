import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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

async function generateCsrfToken(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): Promise<string> {
  const message = `${params.clientId}|${params.redirectUri}|${params.state}|${params.codeChallenge}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyCsrfToken(
  token: string,
  params: { clientId: string; redirectUri: string; state: string; codeChallenge: string }
): Promise<boolean> {
  const expected = await generateCsrfToken(params);
  return token === expected;
}

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

const SCOPE_LABELS: Record<string, string> = {
  "profile:read": "Access your profile information",
  "donny:chat": "Chat with Donny on your behalf",
};

function validateScopes(
  requestedScopes: string | null,
  allowedScopes: string[]
): { valid: boolean; scopes: string[]; error?: string } {
  if (!requestedScopes) {
    return { valid: true, scopes: allowedScopes };
  }
  const requested = requestedScopes.split(/[\s+]+/).filter(Boolean);
  const invalid = requested.filter((s) => !allowedScopes.includes(s));
  if (invalid.length > 0) {
    return { valid: false, scopes: [], error: `Invalid scopes: ${invalid.join(", ")}` };
  }
  return { valid: true, scopes: requested };
}

// ---------------------------------------------------------------------------
// Consent screen
// ---------------------------------------------------------------------------

interface ConsentScreenParams {
  clientName: string;
  scopes: string[];
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scopeParam: string;
  accessToken: string;
  csrfToken: string;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderConsentScreen(params: ConsentScreenParams): string {
  const scopeItems = params.scopes
    .map((s) => `<li style="padding:8px 0;border-bottom:1px solid #eee;">${SCOPE_LABELS[s] || s}</li>`)
    .join("");

  const denyUrl = `${params.redirectUri}${params.redirectUri.includes("?") ? "&" : "?"}error=access_denied&state=${encodeURIComponent(params.state)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — DragonCandy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #A8A8A0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: #fff;
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    }
    .logo {
      text-align: center;
      font-size: 24px;
      font-weight: 800;
      color: #4DD9C0;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 24px;
    }
    .app-name {
      text-align: center;
      font-size: 18px;
      font-weight: 700;
      color: #111;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      font-size: 14px;
      color: #555;
      margin-bottom: 24px;
    }
    .scope-list {
      list-style: none;
      margin-bottom: 24px;
      padding: 0 8px;
      font-size: 15px;
      color: #333;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 9999px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      margin-bottom: 12px;
    }
    .btn-allow {
      background: #4DD9C0;
      color: #fff;
    }
    .btn-allow:hover { background: #3cc4ac; }
    .btn-deny {
      background: #fff;
      color: #EC4899;
      border: 2px solid #ddd;
    }
    .btn-deny:hover { background: #fdf2f8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">DragonCandy</div>
    <div class="app-name">${escapeHtml(params.clientName)}</div>
    <div class="subtitle">wants to access your account</div>
    <ul class="scope-list">${scopeItems}</ul>
    <form method="POST" action="">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}">
      <input type="hidden" name="scope" value="${escapeAttr(params.scopeParam)}">
      <input type="hidden" name="state" value="${escapeAttr(params.state)}">
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod)}">
      <input type="hidden" name="access_token" value="${escapeAttr(params.accessToken)}">
      <input type="hidden" name="csrf_token" value="${escapeAttr(params.csrfToken)}">
      <button type="submit" class="btn btn-allow">Allow</button>
    </form>
    <a href="${escapeAttr(denyUrl)}" class="btn btn-deny">Deny</a>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Form body parser
// ---------------------------------------------------------------------------

async function parseFormBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const result: Record<string, string> = {};
    for (const [key, value] of params.entries()) {
      result[key] = value;
    }
    return result;
  }
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

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);

    // -------------------------------------------------------------------------
    // GET — validate params, check auth, render consent screen
    // -------------------------------------------------------------------------
    if (req.method === "GET") {
      const clientId = url.searchParams.get("client_id");
      const redirectUri = url.searchParams.get("redirect_uri");
      const codeChallenge = url.searchParams.get("code_challenge");
      const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "S256";
      const state = url.searchParams.get("state");
      const scopeParam = url.searchParams.get("scope");

      // Validate required params
      if (!clientId || !redirectUri || !codeChallenge || !state) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Missing required parameters: client_id, redirect_uri, code_challenge, state" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Validate code_challenge_method
      if (codeChallengeMethod !== "S256") {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "code_challenge_method must be S256" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Look up OAuth client
      const { data: client, error: clientError } = await supabase
        .from("donny_oauth_clients")
        .select("id, client_id, client_name, redirect_uris, scopes, is_active")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .maybeSingle();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: "invalid_client", error_description: "Unknown or inactive client" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Validate redirect_uri
      if (!client.redirect_uris.includes(redirectUri)) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "redirect_uri not allowed for this client" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Validate scopes
      const scopeResult = validateScopes(scopeParam, client.scopes);
      if (!scopeResult.valid) {
        return new Response(
          JSON.stringify({ error: "invalid_scope", error_description: scopeResult.error }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Check authentication — redirect to login if missing or invalid
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        const returnTo = encodeURIComponent(url.toString());
        return new Response(null, {
          status: 302,
          headers: { Location: `https://dragoncandy.io/login?returnTo=${returnTo}`, ...corsHeaders },
        });
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        const returnTo = encodeURIComponent(url.toString());
        return new Response(null, {
          status: 302,
          headers: { Location: `https://dragoncandy.io/login?returnTo=${returnTo}`, ...corsHeaders },
        });
      }

      // Generate CSRF token
      const csrfToken = await generateCsrfToken({ clientId, redirectUri, state, codeChallenge });

      // Render consent screen
      const html = renderConsentScreen({
        clientName: client.client_name,
        scopes: scopeResult.scopes,
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
        scopeParam: scopeResult.scopes.join(" "),
        accessToken: token,
        csrfToken,
      });

      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
      });
    }

    // -------------------------------------------------------------------------
    // POST — validate CSRF, re-auth, generate auth code, redirect
    // -------------------------------------------------------------------------
    if (req.method === "POST") {
      const body = await parseFormBody(req);

      const csrfToken = body["csrf_token"];
      const clientId = body["client_id"];
      const redirectUri = body["redirect_uri"];
      const state = body["state"];
      const codeChallenge = body["code_challenge"];
      const codeChallengeMethod = body["code_challenge_method"] ?? "S256";
      const scopeParam = body["scope"];
      const accessToken = body["access_token"];

      // Validate all required fields present
      if (!csrfToken || !clientId || !redirectUri || !state || !codeChallenge || !accessToken) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Missing required form fields" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Validate code_challenge_method is S256
      if (codeChallengeMethod !== "S256") {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Verify CSRF token
      const csrfValid = await verifyCsrfToken(csrfToken, { clientId, redirectUri, state, codeChallenge });
      if (!csrfValid) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Invalid CSRF token" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Re-authenticate user
      const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "access_denied", error_description: "Authentication required" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Re-validate OAuth params — look up client
      const { data: client, error: clientError } = await supabase
        .from("donny_oauth_clients")
        .select("id, client_id, client_name, redirect_uris, scopes, is_active")
        .eq("client_id", clientId)
        .eq("is_active", true)
        .maybeSingle();

      if (clientError || !client) {
        return new Response(
          JSON.stringify({ error: "invalid_client", error_description: "Unknown or inactive client" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Re-validate redirect_uri
      if (!client.redirect_uris.includes(redirectUri)) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "redirect_uri not allowed for this client" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Re-validate scopes
      const scopeResult = validateScopes(scopeParam, client.scopes);
      if (!scopeResult.valid) {
        return new Response(
          JSON.stringify({ error: "invalid_scope", error_description: scopeResult.error }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Generate authorization code
      const rawCode = generateToken(48);
      const codeHash = await sha256Hash(rawCode);

      // Store hashed code in database
      // Note: client_id here is the UUID FK (client.id), NOT the text client_id string
      const { error: insertError } = await supabase.from("donny_oauth_codes").insert({
        code_hash: codeHash,
        user_id: user.id,
        client_id: client.id,
        redirect_uri: redirectUri,
        scopes: scopeResult.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      if (insertError) {
        console.error("donny-oauth-authorize: failed to insert auth code", insertError);
        return new Response(
          JSON.stringify({ error: "server_error", error_description: "Failed to generate authorization code" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Redirect with code and state
      const separator = redirectUri.includes("?") ? "&" : "?";
      const redirectUrl = `${redirectUri}${separator}code=${encodeURIComponent(rawCode)}&state=${encodeURIComponent(state)}`;

      return new Response(null, {
        status: 302,
        headers: { Location: redirectUrl, ...corsHeaders },
      });
    }

    // Method not allowed
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("donny-oauth-authorize: unexpected error", error);
    return new Response(
      JSON.stringify({ error: "server_error", error_description: (error as Error)?.message || "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
