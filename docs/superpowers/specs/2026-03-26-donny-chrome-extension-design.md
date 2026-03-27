# Donny AI Chrome Extension — Scaffold Design

**Date:** 2026-03-26
**Status:** Approved
**Depends on:** Donny OAuth flow (donny-oauth-authorize, donny-oauth-token), donny-chat Edge Function, migration `20260326_donny_oauth_codes.sql` (makes `client_secret_hash` nullable for public PKCE clients)

## Summary

Scaffold a Manifest V3 Chrome Extension as a separate project (`C:/GIT/donny-chrome-extension/`) that serves as the first external surface for DragonCandy's Donny Super Agent. The extension provides a React-based side panel for chatting with Donny while browsing Instagram, TikTok, YouTube, and any website. This scaffold establishes the build pipeline and component architecture — no live API integration.

## Architecture

Three isolated Chrome extension contexts communicating via `chrome.runtime` messaging:

```
┌─────────────────┐     chrome.runtime     ┌──────────────────┐
│  Content Script  │ ◄──────────────────► │  Service Worker  │
│  (per tab)       │     .sendMessage      │  (background)    │
└─────────────────┘                        └────────┬─────────┘
                                                    │ chrome.runtime
                                           ┌────────▼─────────┐
                                           │    Side Panel     │
                                           │  (React + Vite)   │
                                           └──────────────────┘
```

- **Content script** — injected into every page. Detects platform, runs stubbed extractor, sends page context to service worker on request.
- **Service worker** — routes messages between content script and side panel. Opens side panel on action button click. Registers context menu ("Ask Donny about this page").
- **Side panel** — React 18 app with Tailwind CSS. Houses the chat UI, auth screen, quick actions, and page context display.

## Project Structure

```
donny-chrome-extension/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   └── content-script.ts
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── AuthScreen.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   └── PageContext.tsx
│   │   ├── hooks/
│   │   │   ├── useDonnyAPI.ts
│   │   │   ├── useAuth.ts
│   │   │   └── usePageContext.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── oauth/
│   │   └── callback.html
│   └── utils/
│       ├── api.ts
│       ├── storage.ts
│       └── constants.ts
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── donny-logo.svg
└── README.md
```

## 1. Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Donny AI — DragonCandy Assistant",
  "version": "0.1.0",
  "description": "Your AI-powered content marketing assistant",
  "permissions": ["sidePanel", "activeTab", "storage", "contextMenus", "tabs"],
  "host_permissions": ["https://*.dragoncandy.io/*", "https://zocahiffooqdybdhguqv.supabase.co/*"],
  "side_panel": { "default_path": "sidepanel/index.html" },
  "background": { "service_worker": "background/service-worker.js" },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content/content-script.js"], "run_at": "document_idle" }],
  "action": {
    "default_icon": { "16": "icons/icon16.png", "32": "icons/icon32.png", "48": "icons/icon48.png", "128": "icons/icon128.png" },
    "default_title": "Open Donny AI"
  },
  "icons": { "16": "icons/icon16.png", "32": "icons/icon32.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

## 2. Auth Flow (OAuth PKCE)

Uses the existing DragonCandy OAuth infrastructure:

1. User clicks "Sign in" in side panel
2. Extension calls `chrome.identity.launchWebAuthFlow` with `interactive: true` targeting `donny-oauth-authorize` with PKCE (`code_challenge_method=S256`)
3. Redirect URL uses `chrome.identity.getRedirectURL()` which returns `https://<extension-id>.chromiumapp.org/`
4. User authenticates via DragonCandy login page
5. OAuth server redirects back to the `chromiumapp.org` URL with authorization code
6. `launchWebAuthFlow` resolves with the full redirect URL containing the code
7. Extension exchanges code for tokens via `donny-oauth-token`
8. Tokens stored in `chrome.storage.local` (encrypted at rest by Chrome)
9. `useAuth` hook manages token refresh via `donny-oauth-token` with `grant_type=refresh_token`

**OAuth client:** `donny-chrome-ext-v1` (already registered in seed script)

**Note:** The registered `redirect_uris` in the seed script must be updated to use the `https://<extension-id>.chromiumapp.org/` pattern instead of `chrome-extension://` protocol when the real extension ID is known. The `oauth/callback.html` file is kept as a fallback reference but is not used by `launchWebAuthFlow`.

## 3. API Client

Single `api.ts` module:
- Base URL: `https://zocahiffooqdybdhguqv.supabase.co/functions/v1/`
- Endpoint: `donny-chat` for all chat interactions
- Attaches OAuth Bearer token from `chrome.storage.local`
- Sends `surface: "chrome_extension"` and page context metadata with each request
- Scaffold returns placeholder responses (no live API calls)

## 4. Content Script — Platform Detection (Option B)

```typescript
type Platform = 'instagram' | 'tiktok' | 'youtube' | 'generic';

interface PageContext {
  platform: Platform;
  url: string;
  title: string;
  metadata?: Record<string, string>;
}

function detectPlatform(url: string): Platform { /* hostname matching */ }

const extractors: Record<Platform, () => PageContext> = {
  instagram: () => { /* stub — returns { platform, url, title } */ },
  tiktok:    () => { /* stub — returns { platform, url, title } */ },
  youtube:   () => { /* stub — returns { platform, url, title } */ },
  generic:   () => { /* returns { platform: 'generic', url, title } */ },
};
```

- Generic extractor works (title + URL)
- Platform-specific extractors return same shape, stubbed for future DOM scraping
- Listens for `chrome.runtime.onMessage` to respond with current page context

## 5. Side Panel Components

| Component | Purpose |
|-----------|---------|
| `AuthScreen` | OAuth login button, loading state, error display |
| `ChatInterface` | Message list + input bar, placeholder response logic |
| `QuickActions` | Pre-built prompt buttons: "Generate campaign", "Find creators", "Analyze this page" |
| `PageContext` | Current tab's extracted context — platform badge + URL + title |

### Design Tokens (Dark Mode Side Panel)

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a1a` | Side panel background |
| Text | `#f0f0f0` | Primary text |
| Primary teal | `#4DD9C0` | Buttons, accents, outbound bubbles |
| Secondary pink | `#F9A8D4` | Inbound bubbles, highlights |
| Surface | `#1a1a2e` | Card/input backgrounds |
| Border | `#2a2a3e` | Dividers, input borders |

### Typography
- System font stack for performance: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

## 6. Build Pipeline

Uses `@crxjs/vite-plugin` to handle Manifest V3's multi-entry build requirements. This plugin:
- Reads `manifest.json` and automatically builds all declared entry points (side panel, service worker, content scripts)
- Handles IIFE wrapping for content scripts and service workers (which cannot use ES module imports)
- Copies static assets and resolves manifest paths
- Provides HMR support during development for the side panel

| Entry | Output | Format |
|-------|--------|--------|
| `src/sidepanel/main.tsx` | `dist/sidepanel/index.html` + JS/CSS | ESM (React app) |
| `src/background/service-worker.ts` | `dist/background/service-worker.js` | IIFE |
| `src/content/content-script.ts` | `dist/content/content-script.js` | IIFE |

Static files copied as-is: `manifest.json`, `public/icons/*`, `src/oauth/callback.html`

**Dev workflow note:** Manifest V3's strict CSP blocks inline scripts and eval. Developers must load the built `dist/` folder into `chrome://extensions` — Vite's dev server cannot serve the extension directly, but `@crxjs/vite-plugin` bridges this with its own dev mode that watches and rebuilds.

**Design tokens in Tailwind:** The dark mode hex values (section 5) are configured as Tailwind theme extensions (e.g., `extend.colors.donny.bg: '#0a0a1a'`) in `tailwind.config.ts`, not hardcoded in classNames.

## 7. What's NOT in the Scaffold

- No live API calls (placeholder responses only)
- No real OAuth redirect (auth UI present but non-functional without registered extension ID)
- No platform-specific DOM extraction (stubs only)
- No icon assets (placeholder PNGs generated programmatically)
- No tests (future task)

## Files Created

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 configuration |
| `package.json` | Dependencies and build scripts |
| `tsconfig.json` | TypeScript strict mode config |
| `vite.config.ts` | Multi-entry Vite build |
| `src/background/service-worker.ts` | Message routing, side panel opening, context menu |
| `src/content/content-script.ts` | Platform detection + stubbed extractors |
| `src/sidepanel/index.html` | Side panel HTML shell |
| `src/sidepanel/main.tsx` | React entry point |
| `src/sidepanel/App.tsx` | Root component with auth gate |
| `src/sidepanel/components/*.tsx` | Chat, auth, quick actions, page context |
| `src/sidepanel/hooks/*.ts` | API, auth, page context hooks |
| `src/sidepanel/styles/globals.css` | Tailwind + design tokens |
| `src/oauth/callback.html` | OAuth redirect handler |
| `src/utils/*.ts` | API client, storage helpers, constants |
| `public/icons/*.png` | Placeholder icon PNGs |
| `public/donny-logo.svg` | Placeholder logo SVG |
