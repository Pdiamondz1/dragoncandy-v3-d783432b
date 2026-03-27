# Donny OAuth 2.0 Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement OAuth 2.0 authorization code flow with PKCE so external surfaces (Chrome Extension, mobile widgets, SDK embeds) can authenticate DragonCandy users.

**Architecture:** Three standalone Supabase Edge Functions (`donny-oauth-authorize`, `donny-oauth-token`, `donny-oauth-userinfo`) plus one database migration. Each function follows the existing project pattern: Deno runtime, `serve()` from std, `createClient` from supabase-js@2, CORS headers, service_role key.

**Tech Stack:** Deno (Supabase Edge Functions), supabase-js@2, Web Crypto API (`crypto.subtle`), Postgres

**Spec:** `docs/superpowers/specs/2026-03-26-donny-oauth-flow-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/20260326_donny_oauth_codes.sql` | New `donny_oauth_codes` table, alter `client_secret_hash` nullable, add `refresh_token_hash` index |
| Create | `supabase/functions/donny-oauth-authorize/index.ts` | Authorization endpoint: validate client, check auth, render consent, issue auth codes |
| Create | `supabase/functions/donny-oauth-token/index.ts` | Token exchange: validate auth code + PKCE, issue tokens, handle refresh |
| Create | `supabase/functions/donny-oauth-userinfo/index.ts` | Userinfo: validate bearer token, return profile data |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260326_donny_oauth_codes.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- =============================================================================
-- Donny OAuth Codes + schema patches for OAuth flow
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CREATE donny_oauth_codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donny_oauth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES donny_oauth_clients(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  scopes text[] NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL DEFAULT 'S256',
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_donny_oauth_codes_code_hash
  ON donny_oauth_codes(code_hash);

ALTER TABLE donny_oauth_codes ENABLE ROW LEVEL SECURITY;

-- No user-facing RLS policies — all access via service_role key

-- ---------------------------------------------------------------------------
-- 2. ALTER donny_oauth_clients — make client_secret_hash nullable
-- ---------------------------------------------------------------------------
ALTER TABLE donny_oauth_clients
  ALTER COLUMN client_secret_hash DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. ADD index on donny_oauth_tokens.refresh_token_hash
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_donny_oauth_tokens_refresh_token_hash
  ON donny_oauth_tokens(refresh_token_hash);
```

- [ ] **Step 2: Verify migration is syntactically valid**

Run: `cd supabase && cat migrations/20260326_donny_oauth_codes.sql`

Visually confirm: CREATE TABLE, CREATE INDEX, ALTER TABLE, second CREATE INDEX — 4 statements, no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260326_donny_oauth_codes.sql
git commit -m "feat: add donny_oauth_codes table and schema patches for OAuth flow"
```

---

## Task 2: Authorize Endpoint — Validation & Auth Check

**Files:**
- Create: `supabase/functions/donny-oauth-authorize/index.ts`

This task implements the GET handler: param validation, client lookup, auth check, and redirect for unauthenticated users. The consent screen HTML is added in Task 3.

- [ ] **Step 1: Create the edge function file with imports and CORS**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

- [ ] **Step 2: Add the SHA-256 hashing, token generation, and CSRF helpers**

These are used across the GET (CSRF token) and POST (auth code generation) handlers. The CSRF token is an HMAC signature over the OAuth params using `SUPABASE_SERVICE_ROLE_KEY` as the signing secret — this lets the stateless POST handler verify the form was rendered by our GET endpoint without storing state.

```typescript
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
  // Base64url encode (no padding)
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
```

- [ ] **Step 3: Add the scope validation helper**

```typescript
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
```

- [ ] **Step 4: Add the GET handler with param validation and client lookup**

```typescript
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);

  if (req.method === "GET") {
    // --- 1. Extract and validate required params ---
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const codeChallenge = url.searchParams.get("code_challenge");
    const state = url.searchParams.get("state");
    const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
    const scopeParam = url.searchParams.get("scope");

    if (!clientId || !redirectUri || !codeChallenge || !state) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Missing required parameters: client_id, redirect_uri, code_challenge, state" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (codeChallengeMethod !== "S256") {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 2. Look up client by text client_id ---
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

    // --- 3. Validate redirect_uri ---
    if (!client.redirect_uris.includes(redirectUri)) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Invalid redirect_uri" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 4. Validate scopes ---
    const scopeResult = validateScopes(scopeParam, client.scopes);
    if (!scopeResult.valid) {
      return new Response(
        JSON.stringify({ error: "invalid_scope", error_description: scopeResult.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 5. Check authentication ---
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      const returnUrl = encodeURIComponent(url.toString());
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `https://dragoncandy.io/login?returnTo=${returnUrl}` },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      const returnUrl = encodeURIComponent(url.toString());
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `https://dragoncandy.io/login?returnTo=${returnUrl}` },
      });
    }

    // --- 6. Generate CSRF token (HMAC-signed over OAuth params) ---
    const csrfToken = await generateCsrfToken({
      clientId,
      redirectUri,
      state,
      codeChallenge,
    });

    // --- 7. Render consent screen (see Task 3) ---
    const scopeList = scopeResult.scopes;
    const consentHtml = renderConsentScreen({
      clientName: client.client_name,
      scopes: scopeList,
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      scopeParam: scopeList.join(" "),
      accessToken: token,
      csrfToken,
    });

    return new Response(consentHtml, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
  }

  // POST handler placeholder — implemented in Task 4
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
```

- [ ] **Step 5: Add a placeholder `renderConsentScreen` function**

This will be fully implemented in Task 3. For now, return minimal HTML so the function is valid.

```typescript
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

function renderConsentScreen(params: ConsentScreenParams): string {
  return `<!DOCTYPE html><html><body><p>Consent screen placeholder for ${params.clientName}</p></body></html>`;
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-oauth-authorize/index.ts
git commit -m "feat: add donny-oauth-authorize edge function with validation and auth check"
```

---

## Task 3: Authorize Endpoint — Branded Consent Screen HTML

**Files:**
- Modify: `supabase/functions/donny-oauth-authorize/index.ts` (replace `renderConsentScreen`)

- [ ] **Step 1: Replace the placeholder `renderConsentScreen` with branded HTML**

Replace the placeholder function with the full implementation. The HTML should:
- Use DragonCandy brand colors: teal `#4DD9C0`, pink `#F9A8D4` / `#EC4899`, dark `#111111`, gray `#555555`
- Pill-shaped buttons with `border-radius: 9999px`
- DragonCandy text logo at top
- App name display
- Scope list with human-readable labels from `SCOPE_LABELS`
- Hidden form fields: `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`, `access_token`, `csrf_token`
- "Allow" button submits the form (POST to same URL)
- "Deny" link redirects to `redirect_uri?error=access_denied&state=<state>`

```typescript
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
```

- [ ] **Step 2: Verify the full file compiles**

Run: `deno check supabase/functions/donny-oauth-authorize/index.ts` (or visually verify if Deno isn't installed locally — Supabase deploys handle compilation).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-oauth-authorize/index.ts
git commit -m "feat: add branded consent screen HTML to donny-oauth-authorize"
```

---

## Task 4: Authorize Endpoint — POST Handler (Code Generation)

**Files:**
- Modify: `supabase/functions/donny-oauth-authorize/index.ts` (replace POST placeholder)

- [ ] **Step 1: Add form body parser helper**

Add this above the `serve()` call:

```typescript
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
  // Default: try URL-encoded (HTML forms send this by default)
  const text = await req.text();
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}
```

- [ ] **Step 2: Replace the POST placeholder with the full handler**

Replace everything inside `serve()` from the line `// POST handler placeholder — implemented in Task 4` through the `return new Response(... "method_not_allowed" ...)` statement (but NOT the `} catch` block or closing `});`). The replacement code below starts with `if (req.method === "POST")` and ends with the method-not-allowed fallback return:

```typescript
  if (req.method === "POST") {
    const body = await parseFormBody(req);

    // --- 1. Extract params needed for CSRF verification (before full validation) ---
    const csrfToken = body.csrf_token;
    const csrfClientId = body.client_id;
    const csrfRedirectUri = body.redirect_uri;
    const csrfState = body.state;
    const csrfCodeChallenge = body.code_challenge;

    if (!csrfToken || !csrfClientId || !csrfRedirectUri || !csrfState || !csrfCodeChallenge) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Missing CSRF token or required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Verify CSRF: re-compute HMAC over the same params and compare
    const csrfValid = await verifyCsrfToken(csrfToken, {
      clientId: csrfClientId,
      redirectUri: csrfRedirectUri,
      state: csrfState,
      codeChallenge: csrfCodeChallenge,
    });
    if (!csrfValid) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Invalid CSRF token" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 2. Re-authenticate user ---
    const accessToken = body.access_token;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Missing access token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "access_denied", error_description: "Invalid or expired session" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 3. Re-validate all OAuth params ---
    const clientId = body.client_id;
    const redirectUri = body.redirect_uri;
    const codeChallenge = body.code_challenge;
    const state = body.state;
    const codeChallengeMethod = body.code_challenge_method || "S256";
    const scopeParam = body.scope;

    if (!clientId || !redirectUri || !codeChallenge || !state) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Missing required parameters" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (codeChallengeMethod !== "S256") {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Only S256 code_challenge_method is supported" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: client, error: clientError } = await supabase
      .from("donny_oauth_clients")
      .select("id, client_id, redirect_uris, scopes, is_active")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: "invalid_client", error_description: "Unknown or inactive client" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!client.redirect_uris.includes(redirectUri)) {
      return new Response(
        JSON.stringify({ error: "invalid_request", error_description: "Invalid redirect_uri" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const scopeResult = validateScopes(scopeParam, client.scopes);
    if (!scopeResult.valid) {
      return new Response(
        JSON.stringify({ error: "invalid_scope", error_description: scopeResult.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 4. Generate authorization code ---
    const rawCode = generateToken(48);
    const codeHash = await sha256Hash(rawCode);

    // --- 5. Store hashed code ---
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    const { error: insertError } = await supabase
      .from("donny_oauth_codes")
      .insert({
        code_hash: codeHash,
        user_id: user.id,
        client_id: client.id, // uuid FK, not the text client_id
        redirect_uri: redirectUri,
        scopes: scopeResult.scopes,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("donny-oauth-authorize: code insert error", insertError);
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Failed to generate authorization code" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- 6. Redirect with code ---
    const separator = redirectUri.includes("?") ? "&" : "?";
    const redirectUrl = `${redirectUri}${separator}code=${encodeURIComponent(rawCode)}&state=${encodeURIComponent(state)}`;

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: redirectUrl },
    });
  }

  return new Response(
    JSON.stringify({ error: "method_not_allowed" }),
    { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
```

- [ ] **Step 3: Verify the complete authorize function is coherent**

Read through the full file. Confirm:
- GET validates params → checks auth → renders consent HTML with hidden fields
- POST validates CSRF → re-authenticates → re-validates params → generates code → redirects
- Helper functions (`sha256Hash`, `generateToken`, `generateCsrfToken`, `verifyCsrfToken`, `validateScopes`, `parseFormBody`, `renderConsentScreen`, `escapeHtml`, `escapeAttr`) are all above `serve()`
- The entire handler body inside `serve()` is wrapped in `try/catch`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-oauth-authorize/index.ts
git commit -m "feat: add POST handler for consent approval and auth code generation"
```

---

## Task 5: Token Exchange Endpoint

**Files:**
- Create: `supabase/functions/donny-oauth-token/index.ts`

- [ ] **Step 1: Create the file with imports, CORS, and crypto helpers**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  // Default: URL-encoded
  const text = await req.text();
  const params = new URLSearchParams(text);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}
```

- [ ] **Step 2: Add the authorization code exchange handler**

```typescript
function oauthError(error: string, description: string, status = 400): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    { status, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
  if (req.method !== "POST") {
    return oauthError("invalid_request", "Method not allowed", 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await parseBody(req);
  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    const { code, client_id: clientId, redirect_uri: redirectUri, code_verifier: codeVerifier } = body;

    if (!code || !clientId || !redirectUri || !codeVerifier) {
      return oauthError("invalid_request", "Missing required parameters: code, client_id, redirect_uri, code_verifier");
    }

    // --- 1. Look up authorization code ---
    const codeHash = await sha256Hash(code);

    const { data: codeRow, error: codeError } = await supabase
      .from("donny_oauth_codes")
      .select("id, code_hash, user_id, client_id, redirect_uri, scopes, code_challenge, code_challenge_method, expires_at, used")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (codeError || !codeRow) {
      return oauthError("invalid_grant", "Invalid authorization code");
    }

    // --- 2. Validate code ---
    if (codeRow.used) {
      return oauthError("invalid_grant", "Authorization code has already been used");
    }

    if (new Date(codeRow.expires_at) < new Date()) {
      return oauthError("invalid_grant", "Authorization code has expired");
    }

    if (codeRow.redirect_uri !== redirectUri) {
      return oauthError("invalid_grant", "redirect_uri does not match");
    }

    // Look up client by text client_id, verify UUID FK matches
    const { data: client, error: clientError } = await supabase
      .from("donny_oauth_clients")
      .select("id, is_active")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .maybeSingle();

    if (clientError || !client) {
      return oauthError("invalid_client", "Unknown or inactive client");
    }

    if (codeRow.client_id !== client.id) {
      return oauthError("invalid_grant", "client_id does not match");
    }

    // --- 3. PKCE verification ---
    const computedChallenge = await sha256Base64url(codeVerifier);
    if (computedChallenge !== codeRow.code_challenge) {
      return oauthError("invalid_grant", "PKCE code_verifier validation failed");
    }

    // --- 4. Mark code as used ---
    await supabase
      .from("donny_oauth_codes")
      .update({ used: true })
      .eq("id", codeRow.id);

    // --- 5. Generate tokens ---
    const rawAccessToken = generateToken(48);
    const rawRefreshToken = generateToken(48);
    const accessTokenHash = await sha256Hash(rawAccessToken);
    const refreshTokenHash = await sha256Hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    const { error: tokenInsertError } = await supabase
      .from("donny_oauth_tokens")
      .insert({
        user_id: codeRow.user_id,
        client_id: client.id, // uuid FK
        access_token_hash: accessTokenHash,
        refresh_token_hash: refreshTokenHash,
        scopes: codeRow.scopes,
        expires_at: expiresAt,
      });

    if (tokenInsertError) {
      console.error("donny-oauth-token: token insert error", tokenInsertError);
      return oauthError("server_error", "Failed to issue tokens", 500);
    }

    return new Response(
      JSON.stringify({
        access_token: rawAccessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: rawRefreshToken,
        scope: codeRow.scopes.join(" "),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Refresh token handling — added in Task 6
  if (grantType === "refresh_token") {
    // placeholder
    return oauthError("unsupported_grant_type", "refresh_token not yet implemented");
  }

  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);

  } catch (error: unknown) {
    console.error("donny-oauth-token: unexpected error", error);
    return oauthError("server_error", (error as Error)?.message || "Unexpected error", 500);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-oauth-token/index.ts
git commit -m "feat: add donny-oauth-token edge function with authorization code exchange"
```

---

## Task 6: Token Endpoint — Refresh Token Handler

**Files:**
- Modify: `supabase/functions/donny-oauth-token/index.ts` (replace refresh_token placeholder)

- [ ] **Step 1: Replace the refresh_token placeholder**

Replace the `if (grantType === "refresh_token")` block with:

```typescript
  if (grantType === "refresh_token") {
    const { refresh_token: refreshToken, client_id: clientId } = body;

    if (!refreshToken || !clientId) {
      return oauthError("invalid_request", "Missing required parameters: refresh_token, client_id");
    }

    // --- 1. Look up refresh token ---
    const refreshTokenHash = await sha256Hash(refreshToken);

    const { data: tokenRow, error: tokenError } = await supabase
      .from("donny_oauth_tokens")
      .select("id, user_id, client_id, scopes, created_at")
      .eq("refresh_token_hash", refreshTokenHash)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return oauthError("invalid_grant", "Invalid refresh token");
    }

    // --- 2. Validate client ---
    const { data: client, error: clientError } = await supabase
      .from("donny_oauth_clients")
      .select("id, is_active")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .maybeSingle();

    if (clientError || !client) {
      return oauthError("invalid_client", "Unknown or inactive client");
    }

    if (tokenRow.client_id !== client.id) {
      return oauthError("invalid_grant", "client_id does not match");
    }

    // --- 3. Check 30-day expiry ---
    const createdAt = new Date(tokenRow.created_at);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - createdAt.getTime() > thirtyDaysMs) {
      // Delete expired token
      await supabase.from("donny_oauth_tokens").delete().eq("id", tokenRow.id);
      return oauthError("invalid_grant", "Refresh token has expired");
    }

    // --- 4. Rotate: delete old token ---
    await supabase.from("donny_oauth_tokens").delete().eq("id", tokenRow.id);

    // --- 5. Issue new token pair ---
    const rawAccessToken = generateToken(48);
    const rawRefreshToken = generateToken(48);
    const accessTokenHash = await sha256Hash(rawAccessToken);
    const newRefreshTokenHash = await sha256Hash(rawRefreshToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from("donny_oauth_tokens")
      .insert({
        user_id: tokenRow.user_id,
        client_id: client.id,
        access_token_hash: accessTokenHash,
        refresh_token_hash: newRefreshTokenHash,
        scopes: tokenRow.scopes,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("donny-oauth-token: refresh insert error", insertError);
      return oauthError("server_error", "Failed to issue tokens", 500);
    }

    return new Response(
      JSON.stringify({
        access_token: rawAccessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: rawRefreshToken,
        scope: tokenRow.scopes.join(" "),
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
```

- [ ] **Step 2: Verify the complete token function is coherent**

Read through the full file. Confirm:
- `authorization_code` grant validates code, PKCE, issues tokens
- `refresh_token` grant validates refresh token, rotates, issues new pair
- Both paths use `sha256Hash` for storage and `sha256Base64url` for PKCE
- Client lookup always goes through text `client_id` → uuid `id`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-oauth-token/index.ts
git commit -m "feat: add refresh token rotation to donny-oauth-token"
```

---

## Task 7: Userinfo Endpoint

**Files:**
- Create: `supabase/functions/donny-oauth-userinfo/index.ts`

- [ ] **Step 1: Create the complete userinfo function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --- 1. Extract bearer token ---
  const authHeader = req.headers.get("Authorization");
  const rawToken = authHeader?.replace("Bearer ", "");

  if (!rawToken) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Missing Bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // --- 2. Look up token ---
  const tokenHash = await sha256Hash(rawToken);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("donny_oauth_tokens")
    .select("id, user_id, client_id, scopes, expires_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Invalid access token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // --- 3. Check expiry ---
  if (new Date(tokenRow.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Access token has expired" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // --- 4. Verify client is still active ---
  const { data: client, error: clientError } = await supabase
    .from("donny_oauth_clients")
    .select("is_active")
    .eq("id", tokenRow.client_id)
    .maybeSingle();

  if (clientError || !client || !client.is_active) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Client application has been deactivated" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // --- 5. Build response based on scopes ---
  const scopes: string[] = tokenRow.scopes || [];

  // Minimal response: always include user ID
  const response: Record<string, unknown> = { id: tokenRow.user_id };

  if (scopes.includes("profile:read")) {
    // Get email from auth.users (requires service_role)
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(tokenRow.user_id);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Failed to fetch user data" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    response.email = user.email;

    // Get profile data
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", tokenRow.user_id)
      .maybeSingle();

    if (profile) {
      response.display_name = profile.display_name;
      response.role = profile.role;
      response.avatar_url = profile.avatar_url;
    }

    // Get company_name for business users
    if (profile?.role === "business") {
      const { data: bizProfile } = await supabase
        .from("business_profiles")
        .select("company_name")
        .eq("id", tokenRow.user_id)
        .maybeSingle();

      response.company_name = bizProfile?.company_name || null;
    }
  }

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );

  } catch (error: unknown) {
    console.error("donny-oauth-userinfo: unexpected error", error);
    return new Response(
      JSON.stringify({ error: "server_error", error_description: (error as Error)?.message || "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/donny-oauth-userinfo/index.ts
git commit -m "feat: add donny-oauth-userinfo edge function"
```

---

## Task 8: End-to-End Flow Verification

**Files:** All three edge functions + migration (read-only verification)

- [ ] **Step 1: Walk through the complete flow manually**

Read all three functions in order and trace a complete flow:

1. **Chrome Extension** calls `GET /donny-oauth-authorize?client_id=ext-123&redirect_uri=...&scope=profile:read+donny:chat&state=abc&code_challenge=xyz&code_challenge_method=S256`
2. **Authorize function** validates params → checks auth → returns consent HTML
3. **User clicks Allow** → POST with hidden fields → generates code → 302 redirect with `?code=...&state=abc`
4. **Extension** calls `POST /donny-oauth-token` with `grant_type=authorization_code&code=...&client_id=ext-123&redirect_uri=...&code_verifier=...`
5. **Token function** validates code → PKCE check → issues tokens → returns JSON
6. **Extension** calls `GET /donny-oauth-userinfo` with `Authorization: Bearer <token>`
7. **Userinfo function** validates token → returns profile data

Confirm each step connects to the next. Specifically verify:
- Client lookup uses text `client_id` everywhere, FK uses uuid `id`
- `sha256Hash` is used consistently for storage lookups
- `sha256Base64url` is used only for PKCE verification
- Error responses follow OAuth 2.0 `{ error, error_description }` format
- All Supabase queries use `.select()` with explicit field lists (no `select *`)

- [ ] **Step 2: Verify no existing files were modified**

Run: `git diff --name-only HEAD~7` (or however many commits back to the start)

Confirm only these files appear:
- `supabase/migrations/20260326_donny_oauth_codes.sql`
- `supabase/functions/donny-oauth-authorize/index.ts`
- `supabase/functions/donny-oauth-token/index.ts`
- `supabase/functions/donny-oauth-userinfo/index.ts`

No existing auth flows, login pages, or other edge functions should be touched.

- [ ] **Step 3: Final commit (if any verification fixes were needed)**

```bash
git add supabase/functions/donny-oauth-authorize/index.ts supabase/functions/donny-oauth-token/index.ts supabase/functions/donny-oauth-userinfo/index.ts supabase/migrations/20260326_donny_oauth_codes.sql
git commit -m "fix: address issues found during end-to-end flow verification"
```
