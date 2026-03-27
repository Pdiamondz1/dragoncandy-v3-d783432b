# Donny Chat Interface — Chrome Extension Side Panel

**Date:** 2026-03-27
**Status:** Draft
**Scope:** Upgrade existing scaffold components in the Donny Chrome Extension to a fully functional chat interface with live API integration, conversation persistence, and page context awareness.

---

## Overview

The Donny Chrome Extension has a working OAuth PKCE flow and scaffold UI components. This spec covers upgrading those components into a production chat experience where users talk to Donny (powered by the `donny-chat` Supabase edge function with 21 Anthropic tools) from any webpage.

**What exists today:**
- `ChatInterface.tsx` — basic message list + input with placeholder API
- `QuickActions.tsx` — full-screen vertical action buttons (landing screen)
- `PageContext.tsx` — read-only platform badge
- `useDonnyAPI.ts` — placeholder setTimeout responses
- `usePageContext.ts` — tab context via chrome messaging
- `App.tsx` — auth gate with QuickActions-as-landing → ChatInterface flow

**What changes:**
- All six files above are upgraded in place
- Two new components extracted: `MessageContent.tsx`, `TypingIndicator.tsx`
- No changes to OAuth flow, background service worker, or content script

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API pattern | Request/response | Simplest; architecture ready for streaming later |
| Conversation persistence | `chrome.storage.local` | Self-contained, no backend changes. Server-side `conversation_id` tracked locally for context continuity |
| Page context UX | Single toggle in PageContext banner | One control, one behavior. No separate "attach context" button |
| Markdown rendering | Minimal regex renderer in `MessageContent` wrapper | Keeps bundle small; swap to `react-markdown` later is a one-line change |
| QuickActions behavior | Pre-fill input, don't auto-send | Lets user edit prompt before sending |
| Donny's name | "Donny" (not "Donny AI") | Per user preference |

---

## Component Architecture

### Files Modified

#### `App.tsx`
- Remove QuickActions-as-landing screen pattern
- Always show ChatInterface (with QuickActions inline as chips)
- Header: DC logo (left), "Donny" title (center-left), user avatar with initials fallback + overflow dropdown menu (right)
- Overflow menu contains: "New conversation", "Sign out"
- Pass page context and user profile down to ChatInterface

#### `ChatInterface.tsx`
- Message list with Donny (teal bubbles, left-aligned) and user (pink bubbles, right-aligned)
- Donny's avatar: 28px teal circle with "D" (matching existing DC logo style)
- User's avatar: 28px pink circle with initials from profile, or profile photo if `avatar_url` exists
- Auto-scroll to bottom on new messages using `useRef` + `scrollIntoView`
- Renders `TypingIndicator` when `isLoading` is true
- Renders `QuickActions` chip row above the input area
- Input area: text field with teal border on focus + send button
- On send: calls `useDonnyAPI.sendMessage()` with page context if enabled
- Welcome message from Donny on first open (local-only, not sent to API)
- Inline error display below last message with "Retry" button on failure

#### `QuickActions.tsx`
- Horizontal scrollable row of pill-shaped action chips
- Four actions: "Generate Campaign", "Find Creators", "Check Analytics", "Campaign Brief"
- Tapping a chip pre-fills the chat input (does not auto-send)
- Context-aware prompts: if page context is enabled, actions include page title/URL in the pre-filled text
- Styled as ghost pills with teal border, teal fill on hover

| Action | Pre-fill (context ON) | Pre-fill (context OFF) |
|--------|----------------------|----------------------|
| Generate Campaign | `Generate a campaign brief for {page title}` | `Generate a campaign brief` |
| Find Creators | `Find creators that would be a good fit for my brand` | (same) |
| Check Analytics | `Check my campaign analytics` | (same) |
| Campaign Brief | `Help me write a campaign brief for {page URL}` | `Help me write a campaign brief` |

#### `PageContext.tsx`
- Collapsible banner at top of chat showing current page context
- Shows: favicon (14px, rounded) + page title + truncated URL
- Toggle: "Donny can see this page" ON/OFF (pill-shaped toggle switch)
- Subtle teal-tinted background (`rgba(77,217,192,0.08)`)
- Toggle state persisted in `chrome.storage.local` via `usePageContext`
- 11-12px text, compact layout

#### `useDonnyAPI.ts`
- Replace placeholder setTimeout with real `sendChatMessage()` from `utils/api.ts`
- Track `conversation_id` from API responses, send it back on subsequent messages
- Persist messages + conversation_id to `chrome.storage.local` after each exchange
- Load persisted messages on mount
- Handle `AuthExpiredError` by clearing state (App.tsx auth gate handles redirect)
- Handle network/API errors with inline error state
- Expose: `{ messages, isLoading, error, sendMessage, clearConversation, retryLast }`
- `clearConversation`: resets messages, clears conversation_id, clears storage
- `retryLast`: re-sends the last user message after an error

#### `usePageContext.ts`
- Add `isContextEnabled` boolean state, persisted in `chrome.storage.local`
- Add `toggleContext()` function to flip the toggle
- Load persisted toggle state on mount (default: ON)
- Existing tab change listeners remain unchanged
- Expose: `{ context, isContextEnabled, toggleContext, refresh }`

### Files Created

#### `components/MessageContent.tsx`
```typescript
interface MessageContentProps {
  content: string;
}
```
- Parses minimal markdown: `**bold**`, `*italic*`, `[text](url)`, `- list items`, newlines → `<br>`
- Links render with `target="_blank" rel="noopener noreferrer"`
- Returns React elements (no `dangerouslySetInnerHTML`)
- Swap path: replace regex renderer body with `<ReactMarkdown>{content}</ReactMarkdown>`

#### `components/TypingIndicator.tsx`
- Three 6px teal dots with staggered `animation-delay` (0ms, 150ms, 300ms)
- CSS `@keyframes donny-pulse` oscillates opacity 0.3 → 1.0
- Wrapped in same bubble shape as Donny's messages, with Donny's avatar alongside
- Self-contained: all styles via Tailwind + inline keyframes

---

## Data Flow

### Chat Message Lifecycle

```
User types → hits send (or presses Enter)
  → useDonnyAPI adds { role: "user", content } to messages state
  → sets isLoading = true, clears error
  → calls sendChatMessage({
      message,
      conversation_id,          // from previous response or null
      context_url,              // if page context enabled
      context_metadata          // { platform, title } if enabled
    })
  → on success:
      → adds { role: "assistant", content: reply } to messages
      → stores conversation_id from response
      → persists messages + conversation_id to chrome.storage.local
      → sets isLoading = false
  → on AuthExpiredError:
      → clears local state (auth gate handles redirect)
  → on other error:
      → sets error message
      → sets isLoading = false
      → user sees inline error + "Retry" button
```

### Conversation Persistence

| Storage Key | Type | Purpose |
|-------------|------|---------|
| `donny_messages` | `ChatMessage[]` | Message history (user + assistant) |
| `donny_conversation_id` | `string \| null` | Server-side conversation thread |
| `donny_context_enabled` | `boolean` | Page context toggle state |

- Messages loaded from storage on hook mount
- Saved after each successful exchange
- "New conversation" clears messages + conversation_id (not context toggle)
- Logout clears everything (existing `clearTokens` in storage.ts)

### Message Types

```typescript
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  local?: boolean;  // true for welcome message, excluded from API history
}
```

### Welcome Message

On first open (no persisted messages), a local-only message appears:

> "Hey! I'm Donny, your DragonCandy assistant. Ask me anything about campaigns, creators, or analytics — or tap a quick action below to get started."

This message has `local: true` and is not sent to the API or persisted.

---

## Visual Design

### Color System (existing Tailwind tokens)

| Element | Color | Token |
|---------|-------|-------|
| Background | `#0a0a1a` | `donny-bg` |
| Surface/cards | `#1a1a2e` | `donny-surface` |
| Borders | `#2a2a3e` | `donny-border` |
| Text | `#f0f0f0` | `donny-text` |
| Donny bubbles | `#4DD9C0` | `donny-teal` |
| User bubbles | `#F9A8D4` | `donny-pink` |
| Bubble text | `#0a0a1a` | `donny-bg` (dark text on colored bubbles) |

### Layout (top to bottom)

1. **Header** (48px): Logo + "Donny" + user avatar + menu
2. **Page Context** (~36px): Favicon + title + URL + toggle
3. **Messages** (flex-1, scrollable): Bubble list with avatars
4. **Quick Actions** (~40px): Horizontal scrollable chips
5. **Input** (~56px): Text field + send button

### Typography

- Body text: 13px
- Metadata/timestamps: 11px
- Quick action chips: 12px
- System fonts (existing config)

### Animations

- Messages: no slide animation (keep it simple, avoid jank in side panel)
- Typing indicator: `@keyframes donny-pulse` with 1s cycle, staggered delays
- Auto-scroll: `scrollIntoView({ behavior: 'smooth' })`

---

## Boundaries & Constraints

### DO NOT modify:
- `src/background/service-worker.ts`
- `src/content/content-script.ts`
- `src/sidepanel/hooks/useAuth.ts`
- `src/sidepanel/components/AuthScreen.tsx`
- `src/oauth/callback.html`
- `src/utils/storage.ts` (except adding conversation storage keys)
- `src/utils/api.ts` (already has `sendChatMessage`)
- `src/utils/constants.ts`

### Dependencies:
- No new npm packages
- Minimal markdown renderer is hand-rolled (~30 lines)
- All styling via existing Tailwind tokens

### Build verification:
- `npm run build` must pass
- Extension loads in Chrome dev mode
- Side panel shows auth screen (unauthenticated) or chat interface (authenticated)
