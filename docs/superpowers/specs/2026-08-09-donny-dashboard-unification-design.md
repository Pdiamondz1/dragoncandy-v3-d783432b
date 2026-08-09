# Donny Dashboard Unification — Design

> Status: approved design, not yet planned or built.
> Date: 2026-08-09 · Author: Claude Code with Dame Williams
> Visual design record: two published artifacts (launcher options; inline look + layout).

## 1. Problem

The business dashboard shipped a Donny hero in PR #411 — a prompt box reading
"Ask Donny anything…" under "Welcome back, Harbormill". It is not a composer. It
is a **launcher wearing a composer's clothes**.

`DonnyHomePrompt`'s submit calls `openDonnyWithContext()`
(`src/contexts/DonnyProvider.tsx:332`), which runs a nested-`setTimeout` chain:
`open()` → 100 ms → `expand()` → 100 ms → `sendMessage(query)`. So typing on the
dashboard animates open a **second Donny surface** — the docked desktop panel or
the mobile bottom sheet — and answers there. The user types in one place and
reads in another. On mobile the sheet covers the dashboard entirely.

Four defects follow from the same root, all reported by the founder:

| # | Symptom | Cause |
|---|---|---|
| 1 | Answer appears in a chat panel, not on the dashboard | `openDonnyWithContext` — the box is a launcher |
| 2 | Long prompts scroll out of sight | `<input type="text">`, single-line, fixed height |
| 3 | Enter always submits — no paragraphs, Tab unusable | No `onKeyDown` at all; Enter fires native form submit |
| 4 | Cannot attach links, images, video, or files | The `+` in `DonnyChatInput.tsx:41` is a decorative stub with no `onClick`; `donny_messages` has no attachment column; no chat-attachment bucket exists |

A fifth, unreported but structural: on the dashboard there are now **three** ways
to summon Donny — the inline box, the desktop header avatar
(`DashboardLayout.tsx:230`), and the mobile bottom-nav center button
(`DonnyNavButton.tsx:7`).

## 2. Decisions

Four decisions were made during brainstorming. They are settled inputs to this
design, not open questions.

**D1 — Donny answers inline on the dashboard page.** The conversation renders
beneath the composer on `/dashboard/*`. The docked panel and the mobile sheet
**never open** while the user is on a dashboard route.

**D2 — The launchers stay visible everywhere, and focus the inline composer on
the dashboard.** Header avatar and nav center button keep their positions on
every route, so app chrome never shifts. On a dashboard route they
`scrollIntoView` + `focus()` the inline composer. On every other route they open
the panel exactly as today. *Rejected: hiding them on the dashboard — it empties
the prominent mobile nav center slot and forces a 7→6 nav re-layout on the
first screen every user sees.*

**D3 — Sending takes over the page.** First send transitions the dashboard from
its empty state (greeting + composer + suggestion chips + widgets) into a thread
state (thread fills the content area, composer pinned to the bottom of the scroll
container, a "← Dashboard" pill returning to the widgets). *Rejected: a
sticky-on-scroll composer — swapping between in-flow and fixed positioning
mid-scroll is the jankiest of the candidates, and this app's window never scrolls
(`window.scrollY` is permanently `0`), so it would need a scroll listener on
`#main-content` with a threshold. Also rejected: no pinning at all — every
follow-up would cost a scroll back up.*

**D4 — Donny reads what you attach.** Images and PDFs/documents go to Claude as
content blocks; pasted links are fetched with the existing Tavily `read_url`
tool. Video uploads, attaches, and is stored, but **Donny cannot watch it** — the
UI must say so plainly rather than implying comprehension.

**D5 — Donny keeps his avatar.** The founder's call, made after the ChatGPT
direction was set. The avatar is not what makes the current chat read as a
messaging app — the **two-tone bubble fill** is. Donny's turns carry a small
emblem and unbubbled prose.

## 3. Visual direction

"Like ChatGPT on the dashboard. Do not make it look like the current Donny chat."

The current Donny chat speaks a messaging-app vocabulary: teal outbound bubbles,
pink inbound bubbles, an avatar, a timestamp under every line, date dividers, a
three-dot typing indicator, a pill input. That vocabulary tells the user *you are
texting someone*. The replacement tells them *you are working*.

**Removed on the inline surface:**

- Two-tone bubble fills. Donny's answer is plain prose on the page ground.
- Timestamps, date dividers, unread badges.
- The bouncing three-dot typing indicator.
- The pill-shaped input.

**Kept or added:**

- **Donny's avatar** — a small emblem marking each of his turns (D5). The user's
  own messages carry no avatar.
- **The user's message keeps a soft neutral bubble**, right-aligned. Neutral, not
  teal — one speaker bubbled, one not, is what makes a thread read as a document.
- **A rounded-rectangle composer**, not a pill. It must grow to several lines; a
  pill cannot. Auto-grows to a cap (~200 px), then scrolls internally.
- **Enter sends · Shift+Enter inserts a newline**, with `⇧⏎ new line` visible in
  the composer. Tab is left alone so it still moves focus.
- **A working `+`** — attach images, video, documents. A pasted URL becomes a chip.
- **Copy / Retry** under each Donny turn, quiet until hover.
- Teal survives as the send button and the focus ring. Brand, not wallpaper.

Palette and primitives come from `docs/DESIGN_SYSTEM.md` — the light app kit
(`PageBody`, `AppCard`, `dc-*` tokens). The no-gray rule applies to surfaces and
badges; muted **text** is fine.

## 4. Architecture

### 4.1 Reuse, don't fork

**The inline thread and the panel thread are the same conversation.** Both read
and write through the existing `useDonny` hook (`src/hooks/useDonny.ts`) and the
same `donny_conversations` / `donny_messages` rows. Ask on the dashboard, walk to
`/campaigns`, open the panel — the thread is there, mid-sentence. That continuity
*is* the "unified" in this project's title. Nothing new is persisted to make it
work; it falls out of using one hook.

What is **not** reused is the *rendering*. `DonnyChatView` / `DonnyMessage` keep
their current messaging-app look inside the panel. The inline surface gets its
own presentation components. Two renderers over one data source.

> A future cleanup may retire the panel's look in favour of the inline one. That
> is explicitly **out of scope** here — this design does not touch how the panel
> renders.

### 4.2 New components

All under `src/components/donny/inline/`.

| Component | Responsibility | Depends on |
|---|---|---|
| `DonnyCanvas.tsx` | Owns the two-state machine (`empty` \| `thread`) and the transition. The only stateful component. | `useDonny`, `DonnyComposer`, `DonnyThread` |
| `DonnyComposer.tsx` | The composer. Textarea, auto-grow, key handling, attach control, send. **Mounted once by `DonnyCanvas` and animated between positions — never remounted, never conditionally rendered per state.** | `useDonnyAttachments` |
| `DonnyThread.tsx` | Renders the turn list + the streaming turn. Scroll-anchors to the newest turn. | `DonnyTurn` |
| `DonnyTurn.tsx` | One turn. User → neutral bubble, right. Donny → avatar + unbubbled prose + rich cards + Copy/Retry. | `DonnyAvatar`, `DonnyRichCard` |
| `DonnyAttachmentTray.tsx` | Attachment chips above the textarea; remove control. | — |
| `useDonnyAttachments.ts` | Upload to Storage, track progress, hold the attachment array, revoke object URLs on unmount. | `supabase.storage` |

Reused unchanged: `DonnyRichCard`, `DonnyAvatar`, `isKnownDonnyRoute`
(`src/lib/donny/donnyRoutes.ts` — the guard against LLM-invented routes),
`useDonny`, `useDonnyQuickChips`.

`DonnyHome.tsx` becomes a thin composition: `DashboardGreeting` + `DonnyCanvas`.
`DonnyHomePrompt.tsx` is **deleted** — `DonnyComposer` replaces it.

### 4.3 The transition (D3)

The single most important build constraint in this document:

> **The composer element must not unmount, remount, or be swapped for a different
> element during the `empty → thread` transition.**

Remounting it drops half-typed text, loses focus, and kills an in-flight IME
composition mid-word. `DonnyCanvas` renders exactly one `<DonnyComposer>` in both
states and animates its container's position. Framer Motion is already in the
stack (lazy-loaded via `LazyMotion` in `App.tsx`); a shared `layout` animation or
a FLIP measure is the mechanism. Honour `prefers-reduced-motion` by cutting
straight to the end state.

State ownership: `DonnyCanvas` derives `empty` vs `thread` from whether the
conversation has any messages, **not** from a separate boolean. That makes the
state correct on reload without persisting anything.

### 4.4 Where the widgets go

`empty` state keeps today's dashboard below the composer — `DonnyHomeProposals`
("Needs your attention"), stats, DragonShare, recent activity. Landing on the
dashboard shows the whole dashboard.

`thread` state replaces them with the thread and shows a "← Dashboard" pill.
That pill routes to **`/dashboard/business/overview`**, which already exists —
`BusinessOverview.tsx`, shipped in #411 as the full widget dashboard. No new
page, no new route. Returning to `/dashboard/business` shows the thread again,
because the state is derived from message count.

### 4.5 Launcher rewire (D2)

One shared helper, because three call sites currently duplicate the toggle:

```
openDonnyForRoute(pathname):
  if pathname starts with '/dashboard'  → focus the inline composer
  else                                  → existing open()/close() panel toggle
```

Call sites: `DashboardLayout.tsx:230` (desktop header),
`DonnyNavButton.tsx:7` (mobile nav center).

The composer is reached by ref, not by DOM query — `DonnyProvider` exposes a
`registerInlineComposer(ref)` / `focusInlineComposer()` pair, and `DonnyCanvas`
registers on mount and deregisters on unmount. If nothing is registered (a
dashboard route without a canvas, e.g. first-run), the helper falls back to
opening the panel. **Fail open, never dead-click.**

`openDonnyWithContext` keeps its current behaviour for its other callers
(`BrandFreeTrioHero.tsx:43,51` and the quick chips), but `DonnyHome` stops using
it — and with it goes the 200 ms double-`setTimeout` dance.

Also gated: `DonnyDesktopPanel` and `DonnyMobileSheet` must not open on a
dashboard route even if some other code path calls `open()`. Enforce in the
provider's `open()`, not in each surface, so there is one rule.

## 5. Attachments (D4)

### 5.1 Data model

**Migration — additive only.** Per `CLAUDE.md`: never drop or rename; new columns
nullable.

- `donny_messages.attachments jsonb NULL` — array of
  `{ path, bucket, mime, size_bytes, name, kind }` where `kind ∈ image | video |
  document | link`. A `link` attachment carries `url` and no `path`.

**New private bucket `donny-attachments`**, modelled on `message-attachments`
(`20250617123640_*.sql:262`), which is the working pattern in this repo:

- Not public. Path shape `${auth.uid()}/${uuid}.${ext}`.
- Storage RLS: a user may INSERT/SELECT/DELETE only under their own uid prefix.
- Reads go through signed URLs, mirroring `MessageInputEnhanced.tsx:90`.
- Size cap 25 MB per file, 5 files per message.
- `accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md"`.

> **Do not repeat the `SmartInput.tsx` bug.** That component does
> `URL.createObjectURL(file)` and passes the resulting `blob:` URL through as
> `photo_url` — meaningless to an edge function, so that path is broken
> server-side, and it never calls `revokeObjectURL`. Object URLs here are for
> **local preview only**; the server always receives a storage path.

### 5.2 Backend

`donny-orchestrator` accepts an `attachments` array on the request and:

- **image** → fetch from Storage with the service-role client, send to Claude as
  an `image` content block.
- **document** (PDF/text) → send as a `document` content block.
- **link** → resolve with the existing Tavily `read_url` client tool
  (`docs/wiki/concepts/donny-web-access.md`). Server-side fetch, so no new SSRF
  surface.
- **video** → **not sent to the model.** Recorded on the message, named in the
  prompt as "the user attached a video named X which you cannot watch", so Donny
  neither ignores it nor hallucinates its contents.

Cost lands in `donny_cost_ledger` through the existing `_shared/cost-ledger.ts`.
Vision and document tokens are materially more expensive than text — see §7.

## 6. Phasing

Three phases, each independently shippable and prod-verifiable. This respects the
project's one-change-at-a-time rule; do not collapse them.

**Phase 0 — rebase.** This worktree is 15 commits behind `origin/main`. The Donny
hero (`DonnyHome`, `DonnyHomePrompt`, `buildDonnyProposals`, `BusinessOverview`,
`DONNY_FIRST_DASHBOARD_ENABLED`) exists only on `origin/main`. Building without
rebasing means reimplementing all of it and colliding on `BusinessDashboard.tsx`,
`donnyRoutes.ts`, `featureConfig.ts`, and `donny-orchestrator/routes.ts`.

**Phase 1 — the inline canvas (frontend only, business role).**
Composer (textarea, auto-grow, Enter/Shift+Enter, IME guard), inline thread with
the new turn rendering, the `empty → thread` takeover, pinned composer, "←
Dashboard" pill, launcher rewire. No migration, no edge-function change, no
attachments. Behind `DONNY_FIRST_DASHBOARD_ENABLED`, which already exists.
*Fully verifiable on prod on its own.*

**Phase 2 — attachments.** Migration + bucket + RLS + `useDonnyAttachments` +
the `+` control + the `donny-orchestrator` changes. Backend and security surface;
requires the review gates in §9.

**Phase 3 — creator and brand roles.** Generalise `DonnyHome` past
`business_client`, add per-role suggestion sets to `donnyHomeSuggestions.ts`,
replace `HeroPrimaryAction` on `CreatorDashboard.tsx` and `BrandDashboard.tsx`.
Build the Phase 1 components role-generic from day one so this phase is
configuration, not a rewrite.

## 7. Constraints and known traps

Drawn from `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, and this project's memory.

**Layout**

- **`window.scrollY` is always `0`.** The app document never scrolls — `h-screen`
  shell with an inner `overflow-auto` `<main id="main-content">`. Anything
  scroll-aware reads `#main-content.scrollTop`. `scrollIntoView` on the composer
  works normally.
- **Never put a transform on an ancestor of `position: fixed` UI.**
  `PageTransition` is opacity-only *by contract* — a transform pins every fixed
  descendant. The pinned composer should be positioned inside the scroll
  container, not `fixed`, which sidesteps this entirely.
- **z-index:** app chrome is `z-40`, the Radix modal layer is `z-50`,
  `DonnyMobileSheet` is `z-[60]/[61]`, toasts `z-[100]`. The pinned composer is
  in-page chrome and must clear the mobile bottom nav —
  `bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-0`, the `6rem`
  mirroring the content area's `pb-24`.
- **Bottom-anchored mobile UI uses `dvh`/`svh` and safe-area insets, never `vh`.**
- Desktop and mobile are separate targets. `lg:`/`xl:` for desktop, unprefixed for
  mobile. Test both.

**Input**

- **Add an IME composition guard** the existing components lack:
  `if (e.nativeEvent.isComposing) return;` before the Enter branch. Without it,
  Enter while confirming a CJK candidate submits a partial message. Present bug in
  `DonnyChatInput.tsx:32`, `MessageInputEnhanced.tsx:140`, `SmartInput.tsx:69` —
  fix it in the new composer; fixing the others is out of scope.

**Backend**

- **Migration before code.** Apply the prod migration *before* deploying an edge
  function that reads the new column, and before merging frontend that writes it.
- **Verify the object, not the ledger.** Check `pg_proc` /
  `information_schema` / `pg_policies` directly. A `schema_migrations` row is not
  proof the object exists — see the state-machine drift (#325) and the
  `handle_updated_at` stub.
- **`supabase.functions.invoke` resolves on non-2xx.** A `.catch()` is dead code
  for 4xx/5xx; check the response body.
- **Edge functions cannot be exercised from local dev** — `_shared/cors.ts`
  allows four prod origins and `127.0.0.1` is not one. Phase 2's UI is verifiable
  only on a deployed environment.
- **AI spend is capped at 15% of revenue** ($250/mo floor pre-revenue, currently
  ~$225/mo). Image and document blocks cost materially more than text. Confirm the
  per-call ledger rows land, and watch `aios_cost_stats()` after Phase 2 ships.

## 8. Testing and verification

**Unit (Vitest, co-located).** Composer key handling — Enter submits,
Shift+Enter inserts a newline, Enter during IME composition does not submit,
empty/whitespace does not submit. Auto-grow caps and then scrolls. The
`openDonnyForRoute` route predicate, including the fallback when no composer is
registered. Attachment validation — type allow-list, size cap, count cap.

> `npm run test` exits `1` from ~103 pre-existing failing files. Trust the
> "N passed, 0 failed" line for the files you touched, not the exit code. RTL
> tests need `// @vitest-environment jsdom` plus the jest-dom import as the first
> two lines — jsdom is per-file here, not global.

**Manual, on prod, both viewports** (`verify-prod`): type a multi-line prompt with
Shift+Enter and confirm the whole thing stays visible; send and watch the
takeover — no flicker, no text loss, focus retained; confirm the panel does *not*
open; tap the header avatar and the nav center button and confirm both focus the
composer; navigate to `/campaigns`, open the panel, confirm the same thread;
return and confirm the thread is intact; check the console for errors on both
viewports.

> **Verify on prod, not staging.** Staging is drift-corrupted, so the green smoke
> gate is false assurance.

## 9. Review gates

Non-negotiable, in order, before the PR is finished:

1. **`data-exposure-reviewer`** — Phase 2 only, before the Codex pass. It touches
   Storage RLS, a new bucket, and a service-role read of user files in
   `donny-orchestrator`.
2. **`edge-function-reviewer`** — Phase 2 only, before deploying
   `donny-orchestrator`. Checks `verify_jwt` drift, `_shared` bundling (including
   the template-literal backtick break), CORS, and deploy ordering.
3. **`/simplify`** before presenting code.
4. **Codex second review** — `codex review --base main` from the worktree, every
   phase, re-run until clean. A blank run is a failed gate, not a pass.
5. **`knowledge-sync`** on branch finish — wiki source, `/wiki-ops ingest`,
   `SHIPPED_LOG.md` prepend, `PROJECT_CONTEXT.md` §5 index line, Donny RAG sync
   after merge.

## 10. Non-goals

- Changing how the docked panel or the mobile sheet render. They keep their
  current look; only their *triggering* changes on dashboard routes.
- Retiring `openDonnyWithContext`. Other callers keep it.
- Fixing the IME bug in `DonnyChatInput`, `MessageInputEnhanced`, or `SmartInput`.
- Fixing `SmartInput`'s broken `blob:` `photo_url` path or its object-URL leak.
- Real token-by-token streaming. `donny-orchestrator:564` assembles the whole SSE
  body after the model finishes, so "streaming" is one delivery. The shimmer is
  honest about that. Real streaming is a separate project.
- Conversation history, multiple threads, or a "New chat" control. One rolling
  conversation, as today.

## 11. What this delivers

**Deletes** — the second Donny surface on the dashboard; the 200 ms
double-`setTimeout` open/expand dance; timestamps, date dividers and two-tone
bubbles from the inline surface; the dead `+` stub; the scroll back up to ask a
follow-up.

**Simplifies** — one composer per screen, one conversation across every surface,
one shared launcher rule instead of three copy-pasted toggles.

**Automates** — nothing new. Donny already does the work; this stops the UI from
getting in his way.

**Keystrokes removed** — Shift+Enter ends the paragraph workaround entirely
(users currently cannot write one). A pasted link replaces a paragraph of typed
context; an attached photo replaces a description of it. For the North Star
("every primary flow under 10 keystrokes"), attaching a menu PDF and typing
"campaign from this" is roughly a 200-keystroke saving over describing the menu.
