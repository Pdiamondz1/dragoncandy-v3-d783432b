# Donny Chrome Extension — OAuth PKCE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the OAuth 2.0 PKCE authentication flow in the Donny Chrome Extension so users can sign in with their DragonCandy account, with automatic token refresh and user profile caching.

**Architecture:** Three-layer design — storage (`storage.ts`) handles `chrome.storage.local` persistence, API layer (`api.ts`) handles PKCE, token exchange/refresh, and authenticated fetch, and the UI layer (`useAuth.ts` → `AuthScreen.tsx` → `App.tsx`) manages state and rendering. The OAuth flow uses `chrome.identity.launchWebAuthFlow` with PKCE S256.

**Tech Stack:** React 18, TypeScript (strict), Chrome Extension Manifest V3, `@crxjs/vite-plugin`, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-26-donny-chrome-extension-oauth-design.md`

**Project directory:** `C:/GIT/donny-chrome-extension/`

**Build command:** `npm run build` (runs `tsc && vite build`)

**Protected files (DO NOT modify):** `src/background/service-worker.ts`, `src/content/content-script.ts`

**Note on manifest.json:** Task 0 adds the `identity` permission — this is the only allowed change to the manifest.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `manifest.json` | Modify | Add `identity` permission (Task 0 only) |
| `src/utils/constants.ts` | Modify | Add `DONNY_OAUTH_USERINFO_URL` |
| `src/utils/storage.ts` | Modify | Add `UserProfile` type, `saveTokens`, `getTokens`, `clearTokens`, `saveUserProfile`, `getUserProfile` |
| `src/utils/api.ts` | Modify | Add PKCE helpers, `TokenResponse`, `AuthExpiredError`, `exchangeCodeForToken`, `refreshAccessToken` (with dedup), `donnyFetch`, rewrite `sendChatMessage` |
| `src/sidepanel/hooks/useAuth.ts` | Modify | Rewrite — delegate to `api.ts`/`storage.ts`, add state validation, auto-refresh timer, user profile fetch |
| `src/sidepanel/components/AuthScreen.tsx` | Modify | Add `isLoading`/`error` props, loading state, error display, updated copy |
| `src/sidepanel/App.tsx` | Modify | Mount loading indicator, pass props to AuthScreen, show user name in header |
| `src/oauth/callback.html` | Modify | Branded fallback page with loading/error/fallback states |

---

## Task 0: Add `identity` permission to manifest.json

**Files:**
- Modify: `manifest.json`

The `chrome.identity.launchWebAuthFlow()` and `chrome.identity.getRedirectURL()` APIs require the `identity` permission. Without it, the entire OAuth flow fails at runtime.

- [ ] **Step 1: Add the permission**

In `manifest.json`, add `"identity"` to the `permissions` array. Change:

```json
"permissions": ["sidePanel", "activeTab", "storage", "contextMenus", "tabs"],
```

To:

```json
"permissions": ["sidePanel", "activeTab", "storage", "identity", "contextMenus", "tabs"],
```

- [ ] **Step 2: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add manifest.json
git commit -m "feat(auth): add identity permission for OAuth flow"
```

---

## Task 1: Add userinfo URL constant

**Files:**
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: Add the constant**

In `src/utils/constants.ts`, add after line 5 (`DONNY_OAUTH_TOKEN_URL`):

```typescript
export const DONNY_OAUTH_USERINFO_URL = `${DONNY_API_BASE}/donny-oauth-userinfo`;
```

The file should now be:

```typescript
export const SUPABASE_URL = "https://zocahiffooqdybdhguqv.supabase.co";
export const DONNY_API_BASE = `${SUPABASE_URL}/functions/v1`;
export const DONNY_CHAT_URL = `${DONNY_API_BASE}/donny-chat`;
export const DONNY_OAUTH_AUTHORIZE_URL = `${DONNY_API_BASE}/donny-oauth-authorize`;
export const DONNY_OAUTH_TOKEN_URL = `${DONNY_API_BASE}/donny-oauth-token`;
export const DONNY_OAUTH_USERINFO_URL = `${DONNY_API_BASE}/donny-oauth-userinfo`;

export const OAUTH_CLIENT_ID = "donny-chrome-ext-v1";
export const OAUTH_SCOPES = "donny:chat campaigns:read campaigns:write creators:read analytics:read messages:read messages:write profile:read";

export const SURFACE = "chrome_extension" as const;
```

- [ ] **Step 2: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/utils/constants.ts
git commit -m "feat(auth): add DONNY_OAUTH_USERINFO_URL constant"
```

---

## Task 2: Build auth foundation — storage, API, and useAuth hook

**Files:**
- Modify: `src/utils/storage.ts`
- Modify: `src/utils/api.ts`
- Modify: `src/sidepanel/hooks/useAuth.ts`

These three files are modified together because `storage.ts` removes `clearAuth` (breaking `useAuth.ts`), `api.ts` imports from `storage.ts`, and `useAuth.ts` imports from both. Applying them atomically ensures the build never breaks.

- [ ] **Step 1: Replace `src/utils/storage.ts`**

The file currently has `StorageData` with 3 fields, `getStorageItem`, `setStorageItem`, `removeStorageItem`, and `clearAuth`. We:
- Add `user_profile` to `StorageData`
- Export `UserProfile` type
- Add `saveTokens`, `getTokens`, `clearTokens`, `saveUserProfile`, `getUserProfile`
- Remove `clearAuth` (replaced by `clearTokens`)

Write this to `src/utils/storage.ts`:

```typescript
export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: string;
}

interface StorageData {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  user_profile: UserProfile;
}

type StorageKey = keyof StorageData;

export async function getStorageItem<K extends StorageKey>(
  key: K
): Promise<StorageData[K] | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as StorageData[K]) ?? null;
}

export async function setStorageItem<K extends StorageKey>(
  key: K,
  value: StorageData[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeStorageItem(key: StorageKey): Promise<void> {
  await chrome.storage.local.remove(key);
}

export async function saveTokens(
  access_token: string,
  refresh_token: string,
  expires_in: number
): Promise<void> {
  const token_expires_at = Date.now() + expires_in * 1000;
  await chrome.storage.local.set({
    access_token,
    refresh_token,
    token_expires_at,
  });
}

export async function getTokens(): Promise<{
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
} | null> {
  const result = await chrome.storage.local.get([
    "access_token",
    "refresh_token",
    "token_expires_at",
  ]);
  if (!result.access_token) return null;
  return {
    access_token: result.access_token as string,
    refresh_token: result.refresh_token as string,
    token_expires_at: result.token_expires_at as number,
  };
}

export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove([
    "access_token",
    "refresh_token",
    "token_expires_at",
    "user_profile",
  ]);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ user_profile: profile });
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const result = await chrome.storage.local.get("user_profile");
  return (result.user_profile as UserProfile) ?? null;
}
```

- [ ] **Step 2: Replace `src/utils/api.ts`**

The file currently has `ChatMessage`, `ChatRequest`, `ChatResponse` types and `sendChatMessage`. We rewrite it to add all auth primitives and rewrite `sendChatMessage` to use `donnyFetch`.

Write this to `src/utils/api.ts`:

```typescript
import {
  DONNY_API_BASE,
  DONNY_CHAT_URL,
  DONNY_OAUTH_TOKEN_URL,
  OAUTH_CLIENT_ID,
  SURFACE,
} from "./constants";
import { clearTokens, getTokens, saveTokens } from "./storage";

// ── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  conversation_id?: string;
  context_url?: string;
  context_metadata?: Record<string, string>;
}

export interface ChatResponse {
  reply: string;
  conversation_id: string;
}

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

// ── PKCE helpers ───────────────────────────────────────────

function toBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return toBase64Url(array.buffer);
}

export async function generateCodeChallenge(
  verifier: string
): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(digest);
}

// ── Token exchange ─────────────────────────────────────────

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const response = await fetch(DONNY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: OAUTH_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.error_description ?? `Token exchange failed: ${response.status}`;
    throw new Error(message);
  }

  return response.json();
}

// ── Token refresh (with deduplication) ─────────────────────

let refreshPromise: Promise<TokenResponse> | null = null;

async function doRefresh(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(DONNY_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    await clearTokens();
    throw new AuthExpiredError();
  }

  return response.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh(refreshToken).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// ── Authenticated fetch wrapper ────────────────────────────

export async function donnyFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const tokens = await getTokens();
  if (!tokens) throw new AuthExpiredError();

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${DONNY_API_BASE}/${endpoint.replace(/^\/+/, "")}`;

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);
  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response = await fetch(url, { ...options, headers });

  if (response.status === 401 && tokens.refresh_token) {
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    await saveTokens(
      refreshed.access_token,
      refreshed.refresh_token,
      refreshed.expires_in
    );

    headers.set("Authorization", `Bearer ${refreshed.access_token}`);
    response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      await clearTokens();
      throw new AuthExpiredError();
    }
  }

  return response;
}

// ── Chat API ───────────────────────────────────────────────

export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  const response = await donnyFetch(DONNY_CHAT_URL, {
    method: "POST",
    body: JSON.stringify({
      message: request.message,
      conversation_id: request.conversation_id,
      surface: SURFACE,
      context_url: request.context_url,
      context_metadata: request.context_metadata,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 3: Replace `src/sidepanel/hooks/useAuth.ts`**

This is the most complex file. The hook is rewritten to:
- Delegate PKCE and token operations to `api.ts`
- Delegate storage to `storage.ts`
- Add CSRF state parameter validation
- Add auto-refresh timer
- Fetch and cache user profile after login
- Expose `user` and `error` in return value

Write this to `src/sidepanel/hooks/useAuth.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearTokens,
  getTokens,
  getUserProfile,
  saveTokens,
  saveUserProfile,
} from "@/utils/storage";
import type { UserProfile } from "@/utils/storage";
import {
  exchangeCodeForToken,
  generateCodeChallenge,
  generateCodeVerifier,
  refreshAccessToken,
  donnyFetch,
} from "@/utils/api";
import {
  DONNY_OAUTH_AUTHORIZE_URL,
  DONNY_OAUTH_USERINFO_URL,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES,
} from "@/utils/constants";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserProfile | null;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
    user: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (expiresAt: number) => {
      clearRefreshTimer();
      const delay = Math.max(expiresAt - Date.now() - REFRESH_BUFFER_MS, 0);
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const tokens = await getTokens();
          if (!tokens?.refresh_token) return;
          const refreshed = await refreshAccessToken(tokens.refresh_token);
          await saveTokens(
            refreshed.access_token,
            refreshed.refresh_token,
            refreshed.expires_in
          );
          scheduleRefresh(Date.now() + refreshed.expires_in * 1000);
        } catch {
          setState({
            isAuthenticated: false,
            isLoading: false,
            error: null,
            user: null,
          });
        }
      }, delay);
    },
    [clearRefreshTimer]
  );

  // Check for existing session on mount
  useEffect(() => {
    async function checkAuth() {
      const tokens = await getTokens();

      if (!tokens) {
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: null,
          user: null,
        });
        return;
      }

      // Token expired — try silent refresh
      if (Date.now() >= tokens.token_expires_at) {
        try {
          const refreshed = await refreshAccessToken(tokens.refresh_token);
          await saveTokens(
            refreshed.access_token,
            refreshed.refresh_token,
            refreshed.expires_in
          );
          const profile = await getUserProfile();
          scheduleRefresh(Date.now() + refreshed.expires_in * 1000);
          setState({
            isAuthenticated: true,
            isLoading: false,
            error: null,
            user: profile,
          });
        } catch {
          setState({
            isAuthenticated: false,
            isLoading: false,
            error: null,
            user: null,
          });
        }
        return;
      }

      // Token valid
      const profile = await getUserProfile();
      scheduleRefresh(tokens.token_expires_at);
      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: profile,
      });
    }

    checkAuth();
  }, [scheduleRefresh]);

  // Cleanup refresh timer on unmount
  useEffect(() => clearRefreshTimer, [clearRefreshTimer]);

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const expectedState = generateState();
      const redirectUri = chrome.identity.getRedirectURL();

      const authUrl = new URL(DONNY_OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", OAUTH_SCOPES);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("state", expectedState);

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      if (!responseUrl) {
        throw new Error("Auth flow was cancelled");
      }

      const params = new URL(responseUrl).searchParams;

      if (params.get("error")) {
        throw new Error(
          params.get("error_description") ?? params.get("error")!
        );
      }

      if (params.get("state") !== expectedState) {
        throw new Error("OAuth state mismatch — possible CSRF attack");
      }

      const code = params.get("code");
      if (!code) {
        throw new Error("No authorization code received");
      }

      // Exchange code for tokens
      const tokenResponse = await exchangeCodeForToken(
        code,
        codeVerifier,
        redirectUri
      );
      await saveTokens(
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );
      scheduleRefresh(Date.now() + tokenResponse.expires_in * 1000);

      // Best-effort: fetch user profile
      let profile: UserProfile | null = null;
      try {
        const profileResponse = await donnyFetch(DONNY_OAUTH_USERINFO_URL);
        if (profileResponse.ok) {
          profile = await profileResponse.json();
          if (profile) await saveUserProfile(profile);
        }
      } catch {
        // Non-fatal — proceed without profile
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: profile,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isAuthenticated: false,
        isLoading: false,
        error: err instanceof Error ? err.message : "Login failed",
      }));
    }
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    clearRefreshTimer();
    await clearTokens();
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      user: null,
    });
  }, [clearRefreshTimer]);

  return {
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    error: state.error,
    user: state.user,
    login,
    logout,
  };
}
```

- [ ] **Step 4: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Clean build, no errors. All three files are consistent — `clearAuth` is gone from storage, api imports the new storage functions, useAuth imports from both.

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/utils/storage.ts src/utils/api.ts src/sidepanel/hooks/useAuth.ts
git commit -m "feat(auth): build auth foundation — storage helpers, API layer with PKCE/donnyFetch, rewritten useAuth hook"
```

---

## Task 3: Update AuthScreen and App.tsx together

**Files:**
- Modify: `src/sidepanel/components/AuthScreen.tsx`
- Modify: `src/sidepanel/App.tsx`

These two files are modified together because `AuthScreen` adds required `isLoading`/`error` props, and `App.tsx` must pass them. Applying separately would break the build.

- [ ] **Step 1: Replace `src/sidepanel/components/AuthScreen.tsx`**

Write this to `src/sidepanel/components/AuthScreen.tsx`:

```tsx
interface AuthScreenProps {
  onLogin: () => void;
  isLoading: boolean;
  error: string | null;
}

export function AuthScreen({ onLogin, isLoading, error }: AuthScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-donny-bg px-6">
      {/* Logo */}
      <div className="w-20 h-20 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-3xl mb-3">
        D
      </div>

      {/* Wordmark */}
      <p className="text-donny-teal text-xs font-bold tracking-[0.2em] uppercase mb-6">
        DRAGONCANDY
      </p>

      {/* Title */}
      <h1 className="text-2xl font-bold text-donny-text mb-2">Donny</h1>

      {/* Subtitle */}
      <p className="text-donny-text/60 text-center text-sm mb-6 max-w-[280px]">
        Sign in with your DragonCandy account to use Donny while you browse
      </p>

      {/* Separator */}
      <div className="w-2 h-2 rounded-full bg-donny-pink mb-8" />

      {/* Login button */}
      <button
        onClick={onLogin}
        disabled={isLoading}
        className="w-full max-w-xs py-3 rounded-full bg-donny-teal text-donny-bg font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {isLoading ? (
          <span className="animate-pulse">Connecting...</span>
        ) : (
          "Connect with DragonCandy"
        )}
      </button>

      {/* Error message */}
      {error && (
        <p className="text-donny-pink text-xs mt-3 text-center max-w-[280px]">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/sidepanel/App.tsx`**

Write this to `src/sidepanel/App.tsx`:

```tsx
import { useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { ChatInterface } from "./components/ChatInterface";
import { PageContext } from "./components/PageContext";
import { QuickActions } from "./components/QuickActions";
import { useAuth } from "./hooks/useAuth";

export function App() {
  const { isAuthenticated, isLoading, error, user, login, logout } = useAuth();
  const [showChat, setShowChat] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();

  // Mount loading — neutral indicator while checking stored tokens
  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-donny-bg">
        <div className="w-16 h-16 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-2xl animate-pulse">
          D
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onLogin={login} isLoading={isLoading} error={error} />;
  }

  return (
    <div className="flex flex-col h-screen bg-donny-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-donny-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-sm">
            D
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-donny-text text-sm leading-tight">
              Donny
            </span>
            {user?.display_name && (
              <span className="text-donny-text/50 text-xs leading-tight">
                {user.display_name}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-donny-text/60 hover:text-donny-text"
        >
          Sign out
        </button>
      </header>

      {/* Page Context */}
      <PageContext />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {showChat ? (
          <ChatInterface initialPrompt={initialPrompt} />
        ) : (
          <QuickActions
            onStartChat={(prompt) => {
              setInitialPrompt(prompt);
              setShowChat(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Clean build, no errors. AuthScreen's new required props are now passed by App.tsx.

- [ ] **Step 4: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/components/AuthScreen.tsx src/sidepanel/App.tsx
git commit -m "feat(auth): update AuthScreen with loading/error states, App.tsx with mount loading and user name"
```

---

## Task 4: Enhance OAuth callback page

**Files:**
- Modify: `src/oauth/callback.html`

- [ ] **Step 1: Replace the full contents of `callback.html`**

This is a standalone HTML file — no Tailwind, no build pipeline. Plain CSS only. It serves as a branded fallback page that may briefly flash during `chrome.identity.launchWebAuthFlow` or load if the OAuth URL is opened manually in a browser.

Write this to `src/oauth/callback.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donny — OAuth Callback</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a1a;
      color: #f0f0f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      text-align: center;
      padding: 2rem;
      max-width: 320px;
    }
    .wordmark {
      color: #4DD9C0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 1.5rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #2a2a3e;
      border-top-color: #4DD9C0;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .message {
      font-size: 14px;
      color: #f0f0f0;
      margin-bottom: 0.5rem;
    }
    .submessage {
      font-size: 12px;
      color: rgba(240, 240, 240, 0.5);
    }
    .error-message {
      font-size: 14px;
      color: #F9A8D4;
      margin-bottom: 0.5rem;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="wordmark">DRAGONCANDY</div>

    <!-- Loading state (default) -->
    <div id="state-loading">
      <div class="spinner"></div>
      <p class="message">Connecting to DragonCandy...</p>
      <p class="submessage">This window will close automatically</p>
    </div>

    <!-- Error state -->
    <div id="state-error" class="hidden">
      <p class="error-message" id="error-text"></p>
      <p class="submessage">This window will close automatically</p>
    </div>

    <!-- Fallback state -->
    <div id="state-fallback" class="hidden">
      <p class="message">You can close this window.</p>
    </div>
  </div>

  <script>
    (function() {
      var params = new URLSearchParams(window.location.search);
      var error = params.get("error");
      var errorDesc = params.get("error_description");

      function showState(id) {
        document.getElementById("state-loading").classList.add("hidden");
        document.getElementById("state-error").classList.add("hidden");
        document.getElementById("state-fallback").classList.add("hidden");
        document.getElementById(id).classList.remove("hidden");
      }

      if (error) {
        document.getElementById("error-text").textContent =
          errorDesc || error;
        showState("state-error");
        setTimeout(function() { window.close(); }, 3000);
      } else {
        showState("state-fallback");
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Clean build. The HTML file is bundled by `@crxjs/vite-plugin` but doesn't go through TypeScript.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/oauth/callback.html
git commit -m "feat(auth): enhance callback page with branding and error states"
```

---

## Task 5: Final verification

- [ ] **Step 1: Clean build from scratch**

```bash
cd C:/GIT/donny-chrome-extension
rm -rf dist
npm run build
```

Expected: Clean build with no errors and no warnings (other than the CRLF warning from vite which is normal on Windows).

- [ ] **Step 2: Verify all 7 files were modified**

Run: `git diff --stat HEAD~5` (5 commits: Task 0 through Task 4)

Expected files changed:
- `manifest.json`
- `src/utils/constants.ts`
- `src/utils/storage.ts`
- `src/utils/api.ts`
- `src/sidepanel/hooks/useAuth.ts`
- `src/sidepanel/components/AuthScreen.tsx`
- `src/sidepanel/App.tsx`
- `src/oauth/callback.html`

- [ ] **Step 3: Verify NO protected files were modified**

Run: `git diff HEAD~5 -- src/background/service-worker.ts src/content/content-script.ts`

Expected: Empty output (no changes to protected files).

- [ ] **Step 4: Verify `useDonnyAPI.ts` still compiles**

This file imports `ChatMessage` from `@/utils/api` — that export still exists in our rewritten `api.ts`. The build passing in Step 1 confirms this, but double-check:

Run: `grep "ChatMessage" src/sidepanel/hooks/useDonnyAPI.ts`
Expected: `import type { ChatMessage } from "@/utils/api";`

Run: `grep "export interface ChatMessage" src/utils/api.ts`
Expected: `export interface ChatMessage {`
