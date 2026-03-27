# Donny Chrome Extension Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a buildable Manifest V3 Chrome Extension at `C:/GIT/donny-chrome-extension/` with a React side panel, Vite build, TypeScript, and Tailwind CSS — ready to load in `chrome://extensions` developer mode.

**Architecture:** Three isolated Chrome contexts (content script, service worker, side panel) communicating via `chrome.runtime` messaging. The side panel is a React 18 app built by Vite with `@crxjs/vite-plugin`. Content script detects platforms with stubbed extractors. Service worker routes messages and opens the side panel.

**Tech Stack:** React 18, TypeScript (strict), Vite 5, `@crxjs/vite-plugin`, Tailwind CSS 3, Chrome Extension Manifest V3

**Spec:** `docs/superpowers/specs/2026-03-26-donny-chrome-extension-design.md`

**IMPORTANT:** This is a SEPARATE project at `C:/GIT/donny-chrome-extension/`. Do NOT modify anything in the main DragonCandy repo (`C:/Users/dwill/Desktop/dragoncandy-v2/`).

---

## File Map

| File | Responsibility |
|------|---------------|
| `manifest.json` | MV3 config — permissions, entry points, icons |
| `package.json` | Dependencies, build/dev scripts |
| `tsconfig.json` | TypeScript strict mode, path aliases |
| `vite.config.ts` | Vite + CRXJS plugin config |
| `tailwind.config.ts` | Tailwind with DragonCandy design tokens |
| `postcss.config.js` | PostCSS for Tailwind processing |
| `src/utils/constants.ts` | API URLs, OAuth config, extension metadata |
| `src/utils/storage.ts` | Chrome storage typed helpers (get/set/remove) |
| `src/utils/api.ts` | Donny API client with auth header injection |
| `src/content/content-script.ts` | Platform detection + stubbed extractors + message listener |
| `src/background/service-worker.ts` | Side panel opener, context menu, message routing |
| `src/sidepanel/index.html` | Side panel HTML entry |
| `src/sidepanel/main.tsx` | React DOM root |
| `src/sidepanel/styles/globals.css` | Tailwind directives + design tokens |
| `src/sidepanel/App.tsx` | Root component with mock auth gate |
| `src/sidepanel/hooks/useAuth.ts` | Auth state management (mock for scaffold) |
| `src/sidepanel/hooks/usePageContext.ts` | Gets current tab context via service worker |
| `src/sidepanel/hooks/useDonnyAPI.ts` | Chat API hook with placeholder responses |
| `src/sidepanel/components/AuthScreen.tsx` | Login UI with OAuth button |
| `src/sidepanel/components/PageContext.tsx` | Platform badge + URL + title display |
| `src/sidepanel/components/QuickActions.tsx` | Pre-built prompt buttons |
| `src/sidepanel/components/ChatInterface.tsx` | Message list + input bar |
| `src/oauth/callback.html` | OAuth redirect handler (reference/fallback) |
| `public/icons/icon{16,32,48,128}.png` | Placeholder extension icons |
| `public/donny-logo.svg` | Placeholder logo |
| `README.md` | Setup and dev instructions |

---

## Task 1: Initialize Project & Install Dependencies

**Files:**
- Create: `C:/GIT/donny-chrome-extension/package.json`

- [ ] **Step 1: Create project directory and initialize git**

```bash
mkdir -p C:/GIT/donny-chrome-extension
cd C:/GIT/donny-chrome-extension
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "donny-chrome-extension",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.30",
    "@types/chrome": "^0.0.287",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.0",
    "vite": "^5.4.14"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
*.local
```

- [ ] **Step 4: Install dependencies**

```bash
cd C:/GIT/donny-chrome-extension
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize project with React, Vite, Tailwind, CRXJS dependencies"
```

---

## Task 2: Build Configuration

**Files:**
- Create: `C:/GIT/donny-chrome-extension/tsconfig.json`
- Create: `C:/GIT/donny-chrome-extension/vite.config.ts`
- Create: `C:/GIT/donny-chrome-extension/tailwind.config.ts`
- Create: `C:/GIT/donny-chrome-extension/postcss.config.js`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

**Note:** `@crxjs/vite-plugin` reads `manifest.json` directly and handles all entry point bundling (side panel as ESM, service worker and content script as IIFE). No manual multi-entry config needed.

**Note:** If `@crxjs/vite-plugin` fails to import the manifest as a JSON module, add `@vitejs/plugin-react` peer dependency check. The `crx()` call takes the manifest object and wires up all build entries automatically.

- [ ] **Step 3: Create tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        donny: {
          bg: "#0a0a1a",
          surface: "#1a1a2e",
          border: "#2a2a3e",
          text: "#f0f0f0",
          teal: "#4DD9C0",
          pink: "#F9A8D4",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add tsconfig.json vite.config.ts tailwind.config.ts postcss.config.js
git commit -m "chore: add TypeScript, Vite, Tailwind, and PostCSS config"
```

---

## Task 3: Manifest & Static Assets

**Files:**
- Create: `C:/GIT/donny-chrome-extension/manifest.json`
- Create: `C:/GIT/donny-chrome-extension/public/icons/icon16.png`
- Create: `C:/GIT/donny-chrome-extension/public/icons/icon32.png`
- Create: `C:/GIT/donny-chrome-extension/public/icons/icon48.png`
- Create: `C:/GIT/donny-chrome-extension/public/icons/icon128.png`
- Create: `C:/GIT/donny-chrome-extension/public/donny-logo.svg`
- Create: `C:/GIT/donny-chrome-extension/src/oauth/callback.html`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Donny AI — DragonCandy Assistant",
  "version": "0.1.0",
  "description": "Your AI-powered content marketing assistant",
  "permissions": ["sidePanel", "activeTab", "storage", "contextMenus", "tabs"],
  "host_permissions": [
    "https://*.dragoncandy.io/*",
    "https://zocahiffooqdybdhguqv.supabase.co/*"
  ],
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.ts"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_icon": {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png"
    },
    "default_title": "Open Donny AI"
  },
  "icons": {
    "16": "public/icons/icon16.png",
    "32": "public/icons/icon32.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  }
}
```

**IMPORTANT:** When using `@crxjs/vite-plugin`, the manifest paths reference **source** locations (`src/...`), not build output paths. The plugin rewrites these to the correct `dist/` paths at build time.

- [ ] **Step 2: Generate placeholder icon PNGs**

Use a Node script or canvas to create minimal teal-colored placeholder PNGs at 16x16, 32x32, 48x48, and 128x128. These are placeholder-only — real brand icons come later.

Approach: Create a tiny Node script that generates single-color PNG files using raw PNG binary format (no dependencies needed). Alternatively, use any available image tool. The icons must be valid PNG files.

- [ ] **Step 3: Create donny-logo.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <circle cx="64" cy="64" r="60" fill="#0a0a1a" stroke="#4DD9C0" stroke-width="4"/>
  <text x="64" y="78" text-anchor="middle" font-size="48" font-weight="bold" fill="#4DD9C0" font-family="sans-serif">D</text>
</svg>
```

- [ ] **Step 4: Create src/oauth/callback.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Donny AI — OAuth Callback</title>
</head>
<body>
  <p>Authenticating... You can close this window.</p>
  <script>
    // This page is a fallback reference.
    // Primary auth uses chrome.identity.launchWebAuthFlow which
    // redirects to https://<id>.chromiumapp.org/ automatically.
    // If this page loads, extract the code and relay it:
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (code) {
      chrome.runtime.sendMessage({ type: "OAUTH_CALLBACK", code });
    } else if (error) {
      chrome.runtime.sendMessage({ type: "OAUTH_ERROR", error });
    }
    window.close();
  </script>
</body>
</html>
```

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add manifest.json public/ src/oauth/
git commit -m "feat: add MV3 manifest, placeholder icons, OAuth callback"
```

---

## Task 4: Utility Layer

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/utils/constants.ts`
- Create: `C:/GIT/donny-chrome-extension/src/utils/storage.ts`
- Create: `C:/GIT/donny-chrome-extension/src/utils/api.ts`

- [ ] **Step 1: Create constants.ts**

```typescript
export const SUPABASE_URL = "https://zocahiffooqdybdhguqv.supabase.co";
export const DONNY_API_BASE = `${SUPABASE_URL}/functions/v1`;
export const DONNY_CHAT_URL = `${DONNY_API_BASE}/donny-chat`;
export const DONNY_OAUTH_AUTHORIZE_URL = `${DONNY_API_BASE}/donny-oauth-authorize`;
export const DONNY_OAUTH_TOKEN_URL = `${DONNY_API_BASE}/donny-oauth-token`;

export const OAUTH_CLIENT_ID = "donny-chrome-ext-v1";
export const OAUTH_SCOPES = "donny:chat campaigns:read campaigns:write creators:read analytics:read messages:read messages:write profile:read";

export const SURFACE = "chrome_extension" as const;
```

- [ ] **Step 2: Create storage.ts**

```typescript
interface StorageData {
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
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

export async function clearAuth(): Promise<void> {
  await chrome.storage.local.remove([
    "access_token",
    "refresh_token",
    "token_expires_at",
  ]);
}
```

- [ ] **Step 3: Create api.ts**

```typescript
import { DONNY_CHAT_URL, SURFACE } from "./constants";
import { getStorageItem } from "./storage";

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

export async function sendChatMessage(
  request: ChatRequest
): Promise<ChatResponse> {
  const token = await getStorageItem("access_token");

  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(DONNY_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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

- [ ] **Step 4: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/utils/
git commit -m "feat: add utility layer — constants, typed storage, API client"
```

---

## Task 5: Content Script

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/content/content-script.ts`

- [ ] **Step 1: Create content-script.ts**

```typescript
type Platform = "instagram" | "tiktok" | "youtube" | "generic";

interface PageContext {
  platform: Platform;
  url: string;
  title: string;
  metadata?: Record<string, string>;
}

function detectPlatform(url: string): Platform {
  const hostname = new URL(url).hostname;
  if (hostname.includes("instagram.com")) return "instagram";
  if (hostname.includes("tiktok.com")) return "tiktok";
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be"))
    return "youtube";
  return "generic";
}

const extractors: Record<Platform, () => PageContext> = {
  instagram: () => ({
    platform: "instagram",
    url: window.location.href,
    title: document.title,
    // TODO: Extract profile name, follower count, post data from DOM
  }),
  tiktok: () => ({
    platform: "tiktok",
    url: window.location.href,
    title: document.title,
    // TODO: Extract video title, creator info, engagement from DOM
  }),
  youtube: () => ({
    platform: "youtube",
    url: window.location.href,
    title: document.title,
    // TODO: Extract channel name, subscriber count, video info from DOM
  }),
  generic: () => ({
    platform: "generic",
    url: window.location.href,
    title: document.title,
  }),
};

function getPageContext(): PageContext {
  const platform = detectPlatform(window.location.href);
  return extractors[platform]();
}

// Listen for context requests from service worker
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }
  return true; // Keep channel open for async response
});
```

- [ ] **Step 2: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/content/
git commit -m "feat: add content script with platform detection and stubbed extractors"
```

---

## Task 6: Service Worker

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/background/service-worker.ts`

- [ ] **Step 1: Create service-worker.ts**

```typescript
// Open side panel when extension action button is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Register context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ask-donny",
    title: "Ask Donny about this page",
    contexts: ["page"],
  });
});

// Handle context menu click — open side panel
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ask-donny" && tab?.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Route messages between content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PAGE_CONTEXT") {
    // Side panel is requesting context — forward to content script in active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(
          tabId,
          { type: "GET_PAGE_CONTEXT" },
          (response) => {
            sendResponse(response ?? null);
          }
        );
      } else {
        sendResponse(null);
      }
    });
    return true; // Keep channel open for async response
  }
});
```

- [ ] **Step 2: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/background/
git commit -m "feat: add service worker — side panel opener, context menu, message routing"
```

---

## Task 7: Side Panel Shell

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/index.html`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/main.tsx`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/styles/globals.css`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/App.tsx`

- [ ] **Step 1: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Donny AI</title>
</head>
<body class="bg-donny-bg text-donny-text">
  <div id="root"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
```

- [ ] **Step 3: Create main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Create App.tsx**

```tsx
import { useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { ChatInterface } from "./components/ChatInterface";
import { PageContext } from "./components/PageContext";
import { QuickActions } from "./components/QuickActions";
import { useAuth } from "./hooks/useAuth";

export function App() {
  const { isAuthenticated, isLoading, login, logout } = useAuth();
  const [showChat, setShowChat] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-donny-bg">
        <div className="text-donny-teal text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onLogin={login} />;
  }

  return (
    <div className="flex flex-col h-screen bg-donny-bg">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-donny-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-sm">
            D
          </div>
          <span className="font-bold text-donny-text">Donny AI</span>
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
          <QuickActions onStartChat={(prompt) => { setInitialPrompt(prompt); setShowChat(true); }} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/index.html src/sidepanel/main.tsx src/sidepanel/styles/ src/sidepanel/App.tsx
git commit -m "feat: add side panel shell — HTML entry, React root, App with auth gate"
```

---

## Task 8: React Hooks

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/hooks/useAuth.ts`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/hooks/usePageContext.ts`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/hooks/useDonnyAPI.ts`

- [ ] **Step 1: Create useAuth.ts**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getStorageItem, setStorageItem, clearAuth } from "@/utils/storage";
import {
  DONNY_OAUTH_AUTHORIZE_URL,
  DONNY_OAUTH_TOKEN_URL,
  OAUTH_CLIENT_ID,
  OAUTH_SCOPES,
} from "@/utils/constants";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Check for existing token on mount
  useEffect(() => {
    async function checkAuth() {
      const token = await getStorageItem("access_token");
      const expiresAt = await getStorageItem("token_expires_at");
      const isValid = token && expiresAt && Date.now() < expiresAt;
      setState({ isAuthenticated: !!isValid, isLoading: false, error: null });
    }
    checkAuth();
  }, []);

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const redirectUrl = chrome.identity.getRedirectURL();

      const authUrl = new URL(DONNY_OAUTH_AUTHORIZE_URL);
      authUrl.searchParams.set("client_id", OAUTH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUrl);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", OAUTH_SCOPES);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true,
      });

      if (!responseUrl) {
        throw new Error("Auth flow was cancelled");
      }

      const code = new URL(responseUrl).searchParams.get("code");
      if (!code) {
        throw new Error("No authorization code received");
      }

      // Exchange code for tokens
      const tokenResponse = await fetch(DONNY_OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: OAUTH_CLIENT_ID,
          code,
          redirect_uri: redirectUrl,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error("Token exchange failed");
      }

      const tokens = await tokenResponse.json();
      await setStorageItem("access_token", tokens.access_token);
      await setStorageItem("refresh_token", tokens.refresh_token);
      await setStorageItem(
        "token_expires_at",
        Date.now() + tokens.expires_in * 1000
      );

      setState({ isAuthenticated: true, isLoading: false, error: null });
    } catch (err) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: err instanceof Error ? err.message : "Login failed",
      });
    }
  }, []);

  const logout = useCallback(async () => {
    await clearAuth();
    setState({ isAuthenticated: false, isLoading: false, error: null });
  }, []);

  return { ...state, login, logout };
}
```

- [ ] **Step 2: Create usePageContext.ts**

```typescript
import { useCallback, useEffect, useState } from "react";

interface PageContext {
  platform: "instagram" | "tiktok" | "youtube" | "generic";
  url: string;
  title: string;
  metadata?: Record<string, string>;
}

export function usePageContext() {
  const [context, setContext] = useState<PageContext | null>(null);

  const refresh = useCallback(() => {
    chrome.runtime.sendMessage(
      { type: "REQUEST_PAGE_CONTEXT" },
      (response: PageContext | null) => {
        setContext(response);
      }
    );
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refresh when the active tab changes
  useEffect(() => {
    const onActivated = () => refresh();
    const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === "complete") refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  return { context, refresh };
}
```

- [ ] **Step 3: Create useDonnyAPI.ts**

```typescript
import { useCallback, useState } from "react";
import type { ChatMessage } from "@/utils/api";

interface UseDonnyAPIReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
}

export function useDonnyAPI(): UseDonnyAPIReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback((content: string) => {
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);

    // Placeholder response — replace with real API call when ready
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I'm Donny, your DragonCandy AI assistant! I received your message: "${content}". Live API integration coming soon.`,
        },
      ]);
      setIsLoading(false);
    }, 800);
  }, []);

  return { messages, isLoading, error, sendMessage };
}
```

- [ ] **Step 4: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/hooks/
git commit -m "feat: add React hooks — useAuth (PKCE), usePageContext, useDonnyAPI (placeholder)"
```

---

## Task 9: Side Panel Components

**Files:**
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/components/AuthScreen.tsx`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/components/PageContext.tsx`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/components/QuickActions.tsx`
- Create: `C:/GIT/donny-chrome-extension/src/sidepanel/components/ChatInterface.tsx`

- [ ] **Step 1: Create AuthScreen.tsx**

```tsx
interface AuthScreenProps {
  onLogin: () => void;
}

export function AuthScreen({ onLogin }: AuthScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-donny-bg px-6">
      <div className="w-16 h-16 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-2xl mb-4">
        D
      </div>
      <h1 className="text-2xl font-bold text-donny-text mb-2">Donny AI</h1>
      <p className="text-donny-text/60 text-center text-sm mb-8">
        Your AI-powered content marketing assistant by DragonCandy
      </p>
      <button
        onClick={onLogin}
        className="w-full max-w-xs py-3 rounded-full bg-donny-teal text-donny-bg font-bold text-sm hover:opacity-90 transition-opacity"
      >
        Sign in with DragonCandy
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create PageContext.tsx**

```tsx
import { usePageContext } from "../hooks/usePageContext";

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500",
  tiktok: "bg-gray-800",
  youtube: "bg-red-600",
  generic: "bg-donny-border",
};

const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  generic: "Web",
};

export function PageContext() {
  const { context } = usePageContext();

  if (!context) {
    return (
      <div className="px-4 py-2 border-b border-donny-border">
        <p className="text-xs text-donny-text/40">No page context available</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 border-b border-donny-border flex items-center gap-2">
      <span
        className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${platformColors[context.platform]}`}
      >
        {platformLabels[context.platform]}
      </span>
      <span className="text-xs text-donny-text/60 truncate flex-1">
        {context.title || context.url}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create QuickActions.tsx**

```tsx
interface QuickActionsProps {
  onStartChat: (initialPrompt?: string) => void;
}

const actions = [
  {
    label: "Generate a campaign",
    prompt: "Help me create a new campaign for this page",
    icon: "🎯",
  },
  {
    label: "Find matching creators",
    prompt: "Find creators that would be a good fit for my brand",
    icon: "🔍",
  },
  {
    label: "Analyze this page",
    prompt: "Analyze the content on this page and give me insights",
    icon: "📊",
  },
];

export function QuickActions({ onStartChat }: QuickActionsProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 gap-4">
      <p className="text-donny-text/60 text-sm mb-2">
        What can I help you with?
      </p>
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => onStartChat(action.prompt)}
          className="w-full p-4 rounded-xl bg-donny-surface border border-donny-border text-left hover:border-donny-teal transition-colors"
        >
          <span className="text-lg mr-2">{action.icon}</span>
          <span className="text-sm font-medium text-donny-text">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create ChatInterface.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { useDonnyAPI } from "../hooks/useDonnyAPI";

interface ChatInterfaceProps {
  initialPrompt?: string;
}

export function ChatInterface({ initialPrompt }: ChatInterfaceProps) {
  const { messages, isLoading, sendMessage } = useDonnyAPI();
  const [input, setInput] = useState("");
  const sentInitial = useRef(false);

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      sendMessage(initialPrompt);
    }
  }, [initialPrompt, sendMessage]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage(trimmed);
    setInput("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-donny-text/40 text-sm mt-8">
            Send a message to start chatting with Donny
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                msg.role === "user"
                  ? "bg-donny-teal text-donny-bg"
                  : "bg-donny-pink text-donny-bg"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-donny-surface border border-donny-border px-4 py-2 rounded-2xl text-sm text-donny-text/60">
              Donny is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 border-t border-donny-border flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Donny anything..."
          className="flex-1 bg-donny-surface border border-donny-border rounded-full px-4 py-2 text-sm text-donny-text placeholder-donny-text/40 focus:outline-none focus:border-donny-teal"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-10 h-10 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/components/
git commit -m "feat: add side panel components — AuthScreen, PageContext, QuickActions, ChatInterface"
```

---

## Task 10: Build Verification

**Files:**
- None created — this task verifies the build works

- [ ] **Step 1: Run TypeScript check**

```bash
cd C:/GIT/donny-chrome-extension
npx tsc --noEmit
```

Expected: No errors. If path alias `@/*` errors, ensure `tsconfig.json` `paths` is correct and Vite `resolve.alias` matches.

- [ ] **Step 2: Run Vite build**

```bash
cd C:/GIT/donny-chrome-extension
npm run build
```

Expected: Build completes. `dist/` folder created with:
- `dist/manifest.json` — rewritten with correct paths
- `dist/sidepanel/index.html` + JS/CSS bundles
- `dist/background/service-worker.js` (or root-level, depending on CRXJS output)
- `dist/content/content-script.js` (or `dist/assets/`)
- `dist/icons/` — placeholder PNGs

- [ ] **Step 3: Verify dist/ contents**

```bash
cd C:/GIT/donny-chrome-extension
ls -R dist/
cat dist/manifest.json
```

Expected: `manifest.json` exists with valid JSON, all entry points referenced in the manifest exist as files in `dist/`.

- [ ] **Step 4: Fix any build issues**

If `@crxjs/vite-plugin` fails (e.g., version incompatibility), fall back to a manual Vite config:
- Use `build.rollupOptions.input` for the side panel
- Use separate `vite.config.content.ts` and `vite.config.background.ts` with IIFE output
- Chain builds in `package.json`: `"build": "vite build && vite build -c vite.config.content.ts && vite build -c vite.config.background.ts"`
- Copy `manifest.json` with a postbuild script

This fallback is only needed if CRXJS fails. Try CRXJS first.

- [ ] **Step 5: Commit verified build config**

```bash
cd C:/GIT/donny-chrome-extension
git add -A
git commit -m "chore: verify clean build — dist/ produces loadable Chrome extension"
```

---

## Task 11: README

**Files:**
- Create: `C:/GIT/donny-chrome-extension/README.md`

- [ ] **Step 1: Create README.md**

```markdown
# Donny AI — Chrome Extension

Chrome Extension (Manifest V3) for DragonCandy's Donny AI assistant. Chat with Donny while browsing Instagram, TikTok, YouTube, and any website.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Load in Chrome

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist/` folder

## Project Structure

- `src/background/` — Service worker (message routing, side panel, context menu)
- `src/content/` — Content script (platform detection, page context extraction)
- `src/sidepanel/` — React app (chat UI, auth, quick actions)
- `src/utils/` — API client, storage helpers, constants
- `src/oauth/` — OAuth callback handler
```

- [ ] **Step 2: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add README.md
git commit -m "docs: add README with setup and loading instructions"
```

---

## Summary

| Task | What it produces | Depends on |
|------|-----------------|------------|
| 1. Initialize Project | `package.json`, `node_modules/` | Nothing |
| 2. Build Configuration | `tsconfig.json`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js` | Task 1 |
| 3. Manifest & Assets | `manifest.json`, icons, logo, OAuth callback | Task 1 |
| 4. Utility Layer | `constants.ts`, `storage.ts`, `api.ts` | Task 1 |
| 5. Content Script | `content-script.ts` | Task 1 |
| 6. Service Worker | `service-worker.ts` | Task 1 |
| 7. Side Panel Shell | `index.html`, `main.tsx`, `globals.css`, `App.tsx` | Task 2, 3 |
| 8. React Hooks | `useAuth.ts`, `usePageContext.ts`, `useDonnyAPI.ts` | Task 4 |
| 9. Side Panel Components | `AuthScreen`, `PageContext`, `QuickActions`, `ChatInterface` | Task 8 |
| 10. Build Verification | Validated `dist/` output | All above |
| 11. README | `README.md` | Task 10 |

**Parallelizable:** Tasks 3, 4, 5, 6 can run in parallel after Task 1+2 complete. Tasks 7, 8 can run in parallel. Task 9 depends on Task 8. Task 10 depends on all.
