# Donny OAuth 2.0 Authorization Flow

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Three new Supabase Edge Functions + one new database table + one schema migration

## Summary

Implement an OAuth 2.0 authorization flow so external surfaces (Chrome Extension, mobile widgets, SDK embeds) can authenticate DragonCandy users. Uses PKCE for public clients, opaque tokens, and a DragonCandy-branded consent screen. Sits alongside Supabase Auth — does not modify existing auth flows.

## Goals

- Enable Chrome Extension, mobile widgets, and SDK embeds to authenticate users with their DragonCandy accounts
- Implement standard OAuth 2.0 authorization code flow with PKCE
- Issue opaque access/refresh tokens for API access
- Provide a userinfo endpoint for retrieving profile data

## Non-goals

- Confidential client support (client_secret validation) — public clients only
- JWT access tokens — opaque tokens with database lookup
- Rate limiting — not available natively in Supabase Edge Functions
- Token revocation endpoint — users revoke via RLS DELETE policy on `donny_oauth_tokens`
- Consent memory ("remember this app") — consent screen shown every time
- Modifying existing auth flows, login page, or Supabase Auth configuration

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client type | Public only | All target surfaces (extension, widgets, SDK) are public clients — secrets can't be kept secret |
| Auth code storage | Dedicated `donny_oauth_codes` table | Codes are short-lived and fundamentally different from tokens; clean separation |
| Consent screen | Branded HTML from edge function | Trust moment for users; should feel like DragonCandy without coupling to frontend deployment |
| Unauthenticated users | Redirect to DragonCandy login with `returnTo` | Reuses existing login flow, supports all auth methods |
| Scopes | `profile:read` and `donny:chat` only | YAGNI — covers Chrome Extension use case, more scopes added later |
| Token format | Opaque (random bytes, hashed) | Simpler than JWT, instant revocation, no signing key management. All consumers hit Supabase anyway |
| Architecture | Three standalone edge functions | Matches existing project convention of one function per endpoint |

## Data Model

### New table: `donny_oauth_codes`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Row identifier |
| `code_hash` | text NOT NULL | SHA-256 hash of the authorization code |
| `user_id` | uuid NOT NULL → auth.users | Who authorized |
| `client_id` | uuid NOT NULL → donny_oauth_clients(id) | Which app (references the uuid PK, not the text `client_id`) |
| `redirect_uri` | text NOT NULL | Must match on token exchange |
| `scopes` | text[] NOT NULL | Granted scopes |
| `code_challenge` | text NOT NULL | PKCE challenge |
| `code_challenge_method` | text NOT NULL DEFAULT 'S256' | Always S256 |
| `expires_at` | timestamptz NOT NULL | 10 minutes from creation |
| `used` | boolean DEFAULT false | Prevents replay |
| `created_at` | timestamptz DEFAULT now() | Audit |

- RLS enabled, no user-facing policies — all access via service_role key
- Index on `code_hash` for fast lookup during token exchange

### Schema migration for existing tables

The migration will also:
- Alter `donny_oauth_clients.client_secret_hash` to be nullable (`DROP NOT NULL`). Public clients don't use secrets — the column remains for potential future confidential client support but is not validated in this flow.
- Add index on `donny_oauth_tokens.refresh_token_hash` for fast lookup during token refresh.

### Client ID resolution pattern

`donny_oauth_clients` has two ID fields: `id` (uuid PK) and `client_id` (text, user-facing). External callers always provide the text `client_id`. Edge functions must:
1. Look up the client row by the text `client_id` column
2. Use the row's `id` (uuid) for all FK references in `donny_oauth_codes` and `donny_oauth_tokens`

### Existing tables used as-is

- `donny_oauth_clients` — client lookup and redirect_uri validation
- `donny_oauth_tokens` — hashed access/refresh token storage. The `expires_at` column stores the access token expiry (1 hour). Refresh token expiry (30 days) is calculated from `created_at` in application code — no additional column needed.
- `profiles` — userinfo reads display_name, role, avatar_url
- `business_profiles` — userinfo reads company_name for business users

### Cleanup strategy

Expired authorization codes and tokens accumulate over time. For now, cleanup is deferred — acceptable at the expected volume. A Postgres cron job (`pg_cron`) or periodic manual cleanup can be added when needed: `DELETE FROM donny_oauth_codes WHERE expires_at < now()` and similar for tokens.

## Edge Function 1: `donny-oauth-authorize`

### GET — Validate params and show consent screen

**Query params:** `client_id`, `redirect_uri`, `scope`, `state` (required), `code_challenge`, `code_challenge_method`

**Validation (in order):**
1. Require `client_id`, `redirect_uri`, `code_challenge`, `state` — 400 if missing. `state` is required (CSRF protection on the client side).
2. Look up client in `donny_oauth_clients` where `client_id` matches and `is_active = true` — 400 if not found
3. Validate `redirect_uri` is in the client's `redirect_uris` array (exact match) — 400 if invalid
4. Validate requested scopes are a subset of client's allowed `scopes` — default to client's scopes if omitted
5. `code_challenge_method` must be `S256` — reject `plain`

**Authentication check:**
- Extract Supabase auth token from `Authorization` header
- No valid session → 302 redirect to `https://dragoncandy.io/login?returnTo=<full authorize URL>`
- Valid session → render consent screen HTML

**Consent screen:**
- DragonCandy branded (teal/pink palette, pill buttons, logo)
- Shows app name from `donny_oauth_clients.client_name`
- Lists requested scopes in plain language:
  - `profile:read` → "Access your profile information"
  - `donny:chat` → "Chat with Donny on your behalf"
- "Allow" button (POST form to same endpoint) and "Deny" button (redirect to `redirect_uri?error=access_denied&state=<state>`)
- The HTML form embeds all OAuth parameters as hidden fields: `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method`
- The form also embeds the user's Supabase access token as a hidden field (`access_token`) so the POST can re-authenticate the user
- A short-lived CSRF token (random, stored in a hidden field and validated on POST) prevents cross-site consent form submission

### POST — Process consent approval

1. Validate the CSRF token matches the one generated during GET
2. Re-authenticate the user using the `access_token` hidden field (call `supabase.auth.getUser(token)`)
3. Re-validate all OAuth params from the POST body (same validation as GET steps 1-5) — never trust the form values without re-checking
4. Generate authorization code (48 bytes, base64url encoded)
5. SHA-256 hash the code
6. Insert into `donny_oauth_codes` with 10-minute expiry
7. 302 redirect to `redirect_uri?code=<raw_code>&state=<state>`

## Edge Function 2: `donny-oauth-token`

### POST — Token exchange

**Accepts:** `application/json` or `application/x-www-form-urlencoded`

### grant_type=authorization_code

**Required params:** `code`, `client_id`, `redirect_uri`, `code_verifier`

1. Hash `code` with SHA-256, look up in `donny_oauth_codes`
2. Validate: not expired, not used, redirect_uri matches. Look up client by text `client_id`, verify the code row's `client_id` (uuid FK) matches the looked-up client's `id`.
3. PKCE: SHA-256 hash `code_verifier`, base64url encode, compare against stored `code_challenge`
4. Mark code as `used = true`
5. Generate access token (48 bytes random, base64url) and refresh token (48 bytes random, base64url)
6. Hash both, insert into `donny_oauth_tokens` with 1-hour expiry
7. Return:
```json
{
  "access_token": "<raw_token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<raw_refresh_token>",
  "scope": "profile:read donny:chat"
}
```

### grant_type=refresh_token

**Required params:** `refresh_token`, `client_id`

1. Hash refresh token, look up in `donny_oauth_tokens`
2. Validate: exists, client's uuid `id` matches token's `client_id` FK, within 30-day window from `created_at` (computed in application code: `created_at + 30 days > now()`)
3. Delete old token row (refresh rotation)
4. Generate new access + refresh token pair, insert new row
5. Return same response shape

### Error format (OAuth 2.0 spec)
```json
{ "error": "invalid_grant", "error_description": "Authorization code has expired" }
```

## Edge Function 3: `donny-oauth-userinfo`

### GET — Return user profile

**Header:** `Authorization: Bearer <access_token>`

**Validation:**
1. Extract token from header — 401 if missing
2. Hash token, look up in `donny_oauth_tokens` — 401 if not found
3. Validate: not expired (`expires_at > now()`)
4. Confirm associated client `is_active = true`

**Response (when `profile:read` scope granted):**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "display_name": "Jane Smith",
  "role": "business",
  "avatar_url": "https://...",
  "company_name": "Acme Inc"
}
```

**When `profile:read` NOT in scopes:** `{ "id": "user-uuid" }`

Data sources: `id` and `email` from `auth.users` (queried via service_role client, since `auth.users` requires elevated access), `display_name`/`role`/`avatar_url` from `profiles`, `company_name` from `business_profiles` (null for creators). All three edge functions use the Supabase service_role client for database access.

## Security

| Concern | Mitigation |
|---------|-----------|
| PKCE required | `code_challenge_method=S256` enforced, `plain` rejected. Every token exchange validates `code_verifier` |
| No client secrets | Public clients only — security relies on PKCE |
| Token storage | All tokens and codes SHA-256 hashed via `crypto.subtle.digest` before storage. Raw values never persisted |
| Code replay | Authorization codes marked `used = true` after first exchange |
| Code expiry | 10-minute TTL |
| Token expiry | Access: 1 hour. Refresh: 30 days from creation |
| Refresh rotation | Each refresh deletes old row and issues new pair |
| Open redirect | `redirect_uri` exact-matched against registered `redirect_uris` array |
| RLS isolation | `donny_oauth_codes` and `donny_oauth_clients` have no user-facing policies — service_role only |
| CSRF on consent | Short-lived CSRF token in consent form, validated on POST |
| `state` required | `state` param is mandatory — prevents CSRF on the client side |
| CORS | Same `corsHeaders` pattern as existing edge functions |

## End-to-End Flow

```
Chrome Extension                  authorize endpoint              DragonCandy App
      |                                  |                              |
      |  1. Generate code_verifier       |                              |
      |     + code_challenge (S256)      |                              |
      |                                  |                              |
      |  2. GET /donny-oauth-authorize   |                              |
      |     ?client_id=ext-123           |                              |
      |     &redirect_uri=chrome://...   |                              |
      |     &scope=profile:read+donny:chat                              |
      |     &state=random123             |                              |
      |     &code_challenge=abc...       |                              |
      |     &code_challenge_method=S256  |                              |
      |                                  |                              |
      |                 3. No session? --302--> /login?returnTo=...      |
      |                                  |                              |
      |                                  |   4. User logs in            |
      |                                  |                              |
      |                 5. <--redirect back to authorize endpoint--      |
      |                                  |                              |
      |                 6. Show consent   |                              |
      |                    screen (HTML)  |                              |
      |                                  |                              |
      |                 7. User clicks    |                              |
      |                    "Allow"        |                              |
      |                                  |                              |
      |  8. <--302 redirect_uri?code=xyz&state=random123--              |
      |                                  |                              |
      |  9. POST /donny-oauth-token      |                              |
      |     grant_type=authorization_code |                              |
      |     code=xyz                     |                              |
      |     code_verifier=original       |                              |
      |     client_id=ext-123            |                              |
      |     redirect_uri=chrome://...    |                              |
      |                                  |                              |
      |  10. <-- { access_token, refresh_token, expires_in }            |
      |                                  |                              |
      |  11. GET /donny-oauth-userinfo   |                              |
      |      Authorization: Bearer token |                              |
      |                                  |                              |
      |  12. <-- { id, email, display_name, role, ... }                 |
      |                                  |                              |
      |  13. Use access_token to call    |                              |
      |      /donny-chat with Bearer auth|                              |
```
