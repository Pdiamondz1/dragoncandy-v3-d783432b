# Donny Chat Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Donny Chrome Extension side panel from scaffold placeholders to a fully functional chat interface with live API integration, conversation persistence, and page context awareness.

**Architecture:** Incremental upgrade of 6 existing files + extraction of 2 new components. No new dependencies. All state managed via React hooks with `chrome.storage.local` persistence. The existing `sendChatMessage()` in `utils/api.ts` handles authenticated API calls to the `donny-chat` Supabase edge function.

**Tech Stack:** React 18, TypeScript (strict), Tailwind CSS 3, Chrome Extension Manifest V3, Vite + @crxjs/vite-plugin

**Spec:** `docs/superpowers/specs/2026-03-27-donny-chat-interface-design.md`

**Extension codebase:** `C:/GIT/donny-chrome-extension/`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/sidepanel/components/MessageContent.tsx` | Create | Minimal markdown renderer wrapper |
| `src/sidepanel/components/TypingIndicator.tsx` | Create | Animated typing dots with Donny avatar |
| `src/sidepanel/hooks/usePageContext.ts` | Modify | Add context toggle + storage persistence |
| `src/sidepanel/hooks/useDonnyAPI.ts` | Modify | Live API calls + conversation persistence |
| `src/sidepanel/components/PageContext.tsx` | Modify | Add toggle switch, favicon, collapsible |
| `src/sidepanel/components/QuickActions.tsx` | Modify | Horizontal chip row, context-aware prompts |
| `src/sidepanel/components/ChatInterface.tsx` | Modify | Avatars, auto-scroll, MessageContent, TypingIndicator, error display |
| `src/sidepanel/App.tsx` | Modify | Remove landing screen, always show chat, header redesign |

**DO NOT modify:** `service-worker.ts`, `content-script.ts`, `useAuth.ts`, `AuthScreen.tsx`, `callback.html`, `api.ts`, `constants.ts`

**`storage.ts` note:** The spec says "except adding conversation storage keys" — but the existing `StorageData` interface is typed with specific keys. Rather than modifying `storage.ts`, the hooks will use `chrome.storage.local` directly for conversation data (messages, conversation_id, context_enabled). This avoids touching the auth storage layer.

---

## Task 1: Create MessageContent Component

**Files:**
- Create: `src/sidepanel/components/MessageContent.tsx`

This is a pure rendering component with no dependencies. Build it first so ChatInterface can use it.

- [ ] **Step 1: Create MessageContent.tsx**

```tsx
// src/sidepanel/components/MessageContent.tsx
import { Fragment } from "react";

interface MessageContentProps {
  content: string;
}

interface TextSegment {
  type: "text" | "bold" | "italic" | "link";
  text: string;
  href?: string;
}

function parseInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|\[(.+?)\]\((.+?)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    if (match[1]) {
      segments.push({ type: "bold", text: match[1] });
    } else if (match[2]) {
      segments.push({ type: "italic", text: match[2] });
    } else if (match[3] && match[4]) {
      segments.push({ type: "link", text: match[3], href: match[4] });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments;
}

function renderSegment(segment: TextSegment, key: number) {
  switch (segment.type) {
    case "bold":
      return <strong key={key}>{segment.text}</strong>;
    case "italic":
      return <em key={key}>{segment.text}</em>;
    case "link":
      return (
        <a
          key={key}
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {segment.text}
        </a>
      );
    default:
      return <Fragment key={key}>{segment.text}</Fragment>;
  }
}

export function MessageContent({ content }: MessageContentProps) {
  const lines = content.split("\n");

  return (
    <div className="whitespace-pre-wrap">
      {lines.map((line, lineIdx) => {
        const isBullet = line.match(/^[-*]\s+(.+)/);
        const inlineContent = isBullet ? isBullet[1] : line;
        const segments = parseInline(inlineContent);

        return (
          <Fragment key={lineIdx}>
            {lineIdx > 0 && !isBullet && <br />}
            {isBullet && (
              <div className="flex gap-1 ml-1">
                <span>•</span>
                <span>{segments.map(renderSegment)}</span>
              </div>
            )}
            {!isBullet && segments.map(renderSegment)}
          </Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds. The component isn't imported anywhere yet, but TypeScript should compile it without errors.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/MessageContent.tsx
git commit -m "feat: add MessageContent component for minimal markdown rendering"
```

---

## Task 2: Create TypingIndicator Component

**Files:**
- Create: `src/sidepanel/components/TypingIndicator.tsx`

Self-contained animation component. No dependencies beyond React + Tailwind.

- [ ] **Step 1: Create TypingIndicator.tsx**

```tsx
// src/sidepanel/components/TypingIndicator.tsx

const dotStyle = (delay: number): React.CSSProperties => ({
  animationDelay: `${delay}ms`,
});

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-[10px] flex-shrink-0">
        D
      </div>
      <div className="bg-donny-teal/15 px-4 py-2.5 rounded-2xl rounded-bl-sm flex gap-1 items-center">
        <style>{`
          @keyframes donny-pulse {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 1; }
          }
          .donny-dot {
            animation: donny-pulse 1s ease-in-out infinite;
          }
        `}</style>
        <div
          className="donny-dot w-1.5 h-1.5 rounded-full bg-donny-teal"
          style={dotStyle(0)}
        />
        <div
          className="donny-dot w-1.5 h-1.5 rounded-full bg-donny-teal"
          style={dotStyle(150)}
        />
        <div
          className="donny-dot w-1.5 h-1.5 rounded-full bg-donny-teal"
          style={dotStyle(300)}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/TypingIndicator.tsx
git commit -m "feat: add TypingIndicator component with animated teal dots"
```

---

## Task 3: Upgrade usePageContext Hook

**Files:**
- Modify: `src/sidepanel/hooks/usePageContext.ts`

Add `isContextEnabled` toggle with `chrome.storage.local` persistence. Keep existing tab change listeners.

- [ ] **Step 1: Replace usePageContext.ts**

Replace the full file with:

```typescript
// src/sidepanel/hooks/usePageContext.ts
import { useCallback, useEffect, useState } from "react";

export interface PageContext {
  platform: "instagram" | "tiktok" | "youtube" | "generic";
  url: string;
  title: string;
  metadata?: Record<string, string>;
}

const CONTEXT_ENABLED_KEY = "donny_context_enabled";

export function usePageContext() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [isContextEnabled, setIsContextEnabled] = useState(true);

  // Load persisted toggle state on mount
  useEffect(() => {
    chrome.storage.local.get(CONTEXT_ENABLED_KEY, (result) => {
      const stored = result[CONTEXT_ENABLED_KEY];
      if (typeof stored === "boolean") {
        setIsContextEnabled(stored);
      }
    });
  }, []);

  const toggleContext = useCallback(() => {
    setIsContextEnabled((prev) => {
      const next = !prev;
      chrome.storage.local.set({ [CONTEXT_ENABLED_KEY]: next });
      return next;
    });
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

  return { context, isContextEnabled, toggleContext, refresh };
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds. Note that `PageContext.tsx` still imports from this hook — the existing import `{ usePageContext }` still works, but the component will need updating in Task 5 to use the new `isContextEnabled`/`toggleContext` exports.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/hooks/usePageContext.ts
git commit -m "feat: add context toggle with storage persistence to usePageContext"
```

---

## Task 4: Upgrade useDonnyAPI Hook

**Files:**
- Modify: `src/sidepanel/hooks/useDonnyAPI.ts`

Replace placeholder with real API calls, conversation persistence, error handling.

**Key references:**
- `src/utils/api.ts` — `sendChatMessage(request)` returns `Promise<ChatResponse>` with `{ reply, conversation_id }`
- `src/utils/api.ts` — `AuthExpiredError` class, `ChatMessage` interface (has `role` and `content`)
- `src/utils/api.ts` — `ChatRequest` interface: `{ message, conversation_id?, context_url?, context_metadata? }`

- [ ] **Step 1: Replace useDonnyAPI.ts**

Replace the full file with:

```typescript
// src/sidepanel/hooks/useDonnyAPI.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { sendChatMessage, AuthExpiredError } from "@/utils/api";
import type { ChatMessage } from "@/utils/api";

const MESSAGES_KEY = "donny_messages";
const CONVERSATION_ID_KEY = "donny_conversation_id";
const MAX_STORED_MESSAGES = 200;

const WELCOME_MESSAGE: ChatMessage & { local: true } = {
  role: "assistant",
  content:
    "Hey! I'm Donny, your DragonCandy assistant. Ask me anything about campaigns, creators, or analytics — or tap a quick action below to get started.",
  local: true,
};

interface PageContextForAPI {
  url: string;
  title: string;
  platform: string;
}

interface UseDonnyAPIReturn {
  messages: (ChatMessage & { local?: boolean })[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, pageContext?: PageContextForAPI | null) => void;
  clearConversation: () => void;
  retryLast: (pageContext?: PageContextForAPI | null) => void;
}

export function useDonnyAPI(): UseDonnyAPIReturn {
  const [messages, setMessages] = useState<(ChatMessage & { local?: boolean })[]>([
    WELCOME_MESSAGE,
  ]);
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

  // Persist messages after changes (skip if only welcome message)
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

  const sendMessage = useCallback(
    async (content: string, pageContext?: PageContextForAPI | null) => {
      setError(null);
      const userMessage: ChatMessage = { role: "user", content };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const response = await sendChatMessage({
          message: content,
          conversation_id: conversationIdRef.current ?? undefined,
          context_url: pageContext?.url,
          context_metadata: pageContext
            ? { platform: pageContext.platform, title: pageContext.title }
            : undefined,
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
          // Auth gate in App.tsx will handle redirect
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
      // Find the last user message
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUserMsg) return;

      // Remove the failed error state's user message to re-add it via sendMessage
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
    setMessages([WELCOME_MESSAGE]);
    setError(null);
    conversationIdRef.current = null;
    chrome.storage.local.remove([MESSAGES_KEY, CONVERSATION_ID_KEY]);
  }, []);

  return { messages, isLoading, error, sendMessage, clearConversation, retryLast };
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds. The hook is imported by `ChatInterface.tsx` which still works since the return shape is a superset of the old one.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/hooks/useDonnyAPI.ts
git commit -m "feat: integrate live donny-chat API with conversation persistence"
```

---

## Task 5: Upgrade PageContext Component

**Files:**
- Modify: `src/sidepanel/components/PageContext.tsx`

Add toggle switch, favicon display, teal background. Uses the upgraded `usePageContext` from Task 3.

- [ ] **Step 1: Replace PageContext.tsx**

Replace the full file with:

```tsx
// src/sidepanel/components/PageContext.tsx
import { usePageContext } from "../hooks/usePageContext";

export function PageContext() {
  const { context, isContextEnabled, toggleContext } = usePageContext();

  if (!context) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-donny-teal/[0.08] border-b border-donny-border">
      {/* Favicon */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${new URL(context.url).hostname}&sz=32`}
        alt=""
        className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />

      {/* Page info */}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-donny-text/70 truncate">
          {context.title || "Untitled page"}
        </div>
        <div className="text-[10px] text-donny-text/35 truncate">
          {context.url}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={toggleContext}
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
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/PageContext.tsx
git commit -m "feat: add context toggle and favicon to PageContext banner"
```

---

## Task 6: Upgrade QuickActions Component

**Files:**
- Modify: `src/sidepanel/components/QuickActions.tsx`

Change from full-screen vertical buttons to horizontal scrollable chip row. Context-aware prompts.

- [ ] **Step 1: Replace QuickActions.tsx**

Replace the full file with:

```tsx
// src/sidepanel/components/QuickActions.tsx

interface QuickActionsProps {
  onAction: (prompt: string) => void;
  pageTitle?: string;
  pageUrl?: string;
  contextEnabled?: boolean;
}

const actions = [
  {
    label: "Generate Campaign",
    prompt: (title?: string) =>
      title ? `Generate a campaign brief for ${title}` : "Generate a campaign brief",
    useTitle: true,
  },
  {
    label: "Find Creators",
    prompt: () => "Find creators that would be a good fit for my brand",
    useTitle: false,
  },
  {
    label: "Check Analytics",
    prompt: () => "Check my campaign analytics",
    useTitle: false,
  },
  {
    label: "Campaign Brief",
    prompt: (_title?: string, url?: string) =>
      url ? `Help me write a campaign brief for ${url}` : "Help me write a campaign brief",
    useUrl: true,
  },
];

export function QuickActions({
  onAction,
  pageTitle,
  pageUrl,
  contextEnabled,
}: QuickActionsProps) {
  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-none">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() =>
            onAction(
              action.prompt(
                contextEnabled ? pageTitle : undefined,
                contextEnabled ? pageUrl : undefined
              )
            )
          }
          className="whitespace-nowrap px-3.5 py-1.5 rounded-full border border-donny-teal/40 text-donny-teal text-xs font-medium hover:bg-donny-teal hover:text-donny-bg transition-colors flex-shrink-0"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build may show errors in `App.tsx` because the old `QuickActions` prop interface (`onStartChat`) no longer matches. This is expected — App.tsx will be updated in Task 8. The component itself should compile.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/QuickActions.tsx
git commit -m "feat: convert QuickActions to horizontal chip row with context-aware prompts"
```

---

## Task 7: Upgrade ChatInterface Component

**Files:**
- Modify: `src/sidepanel/components/ChatInterface.tsx`

Add avatars, auto-scroll, MessageContent rendering, TypingIndicator, QuickActions integration, error display, welcome message.

**Important:** ChatInterface does NOT call `useDonnyAPI()` itself. The hook is called once in `App.tsx` (Task 8) and the API state is passed down as props. This prevents split state between two hook instances.

**Key references:**
- `MessageContent.tsx` — created in Task 1
- `TypingIndicator.tsx` — created in Task 2
- `QuickActions.tsx` — updated in Task 6, prop interface: `{ onAction, pageTitle?, pageUrl?, contextEnabled? }`
- `useDonnyAPI.ts` — updated in Task 4, returns `{ messages, isLoading, error, sendMessage, clearConversation, retryLast }`
- `UserProfile` from `@/utils/storage` — `{ id, display_name, avatar_url, email, role }`

- [ ] **Step 1: Replace ChatInterface.tsx**

Replace the full file with:

```tsx
// src/sidepanel/components/ChatInterface.tsx
import { useEffect, useRef, useState } from "react";
import { MessageContent } from "./MessageContent";
import { TypingIndicator } from "./TypingIndicator";
import { QuickActions } from "./QuickActions";
import type { UserProfile } from "@/utils/storage";
import type { ChatMessage } from "@/utils/api";
import type { PageContext } from "../hooks/usePageContext";

interface PageContextForAPI {
  url: string;
  title: string;
  platform: string;
}

interface ChatInterfaceProps {
  user: UserProfile | null;
  pageContext: PageContext | null;
  isContextEnabled: boolean;
  messages: (ChatMessage & { local?: boolean })[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, pageContext?: PageContextForAPI | null) => void;
  retryLast: (pageContext?: PageContextForAPI | null) => void;
}

function UserAvatar({ user }: { user: UserProfile | null }) {
  const initials = user?.display_name
    ? user.display_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
        className="w-7 h-7 rounded-full flex-shrink-0 object-cover"
      />
    );
  }

  return (
    <div className="w-7 h-7 rounded-full bg-donny-pink flex items-center justify-center text-donny-bg font-semibold text-[10px] flex-shrink-0">
      {initials}
    </div>
  );
}

export function ChatInterface({
  user,
  pageContext,
  isContextEnabled,
  messages,
  isLoading,
  error,
  sendMessage,
  retryLast,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function getPageContextForAPI() {
    if (!isContextEnabled || !pageContext) return null;
    return {
      url: pageContext.url,
      title: pageContext.title,
      platform: pageContext.platform,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage(trimmed, getPageContextForAPI());
    setInput("");
  }

  function handleQuickAction(prompt: string) {
    setInput(prompt);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex items-end gap-2 ${
              msg.role === "user" ? "flex-row-reverse" : ""
            }`}
          >
            {/* Avatar */}
            {msg.role === "assistant" ? (
              <div className="w-7 h-7 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-[10px] flex-shrink-0">
                D
              </div>
            ) : (
              <UserAvatar user={user} />
            )}

            {/* Bubble */}
            <div
              className={`max-w-[75%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-donny-pink text-donny-bg rounded-2xl rounded-br-sm"
                  : "bg-donny-teal text-donny-bg rounded-2xl rounded-bl-sm"
              }`}
            >
              <MessageContent content={msg.content} />
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && <TypingIndicator />}

        {/* Error display */}
        {error && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 flex-shrink-0" />
            <div className="max-w-[75%] px-3.5 py-2.5 text-[13px] bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl rounded-bl-sm">
              <p>{error}</p>
              <button
                onClick={() => retryLast(getPageContextForAPI())}
                className="mt-1.5 text-xs text-red-400 hover:text-red-300 underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      <QuickActions
        onAction={handleQuickAction}
        pageTitle={pageContext?.title}
        pageUrl={pageContext?.url}
        contextEnabled={isContextEnabled}
      />

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="px-4 py-2 border-t border-donny-border flex gap-2 items-center"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Donny anything..."
          className="flex-1 bg-donny-surface border border-donny-border rounded-full px-4 py-2.5 text-[13px] text-donny-text placeholder-donny-text/40 focus:outline-none focus:border-donny-teal transition-colors"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-9 h-9 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
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

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build may fail because `App.tsx` still passes the old `initialPrompt` prop. This is expected — fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/components/ChatInterface.tsx
git commit -m "feat: upgrade ChatInterface with avatars, markdown, typing indicator, and error display"
```

---

## Task 8: Upgrade App.tsx

**Files:**
- Modify: `src/sidepanel/App.tsx`

Remove landing screen pattern. Always show chat. Header with "Donny" name, user avatar, dropdown menu with "New conversation" and "Sign out".

**Important:** `App.tsx` is the single owner of `useDonnyAPI()`. It passes the hook's return values down to `ChatInterface` as props. This prevents split state from two hook instances.

**Key references:**
- `useAuth` returns `{ isAuthenticated, isLoading, error, user, login, logout }`
- `usePageContext` now returns `{ context, isContextEnabled, toggleContext, refresh }`
- `useDonnyAPI` now returns `{ messages, isLoading, error, sendMessage, clearConversation, retryLast }`
- `ChatInterface` now expects `{ user, pageContext, isContextEnabled, messages, isLoading, error, sendMessage, retryLast }`

- [ ] **Step 1: Replace App.tsx**

Replace the full file with:

```tsx
// src/sidepanel/App.tsx
import { useCallback, useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { ChatInterface } from "./components/ChatInterface";
import { PageContext } from "./components/PageContext";
import { useAuth } from "./hooks/useAuth";
import { usePageContext } from "./hooks/usePageContext";
import { useDonnyAPI } from "./hooks/useDonnyAPI";

function DropdownMenu({
  onNewConversation,
  onSignOut,
  onClose,
}: {
  onNewConversation: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      {/* Menu */}
      <div
        ref={menuRef}
        className="absolute right-0 top-full mt-1 bg-donny-surface border border-donny-border rounded-lg shadow-lg py-1 z-20 min-w-[160px]"
      >
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
  const { context, isContextEnabled } = usePageContext();
  const donnyAPI = useDonnyAPI();
  const { clearConversation } = donnyAPI;
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNewConversation = useCallback(() => {
    clearConversation();
  }, [clearConversation]);

  // Mount loading — neutral indicator while checking stored tokens
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
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-donny-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-donny-teal flex items-center justify-center text-donny-bg font-bold text-sm">
            D
          </div>
          <span className="font-bold text-donny-text text-sm">Donny</span>
        </div>

        {/* User avatar + menu */}
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

      {/* Page Context */}
      <PageContext />

      {/* Chat */}
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

- [ ] **Step 2: Verify build**

```bash
cd C:/GIT/donny-chrome-extension && npm run build
```

Expected: Build succeeds with no errors. All components now have matching prop interfaces.

- [ ] **Step 3: Commit**

```bash
git add src/sidepanel/App.tsx
git commit -m "feat: upgrade App with header redesign, dropdown menu, always-on chat"
```

---

## Task 9: Final Build Verification & Integration Test

**Files:** None (verification only)

- [ ] **Step 1: Full clean build**

```bash
cd C:/GIT/donny-chrome-extension && rm -rf dist && npm run build
```

Expected: Build succeeds. Output shows the side panel bundle and all entry points.

- [ ] **Step 2: Check for TypeScript errors**

```bash
cd C:/GIT/donny-chrome-extension && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Verify all files are committed**

```bash
cd C:/GIT/donny-chrome-extension && git status
```

Expected: Clean working tree, nothing uncommitted.

- [ ] **Step 4: Manual verification checklist**

Load the extension in Chrome (`chrome://extensions` → Load unpacked → select `dist/` folder):

1. Click extension icon → side panel opens
2. If not authenticated → AuthScreen shows with "Connect with DragonCandy" button
3. If authenticated → Header shows "Donny" + user avatar + dropdown
4. PageContext banner shows current tab's title/URL with toggle
5. Welcome message from Donny appears in chat
6. Quick action chips visible above input: "Generate Campaign", "Find Creators", "Check Analytics", "Campaign Brief"
7. Clicking a chip pre-fills the input (does not auto-send)
8. Typing a message and pressing Enter/Send sends to API
9. Donny's response appears in teal bubble with "D" avatar
10. User's message appears in pink bubble with initials/photo avatar
11. Typing indicator (animated dots) shows while waiting for response
12. Toggling page context OFF/ON persists across panel close/reopen
13. Messages persist across panel close/reopen
14. "New conversation" from dropdown clears messages, shows welcome again
15. "Sign out" from dropdown returns to AuthScreen
