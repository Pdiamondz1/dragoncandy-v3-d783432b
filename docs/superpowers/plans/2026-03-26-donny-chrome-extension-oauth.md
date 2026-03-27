# Donny Chrome Extension OAuth PKCE Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the OAuth 2.0 PKCE authentication flow in the Donny Chrome Extension so users can authenticate with their DragonCandy account, with token refresh, authenticated API calls, and polished UI.

**Architecture:** Centralized Auth Module — PKCE crypto helpers and token exchange/refresh live in `api.ts`, typed persistence in `storage.ts`, React state management in `useAuth.ts` hook. `donnyFetch` wrapper handles Bearer token injection and automatic 401 retry with token refresh.

**Tech Stack:** TypeScript (strict), React 18, Chrome Extension APIs (`chrome.identity`, `chrome.storage`, `chrome.runtime`), Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`)

**Spec:** `docs/superpowers/specs/2026-03-26-donny-chrome-extension-oauth-design.md`

**IMPORTANT:** All file paths are relative to `C:/GIT/donny-chrome-extension/`. Do NOT modify files in the main DragonCandy repo. Do NOT modify `manifest.json`, `src/content/content-script.ts`, or `src/background/service-worker.ts`.

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `src/utils/constants.ts` | API URLs, OAuth config | Modify — add userinfo URL |
| `src/utils/storage.ts` | Chrome storage typed helpers | Modify — add UserProfile type, convenience methods |
| `src/utils/api.ts` | PKCE, token exchange/refresh, donnyFetch | Modify — major expansion |
| `src/sidepanel/hooks/useAuth.ts` | React auth state, login/logout, auto-refresh | Modify — rewrite to use api.ts/storage.ts |
| `src/sidepanel/components/AuthScreen.tsx` | Login UI with branding | Modify — add loading/error states, enhanced design |
| `src/oauth/callback.html` | OAuth redirect handler | Modify — add spinner, branding, error handling |
| `src/sidepanel/App.tsx` | Root component | Modify — pass new props to AuthScreen |

---

## Task 1: Add Userinfo URL to Constants

**Files:**
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: Add the DONNY_OAUTH_USERINFO_URL constant**

Add this line after the existing `DONNY_OAUTH_TOKEN_URL`:

```typescript
export const DONNY_OAUTH_USERINFO_URL = `${DONNY_API_BASE}/donny-oauth-userinfo`;
```

The full file should read:

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

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/constants.ts
git commit -m "feat: add DONNY_OAUTH_USERINFO_URL constant"
```

---

## Task 2: Expand Storage with Convenience Methods and UserProfile

**Files:**
- Modify: `src/utils/storage.ts`

- [ ] **Step 1: Replace the full contents of storage.ts**

```typescript
export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
}

interface StorageData {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  user_profile: UserProfile;
}

type StorageKey = keyof StorageData;

// ---------------------------------------------------------------------------
// Low-level helpers (used internally and by other modules)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Token convenience methods
// ---------------------------------------------------------------------------

export async function saveTokens(
  access_token: string,
  refresh_token: string,
  expires_in: number
): Promise<void> {
  await chrome.storage.local.set({
    access_token,
    refresh_token,
    token_expires_at: Date.now() + expires_in * 1000,
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

// ---------------------------------------------------------------------------
// User profile convenience methods
// ---------------------------------------------------------------------------

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await chrome.storage.local.set({ user_profile: profile });
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const result = await chrome.storage.local.get("user_profile");
  return (result.user_profile as UserProfile) ?? null;
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. The old `clearAuth` function is removed — if anything imports it, the build will fail (we fix that in Task 4 when we rewrite `useAuth.ts`). Check output for errors referencing `clearAuth`. If there's an error, that's expected and will be resolved in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.ts
git commit -m "feat: add token and user profile convenience methods to storage"
```

---

## Task 3: Expand API Module with PKCE, Token Ops, and donnyFetch

**Files:**
- Modify: `src/utils/api.ts`

- [ ] **Step 1: Replace the full contents of api.ts**

```typescript
import {
  DONNY_API_BASE,
  DONNY_CHAT_URL,
  DONNY_OAUTH_TOKEN_URL,
  OAUTH_CLIENT_ID,
  SURFACE,
} from "./constants";
import { getTokens, saveTokens, clearTokens } from "./storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generateCodeChallenge(
  verifier: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Token exchange and refresh
// ---------------------------------------------------------------------------

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
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error_description || `Token exchange failed: ${response.status}`
    );
  }

  return response.json();
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenResponse> {
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

// ---------------------------------------------------------------------------
// Authenticated fetch wrapper
// ---------------------------------------------------------------------------

export async function donnyFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const tokens = await getTokens();
  if (!tokens) {
    throw new AuthExpiredError();
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${DONNY_API_BASE}/${endpoint}`;

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${tokens.access_token}`);
  headers.set("Content-Type", "application/json");

  let response = await fetch(url, { ...options, headers });

  // Retry once on 401 with refreshed token
  if (response.status === 401 && tokens.refresh_token) {
    try {
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      await saveTokens(
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expires_in
      );

      headers.set("Authorization", `Bearer ${newTokens.access_token}`);
      response = await fetch(url, { ...options, headers });
    } catch {
      throw new AuthExpiredError();
    }
  }

  if (response.status === 401) {
    await clearTokens();
    throw new AuthExpiredError();
  }

  return response;
}

// ---------------------------------------------------------------------------
// Chat API
// ---------------------------------------------------------------------------

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

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: May fail due to `useAuth.ts` still importing `clearAuth` from storage (removed in Task 2). This is expected and fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/utils/api.ts
git commit -m "feat: add PKCE helpers, token exchange/refresh, and donnyFetch wrapper"
```

---

## Task 4: Rewrite useAuth Hook

**Files:**
- Modify: `src/sidepanel/hooks/useAuth.ts`

- [ ] **Step 1: Replace the full contents of useAuth.ts**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import {
  saveTokens,
  getTokens,
  clearTokens,
  saveUserProfile,
  getUserProfile,
} from "@/utils/storage";
import type { UserProfile } from "@/utils/storage";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCodeForToken,
  refreshAccessToken,
  donnyFetch,
  AuthExpiredError,
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

  // Schedule a token refresh 5 minutes before expiry
  const scheduleRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const fiveMinutes = 5 * 60 * 1000;
    const msUntilRefresh = Math.max(expiresAt - Date.now() - fiveMinutes, 0);

    refreshTimerRef.current = setTimeout(async () => {
      try {
        const tokens = await getTokens();
        if (!tokens?.refresh_token) return;

        const newTokens = await refreshAccessToken(tokens.refresh_token);
        await saveTokens(
          newTokens.access_token,
          newTokens.refresh_token,
          newTokens.expires_in
        );

        const newExpiresAt = Date.now() + newTokens.expires_in * 1000;
        scheduleRefresh(newExpiresAt);
      } catch {
        setState({
          isAuthenticated: false,
          isLoading: false,
          error: null,
          user: null,
        });
      }
    }, msUntilRefresh);
  }, []);

  // Check for existing tokens on mount
  useEffect(() => {
    async function checkAuth() {
      try {
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

        // If token is expired, try to refresh
        if (Date.now() >= tokens.token_expires_at) {
          if (tokens.refresh_token) {
            try {
              const newTokens = await refreshAccessToken(tokens.refresh_token);
              await saveTokens(
                newTokens.access_token,
                newTokens.refresh_token,
                newTokens.expires_in
              );

              const expiresAt = Date.now() + newTokens.expires_in * 1000;
              scheduleRefresh(expiresAt);
            } catch {
              setState({
                isAuthenticated: false,
                isLoading: false,
                error: null,
                user: null,
              });
              return;
            }
          } else {
            await clearTokens();
            setState({
              isAuthenticated: false,
              isLoading: false,
              error: null,
              user: null,
            });
            return;
          }
        } else {
          scheduleRefresh(tokens.token_expires_at);
        }

        // Load cached user profile
        const profile = await getUserProfile();
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
    }

    checkAuth();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [scheduleRefresh]);

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const oauthState = generateState();
      const redirectUrl = chrome.identity.getRedirectURL();

      const authUrl = new URL(DONNY_OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUrl);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", OAUTH_SCOPES);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("state", oauthState);

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      if (!responseUrl) {
        throw new Error("Auth flow was cancelled");
      }

      const params = new URL(responseUrl).searchParams;

      // Check for error response
      const error = params.get("error");
      if (error) {
        const description = params.get("error_description") || error;
        throw new Error(description);
      }

      // Verify state matches
      const returnedState = params.get("state");
      if (returnedState !== oauthState) {
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
        redirectUrl
      );
      await saveTokens(
        tokenResponse.access_token,
        tokenResponse.refresh_token,
        tokenResponse.expires_in
      );

      const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
      scheduleRefresh(expiresAt);

      // Fetch user profile
      let profile: UserProfile | null = null;
      try {
        const profileResponse = await donnyFetch(DONNY_OAUTH_USERINFO_URL);
        if (profileResponse.ok) {
          profile = await profileResponse.json();
          if (profile) {
            await saveUserProfile(profile);
          }
        }
      } catch {
        // Profile fetch is best-effort — auth still succeeds without it
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        error: null,
        user: profile,
      });
    } catch (err) {
      const message =
        err instanceof AuthExpiredError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Login failed";

      setState({
        isAuthenticated: false,
        isLoading: false,
        error: message,
        user: null,
      });
    }
  }, [scheduleRefresh]);

  const logout = useCallback(async () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    await clearTokens();
    setState({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      user: null,
    });
  }, []);

  return { ...state, login, logout };
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors. All imports now reference the new `api.ts` and `storage.ts` functions. The old `clearAuth` import is gone.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/hooks/useAuth.ts
git commit -m "feat: rewrite useAuth with state param, auto-refresh, and user profile"
```

---

## Task 5: Enhance AuthScreen with Loading/Error States and Branding

**Files:**
- Modify: `src/sidepanel/components/AuthScreen.tsx`

- [ ] **Step 1: Replace the full contents of AuthScreen.tsx**

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
        DragonCandy
      </p>

      {/* Title */}
      <h1 className="text-2xl font-bold text-donny-text mb-2">Donny AI</h1>

      {/* Subtitle */}
      <p className="text-donny-text/60 text-center text-sm mb-8 max-w-[280px]">
        Sign in with your DragonCandy account to use Donny AI while you browse
      </p>

      {/* Separator */}
      <div className="w-2 h-2 rounded-full bg-donny-pink mb-8" />

      {/* Login Button */}
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

      {/* Error Message */}
      {error && (
        <p className="mt-4 text-donny-pink text-xs text-center max-w-[280px]">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build may fail because `App.tsx` still passes only `onLogin` to `AuthScreen`. This is fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/AuthScreen.tsx
git commit -m "feat: enhance AuthScreen with loading state, error display, and branding"
```

---

## Task 6: Enhance OAuth Callback Page

**Files:**
- Modify: `src/oauth/callback.html`

- [ ] **Step 1: Replace the full contents of callback.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Donny AI — Connecting</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a1a;
      color: #f0f0f0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      text-align: center;
      max-width: 320px;
      width: 100%;
    }
    .wordmark {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #4DD9C0;
      margin-bottom: 32px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #2a2a3e;
      border-top-color: #4DD9C0;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 12px;
      color: rgba(240, 240, 240, 0.5);
    }
    .error {
      color: #F9A8D4;
    }
    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="wordmark">DragonCandy</div>

    <div id="loading">
      <div class="spinner"></div>
      <p class="status">Connecting to DragonCandy...</p>
      <p class="subtitle">This window will close automatically</p>
    </div>

    <div id="success" class="hidden">
      <p class="status">Connected!</p>
      <p class="subtitle">This window will close automatically</p>
    </div>

    <div id="error" class="hidden">
      <p class="status error" id="error-message">Something went wrong</p>
      <p class="subtitle">This window will close in a few seconds</p>
    </div>

    <div id="fallback" class="hidden">
      <p class="status">You can close this window</p>
    </div>
  </div>

  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var code = params.get("code");
      var state = params.get("state");
      var error = params.get("error");
      var errorDescription = params.get("error_description");

      function showSection(id) {
        document.getElementById("loading").classList.add("hidden");
        document.getElementById(id).classList.remove("hidden");
      }

      if (error) {
        document.getElementById("error-message").textContent =
          errorDescription || error;
        showSection("error");
        try {
          chrome.runtime.sendMessage({
            type: "OAUTH_ERROR",
            error: error,
            error_description: errorDescription,
          });
        } catch (e) {
          // Extension context unavailable
        }
        setTimeout(function () { window.close(); }, 3000);
        return;
      }

      if (code) {
        try {
          chrome.runtime.sendMessage(
            { type: "OAUTH_CALLBACK", code: code, state: state },
            function () {
              if (chrome.runtime.lastError) {
                showSection("fallback");
                return;
              }
              showSection("success");
              setTimeout(function () { window.close(); }, 1000);
            }
          );
        } catch (e) {
          showSection("fallback");
        }
        return;
      }

      // No code or error — unexpected state
      showSection("fallback");
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds. HTML files are copied as static assets.

- [ ] **Step 3: Commit**

```bash
git add src/oauth/callback.html
git commit -m "feat: enhance OAuth callback page with branding, spinner, and error handling"
```

---

## Task 7: Wire Up App.tsx with New AuthScreen Props

**Files:**
- Modify: `src/sidepanel/App.tsx`

- [ ] **Step 1: Replace the full contents of App.tsx**

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
            <span className="font-bold text-donny-text text-sm">Donny AI</span>
            {user?.display_name && (
              <span className="text-donny-text/50 text-xs">
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

Key changes from the existing `App.tsx`:
- Destructure `error` and `user` from `useAuth()`
- Pass `isLoading` and `error` to `AuthScreen`
- Remove separate loading screen — `AuthScreen` handles its own loading state (shown during OAuth flow). Initial mount loading (checking stored tokens) shows `AuthScreen` with `isLoading=true`.
- Display `user.display_name` in header when available

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors. All imports resolve, all props match.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: wire up AuthScreen with loading/error props and display user name"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Clean build**

```bash
rm -rf dist && npm run build
```

Expected: Build succeeds. Check `dist/` output includes all entry points:
- `dist/manifest.json`
- `dist/src/sidepanel/index.html` (or similar path depending on CRXJS output)
- Service worker JS
- Content script JS
- CSS with Tailwind classes

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Spot-check the built files**

Verify that `dist/manifest.json` exists and contains the expected permissions and entry points. Verify that the built JS files are present and non-empty.

- [ ] **Step 4: Commit any remaining changes**

If there are any uncommitted files:

```bash
git add -A
git commit -m "chore: final build verification for OAuth PKCE flow"
```
