# Donny Chrome Extension — OAuth PKCE Flow Design

**Date:** 2026-03-26
**Status:** Approved
**Scope:** 7 files in the Chrome Extension (`C:/GIT/donny-chrome-extension/`)

## Summary

Enhance the existing Chrome Extension scaffold with a complete OAuth 2.0 PKCE authentication flow. Users authenticate with their DragonCandy account via `chrome.identity.launchWebAuthFlow`, tokens are stored in `chrome.storage.local`, and the side panel routes between an auth screen and the authenticated UI. Includes automatic token refresh, user profile fetching, and error handling.

## Goals

- Complete the OAuth PKCE login flow using `chrome.identity.launchWebAuthFlow`
- Add token persistence, refresh, and expiration handling
- Fetch and cache user profile after login
- Add loading and error states to the auth UI
- Enhance the OAuth callback page with branding
- Centralize PKCE and token logic in `api.ts`, storage in `storage.ts`

## Non-Goals

- Modifying `manifest.json`, `service-worker.ts`, or `content-script.ts`
- Integrating `useDonnyAPI.ts` with the real API (separate task)
- Offline detection, token revocation push, or multi-tab sync
- Streaming responses or conversation persistence

## Prerequisites

- **`manifest.json` must include the `identity` permission.** The OAuth flow uses `chrome.identity.launchWebAuthFlow()` and `chrome.identity.getRedirectURL()`, both of which require this permission. If it's not already present, add `"identity"` to the `permissions` array before testing. This is listed as a prerequisite rather than a file modification because the spec scope explicitly excludes manifest changes.

## Architecture

```
┌─────────────────────────────────────────────┐
│  UI Layer                                    │
│  AuthScreen.tsx ← useAuth.ts hook            │
│  App.tsx (routes auth vs authenticated)       │
├─────────────────────────────────────────────┤
│  Auth Logic Layer                            │
│  api.ts — PKCE, token exchange/refresh,      │
│           donnyFetch (Bearer + auto-retry)    │
├─────────────────────────────────────────────┤
│  Storage Layer                               │
│  storage.ts — chrome.storage.local           │
│  (tokens, user profile, typed helpers)        │
└─────────────────────────────────────────────┘
```

**Auth flow:**
1. User clicks "Connect with DragonCandy" on `AuthScreen`
2. `useAuth.login()` generates PKCE verifier + challenge + state param
3. `chrome.identity.launchWebAuthFlow` opens the OAuth popup → DragonCandy consent page
4. User consents → redirect back with `?code=...&state=...`
5. `useAuth` validates state, calls `exchangeCodeForToken()` in `api.ts`
6. Tokens saved via `storage.ts`, user profile fetched from `/donny-oauth-userinfo`
7. `useAuth` sets `isAuthenticated: true`, `App.tsx` renders the authenticated UI

**Token lifecycle:** On mount, `useAuth` checks stored tokens. If expired, attempts a silent refresh. A timer schedules refresh 5 minutes before expiry so sessions stay alive during use.

## Files Modified

| File | Action | Summary |
|---|---|---|
| `src/utils/constants.ts` | Modify | Add `DONNY_OAUTH_USERINFO_URL` |
| `src/utils/storage.ts` | Modify | Add `UserProfile` type, token/profile convenience methods, replace `clearAuth` with `clearTokens` |
| `src/utils/api.ts` | Modify | Add PKCE helpers, token exchange/refresh, `donnyFetch` wrapper, `AuthExpiredError`, rewrite `sendChatMessage` to use `donnyFetch` |
| `src/sidepanel/hooks/useAuth.ts` | Modify | Rewrite — use `api.ts` for PKCE/tokens, add state validation, auto-refresh timer, user profile fetch, expose `user` and `error` |
| `src/sidepanel/components/AuthScreen.tsx` | Modify | Add `isLoading`/`error` props, loading state, error display, enhanced branding |
| `src/sidepanel/App.tsx` | Modify | Pass new props to AuthScreen, show user display name in header |
| `src/oauth/callback.html` | Modify | Add DragonCandy branding, spinner, error/success/fallback states |

**Not modified:** `manifest.json`, `service-worker.ts`, `content-script.ts`, `ChatInterface.tsx`, `QuickActions.tsx`, `PageContext.tsx`

---

## Detailed Design

### 1. Constants (`src/utils/constants.ts`)

Add one constant after `DONNY_OAUTH_TOKEN_URL`:

```typescript
export const DONNY_OAUTH_USERINFO_URL = `${DONNY_API_BASE}/donny-oauth-userinfo`;
```

All existing constants unchanged.

### 2. Storage Layer (`src/utils/storage.ts`)

**New type:**

```typescript
export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: string;
}
```

**Storage schema** (extends existing `StorageData`):

```typescript
interface StorageData {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  user_profile: UserProfile;
}
```

**Existing helpers stay:** `getStorageItem`, `setStorageItem`, `removeStorageItem` unchanged.

**New convenience methods:**

| Method | Signature | Behavior |
|---|---|---|
| `saveTokens` | `(access_token: string, refresh_token: string, expires_in: number) → Promise<void>` | Batch-save all three fields. Calculates `token_expires_at` as `Date.now() + expires_in * 1000` |
| `getTokens` | `() → Promise<{ access_token, refresh_token, token_expires_at } \| null>` | Returns token bundle or `null` if no `access_token` stored |
| `clearTokens` | `() → Promise<void>` | Removes all 4 keys: `access_token`, `refresh_token`, `token_expires_at`, `user_profile` |
| `saveUserProfile` | `(profile: UserProfile) → Promise<void>` | Stores profile object |
| `getUserProfile` | `() → Promise<UserProfile \| null>` | Returns profile or `null` |

**Breaking change:** `clearAuth()` removed, replaced by `clearTokens()`. Only consumer is `useAuth.ts` which is being rewritten.

### 3. API Layer (`src/utils/api.ts`)

**New types:**

```typescript
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

export class AuthExpiredError extends Error {
  constructor() {
    super("Authentication expired — please sign in again");
    this.name = "AuthExpiredError";
  }
}
```

**New functions:**

#### `generateCodeVerifier(): string`
- 32 random bytes via `crypto.getRandomValues`
- Base64url encoded (replace `+` → `-`, `/` → `_`, strip `=`)
- Moved here from `useAuth.ts` — PKCE logic belongs with auth primitives

#### `generateCodeChallenge(verifier: string): Promise<string>`
- SHA-256 hash via `crypto.subtle.digest`
- Base64url encoded

#### `exchangeCodeForToken(code, codeVerifier, redirectUri): Promise<TokenResponse>`
- POST to `DONNY_OAUTH_TOKEN_URL`
- Body: `{ grant_type: "authorization_code", client_id, code, redirect_uri, code_verifier }`
- On error: parse `error_description` from response body, throw `Error`

#### `refreshAccessToken(refreshToken): Promise<TokenResponse>`
- POST to `DONNY_OAUTH_TOKEN_URL`
- Body: `{ grant_type: "refresh_token", client_id, refresh_token }`
- On error: clear tokens via `clearTokens()`, throw `AuthExpiredError`
- **Deduplication:** A module-level `refreshPromise` variable prevents concurrent refresh calls. If a refresh is already in flight, subsequent callers await the same promise. This prevents a race condition where the auto-refresh timer and a `donnyFetch` 401 retry both attempt to rotate the refresh token simultaneously (the server deletes the old token on use, so the second caller would find it missing).

```typescript
let refreshPromise: Promise<TokenResponse> | null = null;

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh(refreshToken).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
```

#### `donnyFetch(endpoint, options?): Promise<Response>`
1. Get tokens from storage → throw `AuthExpiredError` if none
2. Build URL — accepts relative endpoint (e.g. `"donny-chat"`) or full URL. Leading slashes on relative endpoints are stripped to avoid double-slash URLs.
3. Set `Authorization: Bearer <token>`. Only set `Content-Type: application/json` when `options.body` is present (avoids sending content-type on GET requests).
4. Make request
5. If 401 → refresh token → save new tokens → retry once with new token
6. If still 401 → clear tokens, throw `AuthExpiredError`
7. Return response (caller checks `response.ok`)

#### `sendChatMessage(request): Promise<ChatResponse>` (rewritten)
- Now uses `donnyFetch(DONNY_CHAT_URL, ...)` instead of raw `fetch`
- Same interface and return type
- Gets automatic token refresh for free

### 4. Auth Hook (`src/sidepanel/hooks/useAuth.ts`)

**State:**

```typescript
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserProfile | null;
}
```

**Return:** `{ isAuthenticated, isLoading, error, user, login, logout }`

#### Mount — check existing session

- Load tokens via `getTokens()`
- No tokens → set unauthenticated, done
- Tokens expired → attempt `refreshAccessToken()`. Success → save new tokens, schedule refresh, load cached profile, set authenticated. Failure → set unauthenticated
- Tokens valid → schedule refresh timer, load cached `getUserProfile()`, set authenticated

#### `login()` — full PKCE flow

1. Set `isLoading: true`, clear `error`
2. Generate `codeVerifier` + `codeChallenge` via `api.ts`
3. Generate random `state` param (16 bytes → base64url)
4. Build authorize URL: `DONNY_OAUTH_AUTHORIZE_URL` with params: `client_id`, `redirect_uri` (from `chrome.identity.getRedirectURL()`), `response_type: "code"`, `scope`, `code_challenge`, `code_challenge_method: "S256"`, `state`
5. `chrome.identity.launchWebAuthFlow({ url, interactive: true })`
6. If no response URL → throw "Auth flow was cancelled"
7. Parse response URL params:
   - If `error` param → throw the `error_description`
   - If `state` doesn't match → throw "OAuth state mismatch — possible CSRF attack"
   - Extract `code`
8. `exchangeCodeForToken(code, codeVerifier, redirectUri)`
9. `saveTokens(...)`, schedule refresh timer
10. Best-effort: fetch user profile via `donnyFetch(DONNY_OAUTH_USERINFO_URL)`, save if successful
11. Set `isAuthenticated: true, user: profile`
12. On any error → set `error` message, stay unauthenticated

#### Auto-refresh timer

- `useRef<ReturnType<typeof setTimeout>>` holds the timeout ID
- `scheduleRefresh(expiresAt)` — calculates `expiresAt - Date.now() - 5 minutes`, sets timeout
- On fire: get stored refresh token → `refreshAccessToken()` → `saveTokens()` → reschedule
- On failure: silently set unauthenticated
- Cleanup: `useEffect` return clears the timeout

#### `logout()`

- Clear refresh timer
- `clearTokens()`
- Reset state to unauthenticated

### 5. AuthScreen (`src/sidepanel/components/AuthScreen.tsx`)

**Props:**

```typescript
interface AuthScreenProps {
  onLogin: () => void;
  isLoading: boolean;
  error: string | null;
}
```

**Layout** (400px side panel, dark `donny-bg` background):
- Vertically centered, `px-6` padding
- Teal circle with "D" — `w-20 h-20 rounded-full bg-donny-teal`
- "DRAGONCANDY" wordmark — teal, 12px, bold, `tracking-[0.2em]` uppercase
- **"Donny"** title — `text-2xl font-bold text-donny-text`
- Subtitle — "Sign in with your DragonCandy account to use Donny while you browse" — `text-donny-text/60 text-sm`
- Small pink dot separator — `w-2 h-2 rounded-full bg-donny-pink`
- Full-width teal pill button — `w-full max-w-xs py-3 rounded-full bg-donny-teal text-donny-bg font-bold`
  - Default: "Connect with DragonCandy"
  - Loading: "Connecting..." with `animate-pulse`, button disabled
- Error message — `text-donny-pink text-xs` below button, shown when `error` is non-null

### 6. App.tsx (`src/sidepanel/App.tsx`)

Minor changes:
- Destructure `error` and `user` from `useAuth()` (in addition to existing `isAuthenticated`, `isLoading`, `login`, `logout`)
- Pass `isLoading` and `error` to `<AuthScreen>`
- Show `user.display_name` in the header as a subtitle under "Donny" when available
- **Mount loading:** During the initial token check on mount (`isLoading: true` and `isAuthenticated: false`), show a minimal loading indicator (the "D" logo with a subtle pulse) rather than immediately showing the full AuthScreen with "Connecting..." on the login button. This avoids confusion — "Connecting..." implies the user initiated a login, but during mount the app is just checking stored tokens. Once mount loading completes, either show the authenticated UI or the AuthScreen with the login button enabled.

### 7. Callback Page (`src/oauth/callback.html`)

Standalone HTML (no Tailwind — plain CSS since it's outside the build pipeline).

**Note:** When using `chrome.identity.launchWebAuthFlow`, Chrome intercepts the redirect URL before actually loading this page — the authorization code is returned directly to the calling code. This page is a branded fallback that may briefly flash in the popup during the redirect, and serves as a landing page if the OAuth URL is ever opened outside the extension context (e.g., manually in a browser tab). It does **not** relay messages back to the extension via `chrome.runtime.sendMessage`.

**Styling:** Dark background (`#0a0a1a`), centered card, "DRAGONCANDY" teal wordmark.

**Three states** (show/hide via JS):

| State | Shown When | Content |
|---|---|---|
| Loading | Default on page load | Teal spinner + "Connecting to DragonCandy..." + "This window will close automatically" |
| Error | `error` param in URL | Pink error message from `error_description` + auto-close after 3s |
| Fallback | No code or error (unexpected state) | "You can close this window" |

**Script behavior:**
1. Parse `error`, `error_description` from URL params
2. If `error` → show error state, auto-close after 3s
3. Otherwise → show fallback (page was loaded outside the normal extension flow)

---

## Error Handling

### OAuth Flow Failures

| Scenario | Handling |
|---|---|
| User closes OAuth popup | `launchWebAuthFlow` returns `undefined` → "Auth flow was cancelled" |
| OAuth server returns error | Parse `error_description` from redirect URL → display it |
| State param mismatch | "OAuth state mismatch — possible CSRF attack" — do not exchange the code |
| Token exchange fails | Parse error body if JSON, fall back to "Token exchange failed: {status}" |
| Token exchange malformed response | Caught by try/catch → "Login failed" |

### Token Refresh Failures

| Scenario | Handling |
|---|---|
| Refresh token expired/revoked | `refreshAccessToken` clears tokens, throws `AuthExpiredError` |
| Network error during refresh | Timer callback catches → silently set unauthenticated |
| Refresh succeeds, userinfo fails | Non-fatal — auth proceeds, `user` stays cached or null |

### `donnyFetch` Failures

| Scenario | Handling |
|---|---|
| No tokens in storage | Throws `AuthExpiredError` immediately |
| 401 on first request | Refresh + retry once |
| 401 after retry | Clear tokens, throw `AuthExpiredError` |
| Non-401 errors | Returned as-is — caller checks `response.ok` |

### Edge Cases

| Case | Handling |
|---|---|
| Multiple login clicks | `isLoading: true` disables button |
| Mount with expired session | Silent refresh before showing AuthScreen |
| Extension restart | Tokens persist in `chrome.storage.local`, mount check restores session |
| Timer cleanup | `useEffect` return clears timeout on unmount |

## Explicitly Not Handled (Future Work)

- Offline detection
- Token revocation push notifications
- Multi-tab/side-panel sync of storage changes
