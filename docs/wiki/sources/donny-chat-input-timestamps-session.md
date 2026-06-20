---
title: Donny Chat Input & Timestamps Session
type: source
created: 2026-06-20
updated: 2026-06-20
sources: [raw/sessions/2026-06-20-donny-chat-input-timestamps.md]
tags: [donny, chat, ux, frontend, design-system, pr-140]
---

# Donny Chat Input & Timestamps Session

Founder-reported UX fix to the **shared** Donny chat components, shipped to **both**
Donny surfaces (consumer chat panel + internal AIOS `/internal/donny`) in **PR #140**
(2026-06-20). Two changes: a readable expanding prompt input, and per-message
timestamps with date dividers.

## Key claims

- The prompt bar was a single-line `<input type="text">` (`DonnyChatInput.tsx`); past
  the bar width the text scrolled off-screen and was unreadable. Replaced with an
  **auto-growing `<textarea>`** (Enter sends, Shift+Enter newline; grows to `max-h-160px`
  then scrolls internally). Pattern reused from the messaging composer
  `MessageInputEnhanced.tsx`.
- Each message already carried `created_at`; it was never rendered. Added a **time
  inside each bubble** (`2:34 PM`) plus a **teal date-divider chip**
  (`Today`/`Yesterday`/`Jun 20, 2026`) between days, via new `donnyTime.ts` helpers and
  `DonnyDateDivider.tsx`.
- **Cross-surface light/dark constraint drove the design.** Consumer Donny is on a light
  background, internal Donny on the dark ops-deck theme; timestamp text outside the
  bubbles would be illegible on one. Solution: time *inside* the teal/pink bubbles +
  a teal divider chip — legible on both, and the teal avoids the "never use gray" rule.
- No backend/schema change — `created_at` pre-existed on every message.

## Gotchas (full detail in the concept page)

- Hidden `role:'tool'` rows broke naive day-grouping; Codex (required second review)
  flagged it (the only finding, P2). Fixed with `startsNewDayGroup` comparing against the
  previous **visible** message.
- The consumer desktop panel **home tray** uses a *separate* `#donny-tray-input`; the
  modified `#donny-chat-input` textarea only mounts inside an open conversation.
- `browser-use` CDP device emulation resets on navigation; re-apply after load and use
  `Page.captureScreenshot`.

## See Also

- [[Donny Chat UX]]
- [[Donny AI]]
- [[Design System]]
- [[Codex Second Review]]
