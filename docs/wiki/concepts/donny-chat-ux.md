---
title: Donny Chat UX
type: concept
created: 2026-06-20
updated: 2026-06-20
sources: [raw/sessions/2026-06-20-donny-chat-input-timestamps.md]
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

## Two different inputs in the consumer panel

The consumer `DonnyDesktopPanel` **home/landing tray** has its own composer
`#donny-tray-input` (a plain `<input>`). The shared `#donny-chat-input` textarea and the
`DonnyMessage` bubbles only mount **inside an open conversation** (after the first
message). Relevant when testing/verifying: you must enter a thread to see the chat-view
components.

## See Also

- [[Donny AI]]
- [[Design System]]
- [[Donny Chat Input & Timestamps Session]]
- [[Codex Second Review]]
