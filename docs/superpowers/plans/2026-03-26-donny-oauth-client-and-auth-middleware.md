# Donny OAuth Client Registration & Auth Middleware — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the Chrome Extension as an OAuth client, create shared token validation middleware, and update donny-chat to accept both Supabase session auth and OAuth bearer tokens.

**Architecture:** Three independent deliverables — a SQL seed script, a shared Deno module for token validation, and a targeted auth modification to the donny-chat edge function. The shared middleware extracts the token-validation pattern already used in donny-oauth-userinfo into a reusable module.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL, Web Crypto API (SHA-256)

**Spec:** `docs/superpowers/specs/2026-03-26-donny-oauth-client-and-auth-middleware-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/seed-oauth-client.sql` | Create | Idempotent INSERT of Chrome Extension OAuth client |
| `supabase/functions/_shared/auth.ts` | Create | Shared OAuth token validation + scope checking |
| `supabase/functions/donny-chat/index.ts` | Modify (lines 1-3, 957-972) | Dual auth: Supabase session first, OAuth fallback |

---

## Task 1: Create OAuth Client Seed Script

**Files:**
- Create: `supabase/seed-oauth-client.sql`

- [ ] **Step 1: Create the seed script**

```sql
-- Seed: Register the Donny Chrome Extension as an OAuth client.
--
-- IMPORTANT: Replace EXTENSION_ID_PLACEHOLDER with the real Chrome
-- Extension ID after publishing to the Chrome Web Store.
--
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING).

INSERT INTO donny_oauth_clients (
  client_id,
  client_name,
  client_secret_hash,
  redirect_uris,
  scopes
) VALUES (
  'donny-chrome-ext-v1',
  'Donny Chrome Extension',
  NULL,  -- public client, PKCE-only
  ARRAY['chrome-extension://EXTENSION_ID_PLACEHOLDER/callback.html'],
  ARRAY['donny:chat','campaigns:read','campaigns:write','creators:read','analytics:read','messages:read','messages:write','profile:read']
) ON CONFLICT (client_id) DO NOTHING;
```

- [ ] **Step 2: Verify syntax**

Run: `grep -c "ON CONFLICT" supabase/seed-oauth-client.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/seed-oauth-client.sql
git commit -m "feat: add seed script for Donny Chrome Extension OAuth client"
```

---

## Task 2: Create Shared Auth Middleware

**Files:**
- Create: `supabase/functions/_shared/auth.ts`

- [ ] **Step 1: Create the `_shared` directory and auth module**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SHA-256 hash a string and return hex-encoded result.
 * Matches the hashing pattern used across all donny-oauth-* functions.
 */
async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DonnyTokenResult {
  user_id: string;
  scopes: string[];
}

/**
 * Validate a Donny OAuth access token from the request's Authorization header.
 *
 * - Extracts the Bearer token
 * - Hashes it with SHA-256
 * - Looks it up in donny_oauth_tokens
 * - Checks expiration and client is_active
 *
 * Returns { user_id, scopes } if valid, null otherwise.
 * Uses a service-role Supabase client internally.
 */
export async function validateDonnyToken(
  request: Request
): Promise<DonnyTokenResult | null> {
  const authHeader = request.headers.get("Authorization");
  const rawToken = authHeader?.replace("Bearer ", "");
  if (!rawToken) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tokenHash = await sha256Hash(rawToken);

  // Look up token by hash
  const { data: tokenRow, error: tokenError } = await supabase
    .from("donny_oauth_tokens")
    .select("user_id, client_id, scopes, expires_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) return null;

  // Check expiry
  if (new Date(tokenRow.expires_at) < new Date()) return null;

  // Verify client is still active
  const { data: client, error: clientError } = await supabase
    .from("donny_oauth_clients")
    .select("is_active")
    .eq("id", tokenRow.client_id)
    .maybeSingle();

  if (clientError || !client || !client.is_active) return null;

  return {
    user_id: tokenRow.user_id,
    scopes: tokenRow.scopes || [],
  };
}

/**
 * Check whether a scopes array includes a required scope.
 */
export function requireScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}
```

- [ ] **Step 2: Verify the file was created**

Run: `ls supabase/functions/_shared/auth.ts`
Expected: file exists

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/auth.ts
git commit -m "feat: add shared Donny OAuth token validation middleware"
```

---

## Task 3: Update donny-chat Dual Auth

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts:1-3` (add import)
- Modify: `supabase/functions/donny-chat/index.ts:957-972` (auth section)

- [ ] **Step 1: Add import for shared auth middleware**

At the top of `supabase/functions/donny-chat/index.ts`, after the existing imports (line 2), add:

```typescript
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
```

- [ ] **Step 2: Replace the auth section with dual-auth logic**

Replace lines 957-972 (inside the `serve` handler, from `try {` through the `if (authError || !user)` line) with:

```typescript
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // --- Dual auth: Supabase session first, OAuth fallback ---
    let userId: string;

    // Try Supabase session auth first (in-app usage)
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (user && !authError) {
      userId = user.id;
    } else {
      // Fallback: try Donny OAuth token (Chrome Extension, external clients)
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) throw new Error("Unauthorized");
      if (!requireScope(oauthResult.scopes, "donny:chat")) {
        throw new Error("Insufficient scope: donny:chat required");
      }
      userId = oauthResult.user_id;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

Then update ALL downstream references from `user.id` to `userId` in the `serve()` handler. There are exactly 7 occurrences:

| Line | Context | Change |
|------|---------|--------|
| ~977 | `checkRateLimit(user.id, supabaseAdmin)` | → `checkRateLimit(userId, supabaseAdmin)` |
| ~999 | `.eq("id", user.id)` (profile lookup) | → `.eq("id", userId)` |
| ~1008 | `.eq("user_id", user.id)` (campaigns query) | → `.eq("user_id", userId)` |
| ~1015 | `.eq("applicant_id", user.id)` (pending apps) | → `.eq("applicant_id", userId)` |
| ~1108 | `executeTool(toolUse.name, toolUse.input, user.id, supabaseAdmin)` | → `executeTool(toolUse.name, toolUse.input, userId, supabaseAdmin)` |
| ~1118 | `user_id: user.id` (donny_tool_executions insert) | → `user_id: userId` |
| ~1128 | `user_id: user.id` (donny_actions insert) | → `user_id: userId` |

- [ ] **Step 3: Verify all `user.id` references are updated**

Run: `grep -n "user\.id" supabase/functions/donny-chat/index.ts`
Expected: No matches inside the `serve()` handler (there may be matches in tool functions above that use a different `user` variable — those are fine, they reference a function parameter, not the auth user).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: add dual auth to donny-chat — Supabase session + OAuth token fallback"
```

---

## Task 4: Final Verification

- [ ] **Step 1: Check that no OAuth endpoint files were modified**

Run: `git diff --name-only HEAD~3`
Expected output should include ONLY:
- `supabase/seed-oauth-client.sql`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/donny-chat/index.ts`

NOT include:
- `supabase/functions/donny-oauth-authorize/index.ts`
- `supabase/functions/donny-oauth-token/index.ts`
- `supabase/functions/donny-oauth-userinfo/index.ts`

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx deno check supabase/functions/donny-chat/index.ts` or verify with `npm run build` if applicable.

- [ ] **Step 3: Smoke-test the auth flow logic**

Manual review checklist:
- [ ] Bearer token extracted from Authorization header
- [ ] Supabase `getUser()` tried first
- [ ] On Supabase failure, `validateDonnyToken` called
- [ ] `donny:chat` scope checked for OAuth tokens
- [ ] `userId` used consistently (no remaining `user.id` references in handler)
- [ ] 401 returned if both auth methods fail
- [ ] `supabaseAdmin` used for all downstream queries (not `supabaseUser`)
