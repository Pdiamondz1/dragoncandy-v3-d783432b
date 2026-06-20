# Session: Donny chat — expanding input + message timestamps (PR #140)

**Date:** 2026-06-20
**Branch:** worktree-DC-AIOS-Donny4 → main (PR #140, squash-merged)
**Prompted by:** Founder report on the Internal AIOS Donny page (`/internal/donny`):
"when typing into the prompt with Donny, I cannot see what I'm typing after
exceeding the prompt bar" + "we would like to timestamp the queries/messages with
the date and time."

## What shipped

Two UX fixes to the **shared** Donny chat components, applied to **both** Donny
surfaces (the founder chose "both surfaces"):
- the **consumer-facing Donny** chat panel (`DonnyChatView.tsx`, seen by all app
  users via the desktop panel / mobile sheet), and
- the **internal AIOS Donny** page (`InternalDonny.tsx`, admin-only `/internal/donny`).

### 1. Expanding, readable prompt input
`src/components/donny/DonnyChatInput.tsx` — the prompt bar was a single-line
`<input type="text">`, so once a message exceeded the bar width the text scrolled
horizontally off-screen and the founder couldn't read what they'd typed. Replaced
with an **auto-growing `<textarea>`**:
- `rows={1}`, `min-h-[36px] max-h-[160px]`, `resize-none`; a `useRef` + a `useEffect`
  on `value` sets `height='auto'` then `height = min(scrollHeight, 160)px`, so it
  grows line-by-line and only scrolls internally past ~160px (caret stays visible).
- **Enter** submits; **Shift+Enter** inserts a newline (`onKeyDown`).
- Form switched `items-center` → `items-end` so the +/Send buttons stay
  bottom-aligned as the textarea grows.
- Props/signature unchanged (`onSubmit(trimmed)`, `disabled`) — no caller change.
- Pattern reused from the existing `src/components/messages/MessageInputEnhanced.tsx`
  (the messaging composer already did auto-size + Enter/Shift+Enter).

### 2. Message timestamps + date dividers
Each message already carried a `created_at` ISO field (`src/types/donny.ts`); it was
just never rendered.
- New `src/components/donny/donnyTime.ts` — pure helpers: `formatBubbleTime` →
  `2:34 PM`; `formatDateDivider` → `Today`/`Yesterday`/`Jun 20, 2026`; `isSameDay`;
  and `startsNewDayGroup(messages, index)` which compares against the previous
  **visible** message (see gotcha).
- New `src/components/donny/DonnyDateDivider.tsx` — a centered **brand-teal chip**
  (`text-dc-teal bg-dc-teal/12 rounded-full`).
- `DonnyMessage.tsx` — a small time line **inside** each bubble: user (teal bubble)
  `text-white/60` right-aligned; assistant (pink bubble) `text-dc-text/50`.
- `DonnyChatView.tsx` + `InternalDonny.tsx` — insert `<DonnyDateDivider>` in the
  render loop when `startsNewDayGroup` is true.

## Key decisions

- **Time goes inside the bubbles, divider is teal.** The "both surfaces" choice is
  what forced this: the consumer Donny renders on a **light** background while the
  internal Donny is the **dark** "ops-deck" theme. Any timestamp text rendered
  *outside* the bubbles would be illegible on one of them. Putting the time inside
  the teal/pink bubbles (and using a teal divider chip) reads on both — and the teal
  chip also satisfies the project's "never use gray" design rule.
- **No backend/schema change** — `created_at` already exists on every message.
- **Format:** time-on-bubble with a date-divider row (founder's pick over
  full-date-per-message or time-only).

## Gotchas

- **Tool messages break naive day-grouping.** `DonnyMessage` returns `null` for
  `role === 'tool'` rows (tool-call/tool-result turns). Codex (the required second
  review) flagged that comparing a message's date against `messages[i-1]` can compare
  against a hidden tool row, so the first *visible* message of a new day gets no
  divider when a tool row precedes it (tool-using turns crossing midnight, or
  histories starting with tool rows). Fix: `startsNewDayGroup` walks back to the
  previous **non-tool** message before comparing. This was the only Codex finding (P2);
  re-ran Codex clean after the fix.
- **The consumer desktop panel home composer is a *different* input.** The
  `DonnyDesktopPanel` landing/home tray uses its own `#donny-tray-input` (an
  `<input>`, untouched here). The modified `#donny-chat-input` textarea (and the
  `DonnyMessage` bubbles) only mount once a conversation is open — i.e. after the
  first message. Prod verification of the consumer chat view therefore required
  sending one message to enter the thread.
- **CI didn't re-fire on the merge commit.** After merging `origin/main` into the
  branch to satisfy the strict "up to date" branch protection, GitHub did not create
  a new `pull_request` run for the required `verify` check, so the PR stayed BLOCKED.
  An empty commit re-triggered CI; `verify` + `smoke` then passed and it merged.
- **`browser-use` device emulation resets on navigation.** `Emulation.setDeviceMetricsOverride`
  applied before `browser-use open` did not stick (innerWidth stayed 1920); re-applying
  it on the already-loaded page worked (innerWidth → 390), and `Page.captureScreenshot`
  (CDP) respects the override where the CLI `screenshot` did not.

## Files

- Modified: `src/components/donny/DonnyChatInput.tsx`,
  `src/components/donny/DonnyMessage.tsx`, `src/components/donny/DonnyChatView.tsx`,
  `src/pages/internal/InternalDonny.tsx`
- New: `src/components/donny/donnyTime.ts`, `src/components/donny/DonnyDateDivider.tsx`

## Verification

- `npm run typecheck` / `npm run build` / ESLint (changed files) clean; Codex second
  review clean after the divider fix.
- Prod (dragoncandy.io, bundle `index-CCa8TTny.js`), logged in as the founder account:
  - Internal Donny desktop + mobile (390px): textarea grew and showed the full
    244-char message (`fullyShown:true`); 52 bubble times + 6 date dividers
    (`Jun 11, 2026` … `Today`); **0 console errors**.
  - Consumer Donny chat view: `TEXTAREA` input, times rendering on messages; **0
    console errors**.
