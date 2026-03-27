# Donny OAuth Client Registration & Auth Middleware

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** OAuth authorization flow (donny-oauth-authorize, donny-oauth-token, donny-oauth-userinfo)

## Summary

Register the Chrome Extension as an official OAuth client and create shared auth middleware that all Donny API endpoints can use to validate OAuth tokens. Update donny-chat to support both Supabase session auth (in-app) and OAuth token auth (Chrome Extension).

## 1. Seed Script — `supabase/seed-oauth-client.sql`

Idempotent INSERT for the Chrome Extension client into `donny_oauth_clients`:

| Field | Value |
|-------|-------|
| `client_name` | `'Donny Chrome Extension'` |
| `client_id` | `'donny-chrome-ext-v1'` |
| `client_secret_hash` | `NULL` (public client, PKCE-only) |
| `redirect_uris` | `{'chrome-extension://EXTENSION_ID_PLACEHOLDER/callback.html'}` |
| `scopes` | `'{donny:chat,campaigns:read,campaigns:write,creators:read,analytics:read,messages:read,messages:write,profile:read}'` |

- Uses `ON CONFLICT (client_id) DO NOTHING` for idempotency
- `EXTENSION_ID_PLACEHOLDER` to be replaced with real Chrome Extension ID after publishing
- `client_secret_hash` is nullable per migration 20260326

## 2. Shared Auth Middleware — `supabase/functions/_shared/auth.ts`

New shared module (the `_shared/` directory does not yet exist).

### `validateDonnyToken(request: Request): Promise<{ user_id: string, scopes: string[] } | null>`

1. Extract Bearer token from `Authorization` header
2. Hash token with SHA-256 using Web Crypto API (`crypto.subtle.digest`), matching the pattern used in donny-oauth-token and donny-oauth-userinfo
3. Creates its own service-role Supabase client internally from `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars (RLS on oauth tables only permits service_role)
4. Query `donny_oauth_tokens` by `access_token_hash`, joining `donny_oauth_clients` to verify `is_active = true`
5. Check `expires_at > now()`
6. Return `{ user_id, scopes }` if valid, `null` otherwise

### `requireScope(scopes: string[], required: string): boolean`

Simple `scopes.includes(required)` check.

## 3. Donny-Chat Auth Update — `supabase/functions/donny-chat/index.ts`

**Current:** Extracts Bearer token, calls `supabase.auth.getUser()`, uses returned user ID.

**New flow (Supabase first, OAuth fallback):**

1. Extract Bearer token from Authorization header (unchanged)
2. Try `supabase.auth.getUser()` with the token
3. If succeeds: proceed as today (in-app Supabase session), full tool access
4. If fails: call `validateDonnyToken(request)` from `_shared/auth.ts`
5. If OAuth token valid: use returned `user_id`, verify `donny:chat` scope present
6. If neither works: return 401 `{ error: "Unauthorized" }`

**Scope enforcement:** Initial version validates `donny:chat` scope for the chat endpoint. Individual tool-level scope gating is a future enhancement.

**Supabase client handling in OAuth path:** The current code creates a `supabaseUser` client with the raw Authorization header baked in. For the OAuth path, this client would be invalid (the token is not a Supabase JWT). Instead, when OAuth auth succeeds, downstream queries use the existing `supabaseAdmin` client scoped to the validated `user_id`. The `supabaseUser` client is only constructed after Supabase auth succeeds; on the OAuth path it is never created.

**Rate limiting:** OAuth-authenticated requests are subject to the same rate limits as in-app users — the `checkRateLimit` function uses `user_id` which is populated by either auth method.

**Blast radius:** Only the auth section at the top of the request handler changes. System prompt, tool execution, conversation history, and all other logic remain untouched. The `user_id` from either auth method feeds into the same downstream code.

## Files Changed

| File | Action |
|------|--------|
| `supabase/seed-oauth-client.sql` | Create |
| `supabase/functions/_shared/auth.ts` | Create |
| `supabase/functions/donny-chat/index.ts` | Modify (auth section only) |

## Files NOT Changed

- `supabase/functions/donny-oauth-authorize/index.ts` — untouched
- `supabase/functions/donny-oauth-token/index.ts` — untouched
- `supabase/functions/donny-oauth-userinfo/index.ts` — untouched
