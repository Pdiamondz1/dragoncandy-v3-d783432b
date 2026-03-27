# Donny Content Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Donny awareness of the user's current web page, with enhanced extraction for social media creator profiles, context menu actions that auto-send chat messages, and an upgraded PageContext UI.

**Architecture:** On-demand pull — content script is passive, only extracts when the service worker asks. Meta tags provide stable base data; DOM selectors add social profile details (fragile, graceful degradation). Context menu actions write to `chrome.storage.local` and the side panel reads on mount, avoiding race conditions.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3 APIs (`chrome.runtime`, `chrome.contextMenus`, `chrome.sidePanel`, `chrome.storage`), React 18, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-27-donny-content-awareness-design.md`

**Extension repo:** `C:/GIT/donny-chrome-extension`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Rewrite | `src/content/content-script.ts` | Page extraction: meta tags, OG tags, platform detection, DOM-based social profile scraping, 2KB size limit |
| Rewrite | `src/background/service-worker.ts` | Side panel opener, context menu registration + handling, message relay, welcome flag, pending action storage |
| Modify | `src/sidepanel/hooks/usePageContext.ts` | Updated PageContext interface, read pending action + welcome flag from storage |
| Modify | `src/sidepanel/hooks/useDonnyAPI.ts:10-21` | Remove hardcoded WELCOME_MESSAGE, update PageContextForAPI to include creator data |
| Create | `src/types/page-context.ts` | Shared PageContext, CreatorInfo, Platform types used by content script and side panel |
| Modify | `src/sidepanel/components/PageContext.tsx` | Two display modes: generic page vs social profile with enhanced creator info. Accepts props (no internal usePageContext call) |
| Modify | `src/sidepanel/App.tsx:48-150` | Orchestrate pending actions → auto-send, welcome message seeding |

**Protected (DO NOT MODIFY):** `src/sidepanel/components/ChatInterface.tsx`, `src/sidepanel/components/AuthScreen.tsx`

**Known limitation:** `ChatInterface.tsx` has its own internal `PageContextForAPI` type with only `url`, `title`, `platform`. When users type messages manually on a creator profile page, creator metadata is NOT sent to the API. Creator context only flows through context menu actions (App.tsx) and the "Match to your campaigns" button. This is acceptable for now since ChatInterface is protected; a follow-up task can update it.

**Task dependencies:** Tasks 1-3 are independent of each other. Task 4 depends on Task 0 (shared types). Tasks 5 depends on Task 0. Task 6 depends on Task 4. Task 7 depends on Tasks 4, 5, 6. Task 8 depends on all previous.

---

### Task 0: Shared Types

**Files:**
- Create: `src/types/page-context.ts`

- [ ] **Step 1: Create the shared types file**

Create `src/types/page-context.ts`:

```typescript
// src/types/page-context.ts
// Shared types for page context — used by both content script and side panel.
// If you change these, update both consumers.

export type Platform = "instagram" | "tiktok" | "youtube" | "twitter" | "generic";

export interface CreatorInfo {
  username: string;
  displayName?: string;
  followerCount?: string;
  bio?: string;
}

export interface PageContext {
  platform: Platform;
  url: string;
  title: string;
  description?: string;
  ogImage?: string;
  isProfilePage: boolean;
  creator?: CreatorInfo;
}

export interface PendingAction {
  action: string;
  pageContext: PageContext | null;
  selectedText?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/types/page-context.ts
git commit -m "feat: add shared PageContext types"
```

---

### Task 1: Content Script — Meta Tags + Platform Detection

**Files:**
- Rewrite: `src/content/content-script.ts`

- [ ] **Step 1: Define the new types and meta tag extraction**

Replace the entire content of `src/content/content-script.ts` with:

```typescript
// src/content/content-script.ts
// Page context extraction for Donny AI.
// Layer 1: Meta tags (stable). Layer 2: URL-based platform detection (stable).
// Layer 3: DOM selectors for social profiles (fragile — see per-platform comments).

import type { Platform, PageContext, CreatorInfo } from "@/types/page-context";

// ── Layer 1: Meta tag extraction (stable) ──────────────────

function getMeta(name: string): string | undefined {
  const el =
    document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`) ??
    document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  return el?.content || undefined;
}

function extractBaseMeta(): Pick<PageContext, "title" | "description" | "ogImage"> {
  return {
    title: getMeta("og:title") || document.title,
    description: getMeta("og:description") || getMeta("description"),
    ogImage: getMeta("og:image"),
  };
}

// ── Layer 2: Platform + profile detection (stable) ─────────

function detectPlatform(url: URL): Platform {
  const host = url.hostname;
  if (host.includes("instagram.com")) return "instagram";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("x.com") || host.includes("twitter.com")) return "twitter";
  return "generic";
}

const PROFILE_PATTERNS: Record<Exclude<Platform, "generic">, (url: URL) => string | null> = {
  instagram: (url) => {
    const match = url.pathname.match(/^\/([^/?#]+)\/?$/);
    if (!match) return null;
    const excluded = ["p", "reel", "explore", "stories", "direct", "accounts", "reels"];
    return excluded.includes(match[1]) ? null : match[1];
  },
  tiktok: (url) => {
    const match = url.pathname.match(/^\/@([^/?#]+)\/?$/);
    return match ? match[1] : null;
  },
  youtube: (url) => {
    const match = url.pathname.match(/^\/(@[^/?#]+|c\/[^/?#]+)\/?$/);
    return match ? match[1].replace(/^@/, "").replace(/^c\//, "") : null;
  },
  twitter: (url) => {
    const match = url.pathname.match(/^\/([^/?#]+)\/?$/);
    if (!match) return null;
    const excluded = ["home", "explore", "search", "notifications", "messages", "i", "settings", "compose"];
    return excluded.includes(match[1]) ? null : match[1];
  },
};

function detectProfile(platform: Platform, url: URL): string | null {
  if (platform === "generic") return null;
  return PROFILE_PATTERNS[platform](url);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: No errors (file is valid but incomplete — message listener is missing, which will cause the extension to not respond to messages, but tsc should pass)

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/content/content-script.ts
git commit -m "feat(content): add meta tag extraction and platform detection"
```

---

### Task 2: Content Script — DOM Extractors + Size Enforcement

**Files:**
- Modify: `src/content/content-script.ts` (append to file from Task 1)

- [ ] **Step 1: Add DOM extractors for each platform**

Append to the end of `src/content/content-script.ts`:

```typescript
// ── Layer 3: DOM extraction (fragile) ──────────────────────
// These CSS selectors target current platform HTML as of 2026-03.
// Platforms change their DOM frequently — these WILL break and need updating.
// Each extractor is wrapped in try/catch and returns undefined on failure.
// CreatorInfo type is imported from @/types/page-context.

function extractInstagramCreator(username: string): CreatorInfo | undefined {
  // Instagram profile page DOM selectors — may need updating
  try {
    const header = document.querySelector("header section");
    if (!header) return { username };

    const displayName = header.querySelector("span[class*='x1lliihq']")?.textContent?.trim();
    const followerEl = header.querySelectorAll("li")?.[1];
    const followerCount = followerEl?.querySelector("span span")?.textContent?.trim();
    const bioEl = header.querySelector("div[class*='x7a106z'] > span");
    const bio = bioEl?.textContent?.trim();

    return { username, displayName, followerCount, bio };
  } catch {
    return { username };
  }
}

function extractTikTokCreator(username: string): CreatorInfo | undefined {
  // TikTok profile page DOM selectors — may need updating
  try {
    const displayName = document.querySelector("[data-e2e='user-subtitle']")?.textContent?.trim()
      ?? document.querySelector("h1[data-e2e='user-title']")?.textContent?.trim();
    const followerCount = document.querySelector("[data-e2e='followers-count']")?.textContent?.trim();
    const bio = document.querySelector("[data-e2e='user-bio']")?.textContent?.trim();

    return { username, displayName, followerCount, bio };
  } catch {
    return { username };
  }
}

function extractYouTubeCreator(username: string): CreatorInfo | undefined {
  // YouTube channel page DOM selectors — may need updating
  try {
    const displayName = document.querySelector("#channel-name yt-formatted-string, #text.ytd-channel-name")?.textContent?.trim();
    const subscriberEl = document.querySelector("#subscriber-count, yt-formatted-string#subscriber-count");
    const followerCount = subscriberEl?.textContent?.trim()?.replace(" subscribers", "");
    const bio = document.querySelector("#description-container .ytd-channel-tagline-renderer, meta[name='description']")?.textContent?.trim()
      ?? getMeta("description");

    return { username, displayName, followerCount, bio };
  } catch {
    return { username };
  }
}

function extractTwitterCreator(username: string): CreatorInfo | undefined {
  // Twitter/X profile page DOM selectors — may need updating
  try {
    const displayName = document.querySelector("[data-testid='UserName'] span span")?.textContent?.trim();
    const followerLink = document.querySelector("a[href$='/verified_followers'], a[href$='/followers']");
    const followerCount = followerLink?.querySelector("span span")?.textContent?.trim();
    const bio = document.querySelector("[data-testid='UserDescription']")?.textContent?.trim();

    return { username, displayName, followerCount, bio };
  } catch {
    return { username };
  }
}

const DOM_EXTRACTORS: Record<Exclude<Platform, "generic">, (username: string) => CreatorInfo | undefined> = {
  instagram: extractInstagramCreator,
  tiktok: extractTikTokCreator,
  youtube: extractYouTubeCreator,
  twitter: extractTwitterCreator,
};
```

- [ ] **Step 2: Add size enforcement and the main getPageContext function + message listener**

Append to the end of `src/content/content-script.ts`:

```typescript
// ── Size enforcement ───────────────────────────────────────

const MAX_CONTEXT_BYTES = 2048;

function enforceSize(input: PageContext): PageContext {
  // Clone to avoid mutating the original
  const ctx: PageContext = JSON.parse(JSON.stringify(input));

  let json = JSON.stringify(ctx);
  if (json.length <= MAX_CONTEXT_BYTES) return ctx;

  // Step 1: truncate bio
  if (ctx.creator?.bio && ctx.creator.bio.length > 200) {
    ctx.creator.bio = ctx.creator.bio.slice(0, 200);
    json = JSON.stringify(ctx);
    if (json.length <= MAX_CONTEXT_BYTES) return ctx;
  }

  // Step 2: truncate description
  if (ctx.description && ctx.description.length > 200) {
    ctx.description = ctx.description.slice(0, 200);
    json = JSON.stringify(ctx);
    if (json.length <= MAX_CONTEXT_BYTES) return ctx;
  }

  // Step 3: drop ogImage
  delete ctx.ogImage;
  json = JSON.stringify(ctx);
  if (json.length <= MAX_CONTEXT_BYTES) return ctx;

  // Step 4: drop creator entirely
  delete ctx.creator;
  ctx.isProfilePage = false;
  return ctx;
}

// ── Main extraction ────────────────────────────────────────

function getPageContext(): PageContext {
  const url = new URL(window.location.href);
  const platform = detectPlatform(url);
  const base = extractBaseMeta();
  const profileUsername = detectProfile(platform, url);

  const ctx: PageContext = {
    platform,
    url: url.href,
    ...base,
    isProfilePage: profileUsername !== null,
  };

  if (profileUsername && platform !== "generic") {
    ctx.creator = DOM_EXTRACTORS[platform](profileUsername);
  }

  return enforceSize(ctx);
}

// ── Message listener ───────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
  }
  return true;
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/content/content-script.ts
git commit -m "feat(content): add DOM extractors, size enforcement, and message listener"
```

---

### Task 3: Service Worker — Context Menus + Pending Action Storage

**Files:**
- Rewrite: `src/background/service-worker.ts`

- [ ] **Step 1: Rewrite the service worker**

Replace the entire content of `src/background/service-worker.ts` with:

```typescript
// src/background/service-worker.ts

// ── Side panel opener ──────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// ── Install handler: context menus + welcome flag ──────────

chrome.runtime.onInstalled.addListener((details) => {
  // Context menus (re-registered on every install/update)
  chrome.contextMenus.create({
    id: "ask-donny",
    title: "Ask Donny about this page",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "generate-campaign",
    title: "Generate campaign for this",
    contexts: ["page", "selection"],
  });
  chrome.contextMenus.create({
    id: "find-creators",
    title: "Find creators like this",
    contexts: ["page"],
  });

  // Welcome flag — only on first install, not updates
  if (details.reason === "install") {
    chrome.storage.local.set({ donny_show_welcome: true });
  }
});

// ── Context menu click handler ─────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const tabId = tab.id;
  const action = info.menuItemId as string;

  // Request page context from content script using tab.id directly
  let pageContext = null;
  try {
    pageContext = await chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" });
  } catch {
    // Content script not injected (chrome:// pages, etc.) — pageContext stays null
  }

  // Write pending action to storage (avoids race condition with side panel mounting)
  await chrome.storage.local.set({
    donny_pending_action: {
      action,
      pageContext,
      selectedText: info.selectionText || undefined,
    },
  });

  // Open side panel — it will read the pending action on mount
  chrome.sidePanel.open({ tabId });
});

// ── Message relay: side panel → content script ─────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "REQUEST_PAGE_CONTEXT") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_CONTEXT" }, (response) => {
          sendResponse(response ?? null);
        });
      } else {
        sendResponse(null);
      }
    });
    return true;
  }
});

// TODO: Badge notification logic goes here when notification infrastructure is added
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/background/service-worker.ts
git commit -m "feat(sw): add context menus, pending action storage, and welcome flag"
```

---

### Task 4: Update usePageContext Hook

**Files:**
- Rewrite: `src/sidepanel/hooks/usePageContext.ts`

- [ ] **Step 1: Rewrite the hook with updated interface + pending action + welcome flag**

Replace the entire content of `src/sidepanel/hooks/usePageContext.ts` with:

```typescript
// src/sidepanel/hooks/usePageContext.ts
import { useCallback, useEffect, useState } from "react";
import type { PageContext, PendingAction } from "@/types/page-context";

// Re-export shared types for convenience
export type { PageContext, PendingAction, Platform, CreatorInfo } from "@/types/page-context";

const CONTEXT_ENABLED_KEY = "donny_context_enabled";
const PENDING_ACTION_KEY = "donny_pending_action";
const WELCOME_KEY = "donny_show_welcome";

export function usePageContext() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [isContextEnabled, setIsContextEnabled] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Load persisted toggle state, pending action, and welcome flag on mount
  useEffect(() => {
    chrome.storage.local.get(
      [CONTEXT_ENABLED_KEY, PENDING_ACTION_KEY, WELCOME_KEY],
      (result) => {
        // Context toggle
        const stored = result[CONTEXT_ENABLED_KEY];
        if (typeof stored === "boolean") {
          setIsContextEnabled(stored);
        }

        // Pending action from context menu
        const action = result[PENDING_ACTION_KEY] as PendingAction | undefined;
        if (action) {
          setPendingAction(action);
          chrome.storage.local.remove(PENDING_ACTION_KEY);
        }

        // Welcome flag
        if (result[WELCOME_KEY] === true) {
          setShowWelcome(true);
          chrome.storage.local.remove(WELCOME_KEY);
        }
      }
    );
  }, []);

  const toggleContext = useCallback(() => {
    setIsContextEnabled((prev) => {
      const next = !prev;
      chrome.storage.local.set({ [CONTEXT_ENABLED_KEY]: next });
      return next;
    });
  }, []);

  const clearPendingAction = useCallback(() => {
    setPendingAction(null);
  }, []);

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

  // Listen for storage changes (pending action written while panel is already open)
  useEffect(() => {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes[PENDING_ACTION_KEY]?.newValue) {
        setPendingAction(changes[PENDING_ACTION_KEY].newValue);
        chrome.storage.local.remove(PENDING_ACTION_KEY);
      }
    };
    // Use chrome.storage.onChanged (works in all Chrome versions)
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return {
    context,
    isContextEnabled,
    toggleContext,
    refresh,
    pendingAction,
    clearPendingAction,
    showWelcome,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: May have errors in App.tsx or PageContext.tsx since they import from this hook — that's expected and will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/hooks/usePageContext.ts
git commit -m "feat(hook): update usePageContext with pending action and welcome flag"
```

---

### Task 5: Update useDonnyAPI Hook

**Files:**
- Modify: `src/sidepanel/hooks/useDonnyAPI.ts`

- [ ] **Step 1: Update PageContextForAPI and remove hardcoded WELCOME_MESSAGE**

In `src/sidepanel/hooks/useDonnyAPI.ts`, make these changes:

1. Remove the `WELCOME_MESSAGE` constant (lines 10-15)
2. Update `PageContextForAPI` to include creator data (lines 17-21)
3. Update `useState` initializer to start with empty array (line 33-34)
4. Update `context_metadata` in `sendMessage` to pass creator data (lines 87-89)
5. Update `clearConversation` to reset to empty array (line 146)
6. Add `prependMessage` function so App.tsx can inject the welcome message

The full updated file:

```typescript
// src/sidepanel/hooks/useDonnyAPI.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { sendChatMessage, AuthExpiredError } from "@/utils/api";
import type { ChatMessage } from "@/utils/api";

const MESSAGES_KEY = "donny_messages";
const CONVERSATION_ID_KEY = "donny_conversation_id";
const MAX_STORED_MESSAGES = 200;

export interface PageContextForAPI {
  url: string;
  title: string;
  platform: string;
  isProfilePage?: boolean;
  creator?: {
    username: string;
    displayName?: string;
    followerCount?: string;
    bio?: string;
  };
}

interface UseDonnyAPIReturn {
  messages: (ChatMessage & { local?: boolean })[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, pageContext?: PageContextForAPI | null) => void;
  clearConversation: () => void;
  retryLast: (pageContext?: PageContextForAPI | null) => void;
  prependMessage: (msg: ChatMessage & { local: true }) => void;
}

export function useDonnyAPI(): UseDonnyAPIReturn {
  const [messages, setMessages] = useState<(ChatMessage & { local?: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Load persisted messages on mount
  useEffect(() => {
    chrome.storage.local.get([MESSAGES_KEY, CONVERSATION_ID_KEY], (result) => {
      const stored = result[MESSAGES_KEY] as ChatMessage[] | undefined;
      const storedConvId = result[CONVERSATION_ID_KEY] as string | undefined;

      if (stored && stored.length > 0) {
        setMessages(stored);
      }
      if (storedConvId) {
        conversationIdRef.current = storedConvId;
      }
    });

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const persistMessages = useCallback(
    (msgs: (ChatMessage & { local?: boolean })[], convId: string | null) => {
      const toStore = msgs
        .filter((m) => !m.local)
        .slice(-MAX_STORED_MESSAGES);

      chrome.storage.local.set({
        [MESSAGES_KEY]: toStore,
        [CONVERSATION_ID_KEY]: convId,
      });
    },
    []
  );

  const prependMessage = useCallback(
    (msg: ChatMessage & { local: true }) => {
      setMessages((prev) => {
        // Don't add if messages already exist (not first open)
        if (prev.length > 0) return prev;
        return [msg];
      });
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, pageContext?: PageContextForAPI | null) => {
      setError(null);
      const userMessage: ChatMessage = { role: "user", content };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const contextMeta: Record<string, string> | undefined = pageContext
          ? {
              platform: pageContext.platform,
              title: pageContext.title,
              ...(pageContext.isProfilePage ? { is_profile: "true" } : {}),
              ...(pageContext.creator?.username
                ? { creator_username: pageContext.creator.username }
                : {}),
              ...(pageContext.creator?.followerCount
                ? { creator_followers: pageContext.creator.followerCount }
                : {}),
              ...(pageContext.creator?.bio
                ? { creator_bio: pageContext.creator.bio.slice(0, 200) }
                : {}),
            }
          : undefined;

        const response = await sendChatMessage({
          message: content,
          conversation_id: conversationIdRef.current ?? undefined,
          context_url: pageContext?.url,
          context_metadata: contextMeta,
        });

        if (!mountedRef.current) return;

        conversationIdRef.current = response.conversation_id;
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: response.reply,
        };

        setMessages((prev) => {
          const updated = [...prev, assistantMessage];
          persistMessages(updated, response.conversation_id);
          return updated;
        });
      } catch (err) {
        if (!mountedRef.current) return;

        if (err instanceof AuthExpiredError) {
          setMessages([]);
          chrome.storage.local.remove([MESSAGES_KEY, CONVERSATION_ID_KEY]);
          return;
        }

        setError(
          err instanceof Error ? err.message : "Something went wrong. Try again."
        );
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [persistMessages]
  );

  const retryLast = useCallback(
    (pageContext?: PageContextForAPI | null) => {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      setMessages((prev) => {
        const idx = prev.lastIndexOf(lastUserMsg);
        if (idx === -1) return prev;
        return prev.slice(0, idx);
      });

      sendMessage(lastUserMsg.content, pageContext);
    },
    [messages, sendMessage]
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    conversationIdRef.current = null;
    chrome.storage.local.remove([MESSAGES_KEY, CONVERSATION_ID_KEY]);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearConversation,
    retryLast,
    prependMessage,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: May have errors in ChatInterface.tsx if it expects WELCOME_MESSAGE behavior — check and note.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/hooks/useDonnyAPI.ts
git commit -m "feat(hook): update PageContextForAPI with creator data, add prependMessage"
```

---

### Task 6: Update PageContext Component

**Files:**
- Rewrite: `src/sidepanel/components/PageContext.tsx`

- [ ] **Step 1: Rewrite PageContext with two display modes**

Replace the entire content of `src/sidepanel/components/PageContext.tsx` with:

```typescript
// src/sidepanel/components/PageContext.tsx
// This component receives all data as props — it does NOT call usePageContext() internally.
// App.tsx is the single owner of usePageContext() to avoid dual-instance race conditions.
import type { Platform, PageContext as PageContextType } from "@/types/page-context";

const PLATFORM_LABELS: Record<Exclude<Platform, "generic">, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X",
};

const PLATFORM_ICONS: Record<Exclude<Platform, "generic">, string> = {
  instagram: "\u{1F4F7}",
  tiktok: "\u{1F3B5}",
  youtube: "\u{1F4FA}",
  twitter: "\u{1D54F}",
};

interface PageContextProps {
  context: PageContextType | null;
  isContextEnabled: boolean;
  onToggleContext: () => void;
  onMatchCreator?: (creatorContext: string) => void;
}

export function PageContext({ context, isContextEnabled, onToggleContext, onMatchCreator }: PageContextProps) {
  if (!context) {
    return null;
  }

  const isProfile = context.isProfilePage && context.creator;
  const platformLabel = context.platform !== "generic"
    ? PLATFORM_LABELS[context.platform]
    : null;

  return (
    <div className="px-4 py-2 bg-donny-teal/[0.08] border-b border-donny-border space-y-1.5">
      <div className="flex items-center gap-2">
        {/* Icon: platform icon for profiles, favicon for generic */}
        {isProfile && context.platform !== "generic" ? (
          <span className="text-sm flex-shrink-0" aria-hidden>
            {PLATFORM_ICONS[context.platform]}
          </span>
        ) : (
          <img
            src={`https://www.google.com/s2/favicons?domain=${new URL(context.url).hostname}&sz=32`}
            alt=""
            className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {/* Page/profile info */}
        <div className="flex-1 min-w-0">
          {isProfile && context.creator ? (
            <>
              <div className="text-[11px] text-donny-teal font-medium truncate">
                Donny sees: @{context.creator.username}
                {context.creator.followerCount && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-donny-teal/20 text-[9px] text-donny-teal">
                    {context.creator.followerCount} followers
                  </span>
                )}
              </div>
              {context.creator.bio && (
                <div className="text-[10px] text-donny-text/50 truncate">
                  {context.creator.bio.slice(0, 80)}
                </div>
              )}
              {platformLabel && (
                <div className="text-[9px] text-donny-text/30">
                  {platformLabel} creator profile
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-[11px] text-donny-text/70 truncate">
                {context.title || "Untitled page"}
              </div>
              {context.description && (
                <div className="text-[10px] text-donny-text/40 truncate">
                  {context.description.slice(0, 120)}
                </div>
              )}
              <div className="text-[10px] text-donny-text/35 truncate">
                {context.url}
              </div>
            </>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={onToggleContext}
          className={`w-8 h-[18px] rounded-full relative flex-shrink-0 transition-colors ${
            isContextEnabled ? "bg-donny-teal" : "bg-donny-border"
          }`}
          aria-label={
            isContextEnabled
              ? "Disable page context sharing"
              : "Enable page context sharing"
          }
        >
          <div
            className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[2px] transition-transform ${
              isContextEnabled ? "right-[2px]" : "left-[2px]"
            }`}
          />
        </button>
      </div>

      {/* Quick action for creator profiles */}
      {isProfile && onMatchCreator && (
        <button
          onClick={() =>
            onMatchCreator(
              `Find creators similar to @${context.creator!.username} on ${platformLabel ?? context.platform}`
            )
          }
          className="w-full text-center px-3 py-1 rounded-full border border-donny-teal/40 text-donny-teal text-[10px] font-medium hover:bg-donny-teal hover:text-donny-bg transition-colors"
        >
          Match to your campaigns
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: May have errors in App.tsx since PageContext now accepts `onMatchCreator` prop — will be wired in Task 7.

- [ ] **Step 3: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/components/PageContext.tsx
git commit -m "feat(ui): add dual-mode PageContext with creator profile display"
```

---

### Task 7: Update App.tsx — Orchestrate Pending Actions + Welcome

**Files:**
- Modify: `src/sidepanel/App.tsx:48-150`

- [ ] **Step 1: Update App.tsx to wire pending actions and welcome message**

Replace the content of `src/sidepanel/App.tsx` with:

```typescript
// src/sidepanel/App.tsx
import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { ChatInterface } from "./components/ChatInterface";
import { PageContext } from "./components/PageContext";
import { useAuth } from "./hooks/useAuth";
import { usePageContext } from "./hooks/usePageContext";
import { useDonnyAPI } from "./hooks/useDonnyAPI";
import type { PageContextForAPI } from "./hooks/useDonnyAPI";
import type { PageContext as PageContextType } from "./hooks/usePageContext";

function toAPIContext(ctx: PageContextType | null): PageContextForAPI | null {
  if (!ctx) return null;
  return {
    url: ctx.url,
    title: ctx.title,
    platform: ctx.platform,
    isProfilePage: ctx.isProfilePage,
    creator: ctx.creator,
  };
}

function composeActionMessage(
  action: string,
  pageContext: PageContextType | null,
  selectedText?: string
): string {
  switch (action) {
    case "ask-donny":
      return pageContext
        ? `Tell me about this page: ${pageContext.title} (${pageContext.url})`
        : "Tell me about what you're working on";
    case "generate-campaign":
      if (selectedText) return `Generate a campaign brief for: ${selectedText}`;
      return pageContext
        ? `Generate a campaign brief for: ${pageContext.title}`
        : "Generate a campaign brief";
    case "find-creators":
      if (pageContext?.creator) {
        const label = pageContext.platform !== "generic" ? pageContext.platform : "";
        return `Find creators similar to @${pageContext.creator.username}${label ? ` on ${label}` : ""}`;
      }
      return pageContext
        ? `Find creators related to: ${pageContext.title}`
        : "Find creators that would be a good fit for my brand";
    default:
      return "Hey Donny, I need help";
  }
}

function DropdownMenu({
  onNewConversation,
  onSignOut,
  onClose,
}: {
  onNewConversation: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 bg-donny-surface border border-donny-border rounded-lg shadow-lg py-1 z-20 min-w-[160px]">
        <button
          onClick={() => {
            onNewConversation();
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-xs text-donny-text hover:bg-donny-border/50 transition-colors"
        >
          New conversation
        </button>
        <button
          onClick={() => {
            onSignOut();
            onClose();
          }}
          className="w-full text-left px-4 py-2 text-xs text-donny-text/60 hover:bg-donny-border/50 transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  );
}

export function App() {
  const { isAuthenticated, isLoading: authLoading, error, user, login, logout } =
    useAuth();
  const { context, isContextEnabled, toggleContext, pendingAction, clearPendingAction, showWelcome } =
    usePageContext();
  const donnyAPI = useDonnyAPI();
  const { clearConversation, sendMessage, prependMessage } = donnyAPI;
  const [menuOpen, setMenuOpen] = useState(false);

  // Seed welcome message on first install
  useEffect(() => {
    if (showWelcome) {
      prependMessage({
        role: "assistant",
        content:
          "Hey! I'm Donny, your DragonCandy assistant. I can see what you're browsing and help you find creators, generate campaigns, and more. Right-click any page to get started!",
        local: true,
      });
    }
  }, [showWelcome, prependMessage]);

  // Handle pending context menu actions
  useEffect(() => {
    if (!pendingAction) return;

    const msg = composeActionMessage(
      pendingAction.action,
      pendingAction.pageContext,
      pendingAction.selectedText
    );
    const apiCtx = toAPIContext(pendingAction.pageContext);
    sendMessage(msg, apiCtx);
    clearPendingAction();
  }, [pendingAction, sendMessage, clearPendingAction]);

  const handleMatchCreator = useCallback(
    (prompt: string) => {
      sendMessage(prompt, context ? toAPIContext(context) : null);
    },
    [sendMessage, context]
  );

  const handleNewConversation = useCallback(() => {
    clearConversation();
  }, [clearConversation]);

  if (authLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-donny-bg">
        <div className="w-16 h-16 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-2xl animate-pulse">
          D
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen onLogin={login} isLoading={authLoading} error={error} />;
  }

  return (
    <div className="flex flex-col h-screen bg-donny-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-donny-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-sm">
            D
          </div>
          <span className="font-bold text-donny-text text-sm">Donny</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex items-center gap-2"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-donny-pink flex items-center justify-center text-donny-bg font-semibold text-[10px]">
                {user?.display_name
                  ?.split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() ?? "?"}
              </div>
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-donny-text/40"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {menuOpen && (
            <DropdownMenu
              onNewConversation={handleNewConversation}
              onSignOut={logout}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      </header>

      <PageContext
          context={context}
          isContextEnabled={isContextEnabled}
          onToggleContext={toggleContext}
          onMatchCreator={handleMatchCreator}
        />

      <div className="flex-1 overflow-hidden">
        <ChatInterface
          user={user}
          pageContext={context}
          isContextEnabled={isContextEnabled}
          messages={donnyAPI.messages}
          isLoading={donnyAPI.isLoading}
          error={donnyAPI.error}
          sendMessage={donnyAPI.sendMessage}
          retryLast={donnyAPI.retryLast}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/GIT/donny-chrome-extension && npx tsc --noEmit`
Expected: No errors — all types should now align across the full chain.

- [ ] **Step 3: Verify full build passes**

Run: `cd C:/GIT/donny-chrome-extension && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd C:/GIT/donny-chrome-extension
git add src/sidepanel/App.tsx
git commit -m "feat(app): orchestrate context menu actions and welcome message"
```

---

### Task 8: Final Verification

**Files:** None — verification only.

- [ ] **Step 1: Clean build**

Run: `cd C:/GIT/donny-chrome-extension && rm -rf dist && npm run build`
Expected: Build succeeds.

- [ ] **Step 2: Check content script bundle size**

Run: `cd C:/GIT/donny-chrome-extension && wc -c dist/assets/content-script-*.js 2>/dev/null || ls -la dist/src/content/`
Expected: Content script output should be under 10KB.

- [ ] **Step 3: Mental walkthrough**

Verify the data flow mentally:
1. User browses to `instagram.com/foodiecreator` → content script detects Instagram profile, extracts username/followers/bio
2. Side panel shows "Donny sees: @foodiecreator (150K followers)" with "Match to your campaigns" button
3. User right-clicks → "Find creators like this" → service worker writes pending action to storage → opens side panel → side panel reads action → auto-sends "Find creators similar to @foodiecreator on instagram" → Donny API processes with creator context
4. First install → welcome flag set → side panel shows Donny greeting

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
cd C:/GIT/donny-chrome-extension
git add -A
git commit -m "fix: address build issues from content awareness integration"
```
Only run if Step 1 or 2 required fixes.
