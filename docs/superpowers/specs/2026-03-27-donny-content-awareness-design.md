# Donny Content Awareness — Design Spec

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Content script extraction, service worker context menus, PageContext UI enhancements

---

## Overview

This spec covers Donny's ability to understand what the user is browsing and act on it. Three files are modified: the content script (DOM extraction), the service worker (context menus + message routing), and the PageContext component (enhanced display for social profiles).

**Protected files:** ChatInterface.tsx and AuthScreen.tsx are not modified.

## Architecture: On-Demand Pull

The content script is passive. It only extracts page data when the service worker sends a `GET_PAGE_CONTEXT` message. This keeps resource usage minimal — no extraction runs on pages the user doesn't care about. The existing message relay pattern (`side panel → service worker → content script → service worker → side panel`) is preserved.

## 1. Content Script (`src/content/content-script.ts`)

### Data Model

```typescript
interface PageContext {
  platform: "instagram" | "tiktok" | "youtube" | "twitter" | "generic";
  url: string;
  title: string;
  description?: string;
  ogImage?: string;
  isProfilePage: boolean;
  creator?: {
    username: string;
    displayName?: string;
    followerCount?: string; // Display string: "150K", "1.2M"
    bio?: string;
  };
}
```

### Extraction Strategy (Hybrid: Meta Tags + DOM)

**Layer 1 — Always extracted (stable, meta-tag based):**
- `document.title`
- `window.location.href`
- `<meta name="description">` content
- Open Graph tags: `og:title`, `og:description`, `og:image`

**Layer 2 — URL-based platform and profile detection (stable):**

| Platform | Profile URL Pattern | Exclusions |
|----------|-------------------|------------|
| Instagram | `instagram.com/[username]` | `/p/`, `/reel/`, `/explore/`, `/stories/`, `/direct/` |
| TikTok | `tiktok.com/@[username]` | — |
| YouTube | `youtube.com/@[handle]` or `youtube.com/c/[name]` | — |
| Twitter/X | `x.com/[handle]` or `twitter.com/[handle]` | `/status/`, `/search`, `/explore`, `/home`, `/i/` |
| Generic | Everything else | — |

**Layer 3 — DOM extraction (fragile, per-platform):**
Only attempted when a profile page is detected. Each platform has a dedicated extractor function that uses CSS selectors to find:
- Username / display name
- Follower count
- Bio text

These selectors are inherently fragile — platforms change their HTML regularly. Each extractor:
- Is wrapped in try/catch — never throws
- Returns `undefined` for any field it can't find
- Includes a comment noting the selectors may need updating
- Falls back gracefully to Layer 1 data if DOM extraction fails entirely

### Size Enforcement

The final serialized context is checked against a **2KB limit**. If over:
1. Truncate `bio` to 200 chars
2. Truncate `description` to 200 chars
3. Drop `ogImage`
4. If still over, drop `creator` entirely

### Message Handling

Listens for `GET_PAGE_CONTEXT` via `chrome.runtime.onMessage`. Runs extraction synchronously and responds via `sendResponse`.

## 2. Service Worker (`src/background/service-worker.ts`)

### Context Menu Registration

On `chrome.runtime.onInstalled`, register three context menu items:

| ID | Label | Contexts |
|----|-------|----------|
| `ask-donny` | "Ask Donny about this page" | `["page"]` |
| `generate-campaign` | "Generate campaign for this" | `["page", "selection"]` |
| `find-creators` | "Find creators like this" | `["page"]` |

### Context Menu Click Handling

On `contextMenus.onClicked`:
1. Open side panel for the tab (`chrome.sidePanel.open`)
2. Request page context from content script (`GET_PAGE_CONTEXT`)
3. Send `CONTEXT_MENU_ACTION` message to side panel:
   ```typescript
   {
     type: "CONTEXT_MENU_ACTION",
     action: "ask-donny" | "generate-campaign" | "find-creators",
     pageContext: PageContext,
     selectedText?: string  // only for "generate-campaign" with selection
   }
   ```

### Welcome Message on Install

On `chrome.runtime.onInstalled` with `reason === "install"`:
- Set `donny_show_welcome: true` in `chrome.storage.local`
- The side panel reads this flag on mount, shows a pre-seeded welcome message, and clears the flag

This avoids timing issues with trying to message a side panel that isn't open yet.

### Badge Notifications

Not implemented in this phase. A comment placeholder marks where badge logic would go when notification infrastructure exists.

### Preserved Behavior

The existing `REQUEST_PAGE_CONTEXT` message relay (side panel → service worker → content script) is unchanged. The `chrome.action.onClicked` handler is unchanged.

## 3. Side Panel Updates

### `usePageContext.ts` Hook Changes

- **Updated `PageContext` interface** to match the new content script model (adds `description`, `ogImage`, `isProfilePage`, `creator`, `"twitter"` platform)
- **Welcome flag:** On mount, reads `donny_show_welcome` from storage. If true, clears the flag and exposes `showWelcome = true`
- **Context menu action listener:** Listens for `CONTEXT_MENU_ACTION` messages from the service worker. Exposes `pendingAction` state containing the action type, page context, and optional selected text

### `PageContext.tsx` Component Changes

Two display modes based on `context.isProfilePage`:

**Generic page (no profile detected):**
- Current layout preserved: favicon, page title, URL, toggle switch
- Adds `context.description` as a truncated subtitle line if available

**Social media profile detected:**
- Platform icon (Instagram/TikTok/YouTube/Twitter) replaces favicon
- Primary text: "Donny sees: @username" in teal
- Follower count displayed as a small badge/pill
- Bio snippet truncated to ~80 characters
- Quick action button: "Match to your campaigns" — sends a "Find creators like this" message to chat
- Toggle switch remains in same position

### `App.tsx` Coordination (thin changes only)

App.tsx orchestrates context menu auto-send since it has access to both `usePageContext` and `useDonnyAPI`:

- Watches `pendingAction` from `usePageContext`
- Composes a chat message based on action type:
  - `"ask-donny"` → "Tell me about this page: [title] ([url])"
  - `"generate-campaign"` → "Generate a campaign brief for: [title/selectedText]"
  - `"find-creators"` → "Find creators similar to @username on [platform]"
- Calls `useDonnyAPI.sendMessage()` with composed text + context
- Clears `pendingAction` after sending

Welcome message: If `showWelcome` is true, pre-seeds the message list with a Donny greeting explaining page context awareness, context menus, and how to get started.

## Message Protocol Summary

| Message Type | Direction | Payload |
|-------------|-----------|---------|
| `GET_PAGE_CONTEXT` | service worker → content script | `{}` |
| `REQUEST_PAGE_CONTEXT` | side panel → service worker | `{}` |
| `CONTEXT_MENU_ACTION` | service worker → side panel | `{ action, pageContext, selectedText? }` |

## Constraints

- Content script must be < 10KB bundled
- Context payload must be < 2KB serialized
- DOM selectors are best-effort — graceful degradation to meta tags
- No modifications to ChatInterface.tsx or AuthScreen.tsx
- `npm run build` must pass
