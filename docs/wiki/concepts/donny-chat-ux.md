---
title: Donny Chat UX
type: concept
created: 2026-06-20
updated: 2026-07-16
sources: [raw/sessions/2026-06-20-donny-chat-input-timestamps.md, raw/sessions/2026-07-14-donny-mobile-quick-action-navigate.md, raw/sessions/2026-07-16-donny-tray-close-ux.md]
tags: [donny, chat, ux, frontend, design-system, shared-components]
---

# Donny Chat UX

How the Donny chat UI is rendered, and the constraints that come from it being a
**shared component set** used by two surfaces with **opposite background themes**.

## Shared components, two surfaces

The same components render in both places — so any change ships to both, and any
styling must work on both backgrounds:

| Surface | File | Background |
|---------|------|------------|
| Consumer Donny (all app users) | `DonnyChatView.tsx` (desktop panel / mobile sheet) | **light** (`bg-teal-50/30`, white) |
| Internal AIOS Donny (admin) | `pages/internal/InternalDonny.tsx` (`/internal/donny`) | **dark** ops-deck theme |

Shared building blocks: `DonnyChatInput` (the prompt bar), `DonnyMessage` (one bubble),
`DonnyDateDivider`, and the `donnyTime.ts` helpers. Both surfaces map over the same
`DonnyMessage` shape from `src/types/donny.ts` (`role`, `content`, `created_at`,
`tool_calls`, …).

## The light-vs-dark rule

**Anything that must read on both surfaces belongs *inside* a bubble or on its own
colored chip — never as bare text on the page background.** A muted gray/neutral that
reads on white is invisible on the dark page and vice-versa. Applied in PR #140:
- **Message time** renders *inside* each bubble — user (teal bubble) `text-white/60`;
  assistant (pink bubble) `text-dc-text/50`.
- **Date divider** is a **brand-teal chip** (`text-dc-teal bg-dc-teal/12 rounded-full`).
  Teal `#4DD9C0` reads on white and on dark, and using teal (not gray) also honors the
  [[Design System]] "never use gray backgrounds/badges" rule.

## Expanding prompt input (PR #140)

`DonnyChatInput` is an **auto-growing `<textarea>`** (was a single-line `<input>`, which
scrolled typed text off-screen). Pattern mirrors the messaging composer
`src/components/messages/MessageInputEnhanced.tsx`:
- `rows={1}`, `min-h-[36px] max-h-[160px] resize-none`; a `useEffect` on `value` sets
  `height='auto'` then `min(scrollHeight, 160)px` so it grows line-by-line, then scrolls
  internally (caret stays visible).
- **Enter** submits, **Shift+Enter** newline; form is `items-end` so the +/Send buttons
  stay bottom-aligned as it grows.

## Day-grouping with hidden tool rows

`DonnyMessage` returns `null` for `role === 'tool'` rows (tool-call/tool-result turns are
internal, not shown). So **date dividers must compare against the previous *visible*
message, not `messages[i-1]`** — otherwise a tool row sitting just before the first
message of a new day (a tool-using turn crossing midnight, or a history starting with a
tool row) suppresses the divider. The helper `startsNewDayGroup(messages, index)` walks
back past tool rows before comparing dates. (This was the [[Codex Second Review]] P2 catch
on PR #140.)

## Internal streaming (PR #148)

The **internal** AIOS surface streams its replies (the consumer surface still gets one
JSON response). `useInternalDonny` reads an NDJSON stream from `donny-chat` and drives a
**transient in-flight assistant bubble**: `status` events set a muted status line
("Reading the strategy library…") and `text` events append live. On `done` it clears the
transient bubble *after* the `donny_messages` query refetch resolves, so the persisted
message replaces it without a flicker. The transient bubble uses brand tokens (no gray)
and the same `DonnyAvatar` (with an `aria-label`). If the response isn't NDJSON the hook
falls back to `response.json()` (version-skew safety). The why and the server side are in
[[Edge Function Streaming]].

## Mobile sheet must close before in-app navigation

On mobile the chat is a **fullscreen** overlay (`DonnyMobileSheet`, `fixed inset-0
z-[61]`); on desktop it's a **docked** 420px side panel. A `navigate` quick-action in
`DonnyMessage` therefore **closes the Donny overlay first on mobile**
(`max-width: 767px`, matching the sheet's `md:hidden` breakpoint) — otherwise the route
changes *behind* the sheet and the button reads as dead (the founder's "prompts are not
clickable" report, 2026-07-14). Desktop keeps the panel open, since navigation is
visible beside it. General rule: **any fullscreen overlay must close/collapse before an
in-app `navigate()`** — overlays, not pointer events, have repeatedly been the real
cause of "button doesn't work" reports (see also the transform/portal gotcha on
`ApplyConfirmation`, PR #224).

## Two different inputs in the consumer panel

The consumer `DonnyDesktopPanel` **home/landing tray** has its own composer
`#donny-tray-input` (a plain `<input>`). The shared `#donny-chat-input` textarea and the
`DonnyMessage` bubbles only mount **inside an open conversation** (after the first
message). Relevant when testing/verifying: you must enter a thread to see the chat-view
components.

## Panel stages & the shared header (first-open close-trap, PR #258)

The consumer panel is a **3-stage machine** — `closed → tray → chat` (`DonnyStage` in
`src/types/donnyNudge.ts`, held in `DonnyProvider`; `open()`→tray, `expand()`→chat,
`collapse()`→tray, `close()`→closed). Both open stages now share **one** header,
`DonnyPanelHeader.tsx` (teal gradient):

- **tray** → `⌃ expand` + `✕ close` (+ optional unread badge)
- **chat** → `⌄ minimize` + `✕ close`

This unification fixed a **first-open close-trap**: the tray used to render its own inline
header with **no ✕ and no `close`** wired, so the ✕ existed only in the chat stage — users
were stuck until they sent a message (which `expand()`s to chat). The fix was *structural*
(one shared header), not a `{hasMessages && <Close/>}` toggle. `DonnyChatHeader.tsx` was
deleted and folded into `DonnyPanelHeader`.

**Desktop dismiss = ✕, Escape, or click-outside.** `DonnyDesktopPanel` adds a `pointerdown`
document listener that closes on a click outside the panel `ref`, **gated desktop-only via
`useIsMobile()`** — the panel is only CSS-hidden (`hidden md:flex`), *not* unmounted, on
mobile, so an ungated listener would close Donny on unrelated mobile taps — and it **ignores
`[data-donny-launcher]`** targets so the toggle launcher (the `DashboardLayout` header button
+ `DonnyNavButton`) doesn't fight it. Mobile keeps its own backdrop-tap + swipe-down
(`DonnyMobileSheet`); the desktop panel is a `fixed` overlay (see [[Mobile Viewport & Fixed
Positioning]] §4), so this edit rebased onto that layout rather than the older docked one.

**Branded tray, no gray.** The empty state leads with an inviting "🎉 You're all caught up!
Pick a quick action below…" (was a flat gray "No new notifications"), and the two chip groups
("Help on this page" + a new "Quick actions" label) + the `#donny-tray-input` are
brand-colored per the [[Design System]] no-gray rule. Chip *data* is unchanged
(`getSuggestionsForPage` + `useDonnyQuickChips`).

## See Also

- [[Donny AI]]
- [[Design System]]
- [[Mobile Viewport & Fixed Positioning]]
- [[Donny Tray Close UX Session]]
- [[Donny Chat Input & Timestamps Session]]
- [[Edge Function Streaming]]
- [[Codex Second Review]]
