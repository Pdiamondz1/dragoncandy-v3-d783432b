# Donny first-open tray — close-trap fix + branded redesign (PR #258, 2026-07-16)

## The report

Founder screenshots (desktop Chrome, macOS): when a user **first** opens Donny, they
cannot exit the window. A close ✕ only appears *after* they send a message and Donny
replies.

## Root cause

The Donny panel is a **3-stage state machine** — `closed → tray → chat` (`DonnyStage` in
`src/types/donnyNudge.ts`, held in `DonnyProvider`). The two open stages rendered **two
different headers**:

- `stage === 'tray'` (first open) → `DonnyTray.tsx`, which rendered its **own** inline
  header (avatar + "Donny" + unread badge) and never even destructured `close` from
  context → **no ✕, no dismiss control**.
- `stage === 'chat'` → `DonnyChatView.tsx` → `DonnyChatHeader.tsx`, the only header with
  ✕ (close) + ⌄ (minimize).

Sending a message / focusing the tray input calls `expand()` → flips `tray → chat`, which
is the *only* reason the ✕ ever appeared. On **desktop** the tray had no backdrop either —
`DonnyDesktopPanel` had only an Escape handler — so an undiscoverable Escape key was the
sole exit. (Mobile's `DonnyMobileSheet` had backdrop-tap + swipe-down + Escape, but still
no visible ✕.)

## The fix (frontend only, both viewports)

Brainstormed to a **"Branded & inviting"** direction (vs a minimal patch), then:

1. **New shared `DonnyPanelHeader.tsx`** (teal gradient, matching the chat header) used by
   **both** stages: tray gets **⌃ expand + ✕ close**; chat gets **⌄ minimize + ✕ close**;
   optional unread badge. **Deleted `DonnyChatHeader.tsx`** (folded into the shared
   component). Tray→chat is now visually continuous, and the tray always has a real close.
2. **`DonnyTray.tsx` redesign** — uses the shared header (wires `close`); replaced the flat
   gray "All caught up! No new notifications." with an inviting **"🎉 You're all caught up!
   Pick a quick action below, or ask me anything."**; two **labeled** chip groups ("Help on
   this page" + a new **"Quick actions"** label), brand-colored (no gray); de-grayed
   throughout. **Chip data/logic unchanged** (`getSuggestionsForPage`, `useDonnyQuickChips`).
3. **Desktop close-on-outside-click** in `DonnyDesktopPanel.tsx` — a `pointerdown`
   document listener that closes when the click is outside the panel `ref`, **gated
   desktop-only via `useIsMobile()`** (the panel is only CSS-hidden `hidden md:flex`, not
   unmounted, on mobile — an ungated listener would close Donny on unrelated mobile taps),
   and **excluding `[data-donny-launcher]`** so the launcher toggle doesn't fight it.
   Escape preserved; mobile keeps its existing backdrop/swipe.
4. **`data-donny-launcher`** attribute added to the two launchers (the desktop header Donny
   button in `DashboardLayout.tsx`, and `DonnyNavButton.tsx`).
5. **`DonnyTrayInput.tsx`** de-grayed to brand tones (`bg-dc-teal/5`, `text-dc-text`,
   `border-dc-teal/15`); kept the dark send button per the [[Design System]] and the
   readOnly expand-on-focus behavior.

## Key decisions / gotchas

- **Rebased onto main's fixed-overlay layout.** Main had advanced (PR #236) and changed
  `DonnyDesktopPanel` to a `fixed inset-y-0 right-0 z-40 shadow-2xl` overlay. My edit was
  based on the older docked (`flex-shrink-0`) version, so a naive apply would have reverted
  #236. Caught it by diffing my base vs `origin/main` before building the branch tree —
  kept main's overlay className, added only my `ref` + click-outside effect. (See the
  desktop-overlay §4 on [[Mobile Viewport & Fixed Positioning]].)
- **The two headers were the bug, not a boolean.** There was no `{hasMessages && <Close/>}`
  ternary to flip — the fix was structural (unify the headers), which is why the whole
  redesign rode along cleanly.
- **Worktree hygiene:** this worktree also held an unrelated task's in-progress work
  (`fix/mobile-bottom-nav-overscroll-portal` + a 67-line uncommitted wiki doc edit). Set it
  aside by committing the doc to *its* branch, then authored this work on a clean branch off
  `origin/main`.
- **Deploy detector caveat:** the change is a **code-split dashboard chunk**, so the entry
  `index-*.js` hash did **not** change after merge — the bundle-hash poll was the wrong
  detector. Deploy-live was confirmed via the **Vercel deployment `success` status on the
  exact merge commit** + the app's own "new version available" banner + the live new UI.
- **Auth verify constraint:** could not type the test-account password (hard safety rule) —
  the founder signed in on the driven Chrome, then the tray checks were driven live.

## Verification

- `typecheck` / `build` / `lint` (0 errors) / Donny tests (3/3) clean. **Codex second review
  clean**, no findings.
- **Live-verified on prod** (restaurant/Harbormill dashboard): first-open tray shows the
  teal header with ✕ + ⌃, the inviting empty state, and the "Quick actions" group; **✕
  closes**, **click-outside closes**, launcher toggles cleanly; **0 console errors**.
- Mobile viewport not independently exercised (the browser-automation renderer captures at a
  fixed ~1568px and ignored the resize to phone width) — the mobile tray reuses the
  identical shared `DonnyPanelHeader`, so the ✕ is structurally guaranteed; recommended a
  manual phone spot-check.

## Files

- New: `src/components/donny/DonnyPanelHeader.tsx`
- Deleted: `src/components/donny/DonnyChatHeader.tsx`
- Edited: `DonnyTray.tsx`, `DonnyChatView.tsx`, `DonnyDesktopPanel.tsx`, `DonnyTrayInput.tsx`,
  `DonnyNavButton.tsx`, `src/components/DashboardLayout.tsx`

PR #258 (merged, squash `20de8a3b`). No schema / edge-function / secret change.
