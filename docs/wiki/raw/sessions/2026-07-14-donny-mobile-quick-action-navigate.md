# Session: Donny mobile chat action buttons look dead (close sheet on navigate + retryable brief handoff)

**Date:** 2026-07-14
**Branch:** `fix/donny-mobile-quick-action-navigate` (worktree donny-chat-1)

## Symptom (founder report, mobile screenshots)

"When using Donny in chat the prompts provided are not clickable… not functioning."
Screenshots showed the Donny mobile chat with the "Open campaign builder" quick-action
and the quick chips circled, then a toast: `Generation failed: Failed to send a request
to the Edge Function`.

## Root cause (two stacked defects, neither was "buttons don't click")

1. **Fullscreen sheet swallows navigation.** On mobile, `DonnyMobileSheet` renders
   `DonnyChatView` as a fullscreen `fixed inset-0 z-[61]` overlay. A `navigate`
   quick-action in `DonnyMessage` called `navigate(url)` but never closed the sheet —
   the route changed **behind** the overlay, so visually nothing happened and the
   buttons read as dead. (Desktop is a docked 420px side panel, so the same code is
   fine there.)
2. **Long non-streaming fetch dropped by the mobile browser.** The builder's `?brief=`
   handoff auto-invoked `donny-campaign-generate` (~40–60s, non-streaming, ~3k output
   tokens on Sonnet). The mobile browser dropped the fetch (same "Load failed" family
   as the donny-chat 504/streaming work, PRs #148/#151), surfacing supabase-js's
   `FunctionsFetchError` jargon. **Server-side evidence:** `donny_cost_ledger` shows the
   generation completing at 14:37:20 UTC — the exact minute of the failure toast. The
   fetch died client-side while the server finished.

## Fix (frontend only, no schema/edge change)

- `DonnyMessage`: on a `navigate` quick-action, close the Donny overlay when the
  viewport is mobile (`max-width: 767px`, the sheet's `md:hidden` breakpoint) so the
  destination page is visible. Desktop panel unchanged.
- `useCampaignCreator`: exported pure `describeGenerationError()` maps
  `FunctionsFetchError` → "The connection dropped mid-generation — tap Generate to try
  again." (other errors keep the edge body / message).
- `CampaignCreator`/`DropScreen`: seed the Donny-chat brief into the SmartInput
  (text mode only) via a `prefillValue` prop, so the brief is visible while generating
  and a failed run is retryable in one tap. Codex P2: last-writer-wins — a new brief
  clears a previously selected carousel prompt (`externalValue`), else a failed handoff
  would retry stale carousel text.

Tests: `DonnyMessage.test.tsx` (mobile close / desktop keep-open / dismiss),
`useCampaignCreator.test.ts` (error mapping), `DropScreen.test.tsx` (prefill precedence).
Codex second review clean after the one P2.

## Durable lessons

- **A fullscreen mobile overlay must close (or collapse) before an in-app `navigate()`**
  — otherwise the action "does nothing" from the user's perspective. Sibling of the
  fixed-overlay-transform-portal gotcha (PR #224): overlays have repeatedly been the
  real cause of "button doesn't work" reports.
- The durable fix for the dropped generation fetch is streaming/keepalive on
  `donny-campaign-generate` (the PR #148 NDJSON pattern) — deferred, documented here.
- Perceived "not clickable" ≠ pointer bug: the ledger + toast proved the whole chain
  fired invisibly.
