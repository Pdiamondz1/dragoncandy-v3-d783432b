# Donny Dashboard Unification — Design

> Status: approved design, not yet planned or built.
> Date: 2026-08-09 · Author: Claude Code with Dame Williams
> Revised 2026-08-09 after spec review — see §12 for what changed and why.
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

Six decisions. D1–D5 were approved by the founder during brainstorming and are
settled inputs, not open questions. D6 was forced by spec review (§12).

**D1 — Donny answers inline on the dashboard page.** The conversation renders
beneath the composer on `/dashboard/*`. The docked panel and the mobile sheet
**never open** while the user is on a dashboard route.

**D2 — The launchers stay visible everywhere, and focus the inline composer on
the dashboard.** Header avatar and nav center button keep their positions on
every route, so app chrome never shifts. On a dashboard route they
`scrollIntoView` + `focus()` the inline composer. On every other route they open
the panel exactly as today. *Rejected: hiding them on the dashboard — it empties
the prominent mobile nav center slot and forces a 7→6 nav re-layout on the first
screen every user sees.*

**D3 — Sending takes over the page.** First send transitions the dashboard from
its resting state (greeting + composer + suggestion chips + widgets) into a
thread state (thread fills the content area, composer stuck to the bottom of the
scroll container, a "← Dashboard" pill returning to the widgets). *Rejected: a
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

**D6 — A page load always lands on the dashboard, never mid-thread.** The canvas
opens in its resting state on every mount and enters `thread` only when the user
sends **during that visit**. Reload, or navigate away and back, and you get the
dashboard again. The conversation itself is untouched and continuous — on send,
the thread renders the real conversation scrolled to the newest turn, so earlier
history is one scroll up and identical to what the panel shows.

> D6 is the ChatGPT behaviour (a fresh session opens a new composer, not your
> last thread) and it resolves three separate review findings at once: the
> dashboard does not become a chat thread permanently after a user's first-ever
> message; there is no loading state to flash through, because the resting state
> is not derived from a fetch; and no "New chat" control is needed.

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
- **A working `+`** (Phase 2) — attach images, video, documents. A pasted URL
  becomes a chip. **Hidden entirely in Phase 1**, not rendered-and-disabled — a
  visible dead control is defect #4, which is what this project exists to delete.
- **Copy / Retry** under each Donny turn, quiet until hover. Retry appears on the
  newest Donny turn only, and is hidden after a reload — `useDonny.retry()`
  replays `lastUserMessage.current`, an in-memory ref that does not survive one.
- Teal survives as the send button and the focus ring. Brand, not wallpaper.

**Pending state.** `donny-orchestrator:564` assembles the entire SSE body after
the model finishes, so there is no token-by-token reveal — one pending state
covers the whole model latency, which can run tens of seconds. It renders as
Donny's avatar plus a shimmering placeholder line where his prose will land,
replaced in one paint when the answer arrives. No dots, no bouncing.

Palette and primitives come from `docs/DESIGN_SYSTEM.md` — the light app kit
(`PageBody`, `AppCard`, `dc-*` tokens). The no-gray rule applies to surfaces and
badges; muted **text** is fine.

## 4. Architecture

### 4.1 One conversation, two renderers

**The inline thread and the panel thread are the same conversation**, so asking
on the dashboard and then opening the panel on `/campaigns` shows the same thread
mid-sentence. That continuity is the "unified" in this project's title.

It is achieved by consuming **`useDonnyContext()`** — the single `useDonny`
instance already owned by `DonnyProvider` (`DonnyProvider.tsx:136`). The inline
components must **never call `useDonny` themselves**: that hook holds per-instance
state (`isStreaming`, `streamingContent`, `error`, `isSendingRef`) and opens a
realtime channel keyed `donny-messages-<id>`, so a second call would give the
inline surface its own split streaming state and a duplicate subscription.

What is **not** shared is the rendering. `DonnyChatView` / `DonnyMessage` keep
their current look inside the panel. The inline surface gets its own presentation
components. Two renderers over one hook instance.

### 4.2 `useDonny` must change — three precise changes

The first draft of this spec claimed `useDonny` was reused unchanged. It cannot
be. Each change below is required, minimal, and additive to existing callers.

**(a) The `enabled` gate — blocking for Phase 1.**
`DonnyProvider.tsx:136` reads:

```ts
const donny = useDonny({ campaignContext, enabled: stage !== 'closed' });
```

The comment above it says "only fires queries when the panel is open." On a
dashboard route the panel never opens (D1), so with this gate the conversation
query never runs, `messages` is permanently `[]`, and `sendMessage` throws
`'No active conversation'` (`useDonny.ts:128`). **The inline surface cannot
function until this gate widens** to include dashboard routes:

```ts
enabled: stage !== 'closed' || isInlineDonnyRoute(pathname)
```

`isInlineDonnyRoute` is the same predicate §4.5 uses for the launchers — one
function, one definition, so the gate and the routing can never disagree.

**(b) `attachments` in the select list — Phase 2.**
`useDonny.ts:88` enumerates columns explicitly (correctly — the project forbids
`select *`). Adding the column to the table without adding it here means
persisted attachments silently never re-render on past turns.

**(c) `sendMessage` accepts attachments — Phase 2.**
Today `sendMessageMutation` takes `{ content: string; isRetry?: boolean }`,
inserts `{ conversation_id, role, content }`, and POSTs a body with no
attachments field. All three need the optional array. Optional, so every existing
caller is unaffected.

**Not needed:** an `isPending` flag. D6 removes the load-flash problem by not
deriving the resting state from a fetch.

### 4.3 New components

All under `src/components/donny/inline/`.

| Component | Responsibility |
|---|---|
| `DonnyCanvas.tsx` | Owns the `resting \| thread` state and the transition. Registers the composer ref. Calls `markAllRead()` on mount (§4.6). The only stateful component. |
| `DonnyComposer.tsx` | Textarea, auto-grow, key handling, send. Attach control in Phase 2. |
| `DonnyThread.tsx` | Turn list + pending turn + error states. Scroll-anchors to the newest turn. |
| `DonnyTurn.tsx` | One turn. User → neutral bubble, right. Donny → avatar + unbubbled prose + rich cards + Copy/Retry. |
| `DonnyAttachmentTray.tsx` | Phase 2. Attachment chips above the textarea; labelled remove control per chip. |
| `useDonnyAttachments.ts` | Phase 2. Upload, progress, the attachment array, `revokeObjectURL` on unmount. |

Reused unchanged: `DonnyRichCard`, `DonnyAvatar`, `isKnownDonnyRoute`
(`src/lib/donnyRoutes.ts`), `useDonnyQuickChips`, `DonnyNudgeCard`.

`DonnyHome.tsx` becomes `DashboardGreeting` + `DonnyCanvas`.
`DonnyHomePrompt.tsx` is **deleted** — `DonnyComposer` replaces it.

### 4.4 The transition (D3)

> **The composer must not remount across the transition.** Remounting drops
> half-typed text, loses focus, and kills an in-flight IME composition mid-word.

"Renders one composer in both states" is not enough — this satisfies it and still
remounts on every transition, because React reconciles by position:

```tsx
{state === 'resting' ? <Hero><Composer/></Hero> : <><Thread/><Composer/></>}
```

**The enforceable requirement: `<DonnyComposer>` occupies the same slot in the
React element tree in both states. Only the classes on its wrapper change.**
`DonnyCanvas` renders one fixed structure — greeting, thread, composer — and the
state toggles visibility and layout classes on the wrapper elements, never the
tree shape.

**Mechanism: CSS, not Framer layout animation.** `src/lib/motion.tsx` loads
**`domAnimation`** under `<LazyMotion strict>`; Framer's layout projection
(`layout` / `layoutId`) ships only in `domMax`, so a `layout` prop would silently
no-op here. Switching the app-wide feature bundle to `domMax` is a global change
touching every animated surface and the lazy chunk — out of scope and not worth
it. The composer's wrapper transitions between two class sets; the greeting and
widgets fade out and the thread fades in. Honour `prefers-reduced-motion` by
cutting straight to the end state.

The composer is **`sticky bottom-0`** inside `#main-content`, not `fixed` — the
landing header relies on the same behaviour (`Header.tsx:51`), it sidesteps the
`PageTransition`-transform trap entirely, and it needs no z-index negotiation
with the mobile nav. Because the content area already carries `pb-24` for nav
clearance, the composer needs no additional `6rem` offset; it needs
`env(safe-area-inset-bottom)` padding only.

### 4.5 Launcher rewire (D2)

One shared helper, because three call sites currently duplicate the toggle:

```
openDonnyForRoute(pathname):
  if isInlineDonnyRoute(pathname)  → focusInlineComposer()
  else                             → existing open()/close() panel toggle
```

Call sites: `DashboardLayout.tsx:230` (desktop header), `DonnyNavButton.tsx:7`
(mobile nav center).

The composer is reached by ref: `DonnyProvider` exposes
`registerInlineComposer(ref)` / `focusInlineComposer()`; `DonnyCanvas` registers
on mount and deregisters on unmount.

**On a dashboard route with no registered composer** — `/dashboard/business/overview`
is exactly this case, and so is the first-run dashboard — the launcher **navigates
to the canvas route and focuses the composer on arrival.** It does *not* fall back
to opening the panel: `open()` is gated on dashboard routes (below), so that
fallback would be a guaranteed dead click. Navigating is the only fail-open that
actually works.

**Two panel gates**, both in the provider so there is one rule rather than one
per surface:

- `open()` is a no-op on an inline route.
- **Navigating *into* an inline route closes an already-open panel.** `stage`
  lives in the provider and survives navigation, so without this you can open the
  panel on `/campaigns`, walk to `/dashboard/business`, and have both surfaces
  live at once — the exact defect being deleted.

`openDonnyWithContext` keeps its behaviour for its other callers
(`BrandFreeTrioHero.tsx:43,51`, `HelpArticlePage.tsx:171`, and the #411
suggestion chips), but `DonnyHome` stops using it — and with it goes the 200 ms
double-`setTimeout` dance.

### 4.6 Nudges and the unread badge

`DashboardLayout.tsx:230-242` renders the launcher as `DonnyAvatar` with
`badgeCount={unreadCount}`, and `open()` is both what fires `markAllRead()` and
what reveals `DonnyTray` — the nudge list. Rewiring the launcher to focus a
textarea would leave a badge reading "3" whose click focuses an input, with the
nudges unreachable and `markAllRead` never firing on the app's most-visited route.

So: **the resting state renders the nudge list inline**, above the existing
`DonnyHomeProposals`, using the existing `DonnyNudgeCard`. `DonnyCanvas` calls
`markAllRead()` on mount on an inline route, which is the same moment `open()`
would have. The badge then behaves exactly as it does today.

### 4.7 Where the widgets go

Resting state keeps today's dashboard below the composer — nudges,
`DonnyHomeProposals` ("Needs your attention"), stats, DragonShare, recent
activity. Landing on the dashboard shows the whole dashboard, **every time**
(D6).

Thread state replaces them with the thread and shows a "← Dashboard" pill routing
to **`/dashboard/business/overview`**, which already exists (`BusinessOverview.tsx`,
shipped in #411). No new page, no new route for the business role.

### 4.8 Failure and edge states

Neither the first draft nor the current inline components covered these;
`DonnyChatView.tsx:90-112` already handles the first three and the inline
renderer must match it rather than regress.

| State | Behaviour |
|---|---|
| Model/quota failure | Quota-exceeded renders with the Upgrade path; other failures render with Retry. Match `DonnyChatView`. |
| Stream drop mid-answer | Partial text is preserved and shown, with Retry. |
| Send while offline | Composer stays filled, message not cleared, inline error with Retry. Never silently discard typed text. |
| Upload failure (Ph2) | The chip shows a failed state with a retry and a remove; the message can still be sent without it. |
| Over size/count cap (Ph2) | Rejected before upload starts, with the actual limit named. |
| Unbounded thread | `useDonny` fetches full history with no limit and D-10 rules out multiple threads, so a long-lived thread grows without pagination or virtualization. **Accepted for v1** — recorded here so it reads as a decision, not an oversight. |

### 4.9 Accessibility

Focus lands on the composer after send, never lost to the transition. The thread
container is `role="log" aria-live="polite"`, matching `DonnyChatView.tsx:55`. The
"← Dashboard" pill is a link with a discernible name, not an icon-only control.
Attachment remove controls are labelled per file. The transition respects
`prefers-reduced-motion`. Keyboard focus is visible throughout.

## 5. Attachments (D4) — Phase 2

### 5.1 Data model

**Migration — additive only.** Per `CLAUDE.md`: never drop or rename; new columns
nullable.

- `donny_messages.attachments jsonb NULL` — array of
  `{ path, mime, size_bytes, name, kind }` where `kind ∈ image | video |
  document | link`. A `link` attachment carries `url` and no `path`.

> **No `bucket` field.** The bucket is pinned server-side. A client-supplied
> bucket name is a fact the client asserts, and §5.2 reads these with the
> service-role key.

**New private bucket `donny-attachments`**, modelled on `message-attachments`
(`20250617123640_*.sql:262`), the working pattern in this repo:

- Not public. Path shape `${auth.uid()}/${uuid}.${ext}`.
- Storage RLS: INSERT/SELECT/DELETE only under the caller's own uid prefix.
- Reads go through signed URLs, mirroring `MessageInputEnhanced.tsx:90`.
- 25 MB per file, 5 files per message.
- `accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md"`.

> **Do not repeat the `SmartInput.tsx` bug.** That component does
> `URL.createObjectURL(file)` and passes the `blob:` URL through as `photo_url` —
> meaningless to an edge function, so that path is broken server-side, and it
> never calls `revokeObjectURL`. Object URLs here are for **local preview only**;
> the server always receives a storage path.

### 5.2 Backend — the ownership invariant

`donny-orchestrator` reads attachments with the **service-role client, which
bypasses Storage RLS.** The invariant that makes that safe, stated as a design
requirement rather than delegated to a reviewer:

> **The bucket is a server-side constant, and every `path` must begin with
> `${ctx.userId}/` — where `ctx.userId` comes from `auth.getUser()`, never from
> the request body. A path failing that check is rejected, and the whole request
> fails rather than silently dropping the attachment.**

Without both halves this is a read-any-object primitive. This is the project's
recurring bug class — a grant may rest only on a fact the client cannot assert
(the `outstand-proxy` findings, `create_counter_offer`, `apply_to_campaign`).

Given a valid path:

- **image** → Claude `image` content block.
- **document** (PDF/text) → Claude `document` content block.
- **link** → resolved with the existing Tavily `read_url` tool
  (`docs/wiki/concepts/donny-web-access.md`). Server-side fetch, so no new SSRF
  surface.
- **video** → **not sent to the model.** Recorded on the message and named in the
  prompt as "the user attached a video named X which you cannot watch", so Donny
  neither ignores it nor hallucinates its contents.

Cost lands in `donny_cost_ledger` via `_shared/cost-ledger.ts`.

## 6. Phasing

Three phases, each independently shippable and prod-verifiable. This respects the
project's one-change-at-a-time rule; do not collapse them.

**Phase 0 — rebase.** This worktree is 15 commits behind `origin/main`. The Donny
hero (`DonnyHome`, `DonnyHomePrompt`, `buildDonnyProposals`, `BusinessOverview`,
`DONNY_FIRST_DASHBOARD_ENABLED`) exists only on `origin/main`. Building without
rebasing means reimplementing all of it and colliding on `BusinessDashboard.tsx`,
`donnyRoutes.ts`, `featureConfig.ts`, and `donny-orchestrator/routes.ts`.

**Phase 1 — the inline canvas (frontend only, business role).**
The `useDonny` `enabled` gate (§4.2a), composer, inline thread, the resting →
thread takeover, sticky composer, "← Dashboard" pill, launcher rewire, both panel
gates, inline nudges + `markAllRead`, the §4.8 failure states. No migration, no
edge-function change; the `+` is not rendered.

> **`DONNY_FIRST_DASHBOARD_ENABLED` is already `true` on `origin/main`.** Phase 1
> is therefore **not gated** — merging it changes the dashboard for every business
> user. Either flip the flag to `false` before merge and have the founder flip it
> back deliberately, or accept that merge *is* the launch. Decide before the PR,
> not after.

**Phase 2 — attachments.** Migration + bucket + RLS + `useDonnyAttachments` + the
`+` control + paste-URL-to-chip + `useDonny` changes (§4.2b, §4.2c) + the
`donny-orchestrator` changes. Backend and security surface; requires the §9 gates.

**Phase 3 — creator and brand roles.** Generalise `DonnyHome` past
`business_client`, add per-role suggestion sets to `donnyHomeSuggestions.ts`,
replace `HeroPrimaryAction` on `CreatorDashboard.tsx` and `BrandDashboard.tsx`.

> **Phase 3 is not pure configuration.** `/dashboard/business/overview` exists;
> `/dashboard/creator/overview` and `/dashboard/brand/overview` do **not** — each
> role needs its own overview route for the "← Dashboard" pill to have a target,
> which is two new pages extracted from the existing dashboards the way #411
> extracted `BusinessOverview`. Also `BRAND_ROLE_ENABLED` is `false`
> (`featureConfig.ts:1`), so the brand half cannot be prod-verified through the
> normal flow. Build the Phase 1 components role-generic from day one so the
> *components* are configuration even though the routes are not.

## 7. Constraints and known traps

Drawn from `CLAUDE.md`, `docs/DESIGN_SYSTEM.md`, and this project's memory.

**Layout**

- **`window.scrollY` is always `0`.** The app document never scrolls — `h-screen`
  shell with an inner `overflow-auto` `<main id="main-content">`. Anything
  scroll-aware reads `#main-content.scrollTop`. `scrollIntoView` works normally.
- **Never put a transform on an ancestor of `position: fixed` UI.**
  `PageTransition` is opacity-only *by contract*. Using `sticky` inside the scroll
  container (§4.4) avoids this entirely.
- **z-index:** app chrome `z-40`, Radix modal layer `z-50`, `DonnyMobileSheet`
  `z-[60]/[61]`, toasts `z-[100]`. A `sticky` composer inside `#main-content`
  needs none of this.
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
- **Verify the object, not the ledger.** Check `pg_proc` / `information_schema` /
  `pg_policies` directly. A `schema_migrations` row is not proof the object exists
  — see the state-machine drift (#325) and the `handle_updated_at` stub.
- **`supabase.functions.invoke` resolves on non-2xx.** A `.catch()` is dead code
  for 4xx/5xx; check the response body.
- **Edge functions cannot be exercised from local dev** — `_shared/cors.ts` allows
  four prod origins and `127.0.0.1` is not one. Phase 2's UI is verifiable only on
  a deployed environment.
- **AI spend is capped at 15% of revenue** ($250/mo floor pre-revenue, currently
  ~$225/mo). Image and document blocks cost materially more than text. Confirm the
  ledger rows land and watch `aios_cost_stats()` after Phase 2 ships.

## 8. Testing and verification

**Unit (Vitest, co-located).** Composer key handling — Enter submits,
Shift+Enter inserts a newline, Enter during IME composition does not submit,
empty/whitespace does not submit. Auto-grow caps then scrolls. `isInlineDonnyRoute`
across all three role dashboards, the overview routes, and non-dashboard routes.
`openDonnyForRoute` including the navigate-and-focus path when no composer is
registered. D6: the canvas mounts `resting` even when the conversation has
messages. Phase 2: attachment type/size/count validation, and rejection of a path
not prefixed with the caller's uid.

> `npm run test` exits `1` from ~103 pre-existing failing files. Trust the
> "N passed, 0 failed" line for the files you touched, not the exit code. RTL
> tests need `// @vitest-environment jsdom` plus the jest-dom import as the first
> two lines — jsdom is per-file here, not global.

**Manual, on prod, both viewports** (`verify-prod`): type a multi-line prompt with
Shift+Enter and confirm the whole thing stays visible; send and watch the takeover
— no flicker, no text loss, focus retained; confirm the panel does *not* open; tap
the header avatar and the nav center button and confirm both focus the composer;
open the panel on `/campaigns`, navigate to `/dashboard/business`, confirm the
panel closed; confirm the same thread in both surfaces; reload and confirm you
land on the dashboard, not the thread (D6); confirm the unread badge clears on
dashboard arrival; check the console for errors on both viewports.

> **Verify on prod, not staging.** Staging is drift-corrupted, so the green smoke
> gate is false assurance.

## 9. Review gates

Non-negotiable, in order, before the PR is finished:

1. **`data-exposure-reviewer`** — Phase 2, before the Codex pass. Storage RLS, a
   new bucket, and a service-role read of user files. The §5.2 invariant is what
   it should be checking.
2. **`edge-function-reviewer`** — Phase 2, before deploying `donny-orchestrator`.
   `verify_jwt` drift, `_shared` bundling (including the template-literal backtick
   break), CORS, deploy ordering.
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
  body after the model finishes. The pending shimmer is honest about that. Real
  streaming is a separate project.
- Conversation history browsing, multiple threads, or a "New chat" control. One
  rolling conversation, as today — D6 makes the extra control unnecessary.
- Thread pagination or virtualization (§4.8).
- Switching the app's Framer Motion feature bundle to `domMax`.

## 11. What this delivers

**Deletes** — the second Donny surface on the dashboard; the 200 ms
double-`setTimeout` open/expand dance; timestamps, date dividers and two-tone
bubbles from the inline surface; the dead `+` stub; the scroll back up to ask a
follow-up.

**Simplifies** — one composer per screen, one conversation across every surface,
one shared launcher rule instead of three copy-pasted toggles, one route predicate
governing the data gate and the routing together.

**Automates** — nothing new. Donny already does the work; this stops the UI from
getting in his way.

**Keystrokes removed** — Shift+Enter ends the paragraph workaround entirely
(users currently cannot write one). A pasted link replaces a paragraph of typed
context; an attached photo replaces a description of it. For the North Star
("every primary flow under 10 keystrokes"), attaching a menu PDF and typing
"campaign from this" is roughly a 200-keystroke saving over describing the menu.

## 12. Revision log

**2026-08-09 — after spec review.** The review found the architecture as first
written could not be built. Changes, all verified against the code before being
accepted:

1. **`useDonny` is gated on the panel being open** (`DonnyProvider.tsx:136`,
   `enabled: stage !== 'closed'`). The draft claimed the hook was "reused
   unchanged"; with that gate the inline surface would have had no messages, no
   subscription, and `sendMessage` would have thrown. Now §4.2a, and the first
   task of Phase 1.
2. **Framer layout animation is unavailable here.** `src/lib/motion.tsx` loads
   `domAnimation`; layout projection ships in `domMax`. The draft named `layout`
   as the mechanism for the constraint it called most important. Replaced with a
   CSS transition, §4.4.
3. **"One composer in both states" was unenforceable** — the obvious ternary
   satisfies it and still remounts. Restated as a same-slot-in-the-element-tree
   requirement, §4.4.
4. **D6 added.** Deriving the state from message count made `/dashboard/business`
   a chat thread permanently after a user's first-ever message, and made every
   reload flash the resting state before animating into the thread. Landing on the
   dashboard every time fixes both and removes the need for a "New chat" control.
5. **The launcher fallback contradicted the panel gate** — falling back to
   `open()` on a route where `open()` is a no-op is a guaranteed dead click. Now
   navigate-and-focus, §4.5.
6. **Panel-open-then-navigate-in was unhandled**, leaving both surfaces live.
   Now closed on entry, §4.5.
7. **Nudges and the unread badge had no home** once the launcher stopped calling
   `open()`. Now §4.6.
8. **The attachment ownership invariant was missing** — a client-supplied bucket
   and path read with the service-role key is a read-anything primitive. Now
   §5.2, and `bucket` is gone from the stored shape.
9. **Phase 1's `+` was undefined** — §3 specified a working one, Phase 1 excluded
   attachments. Now explicitly not rendered until Phase 2.
10. **Phase 3 was described as configuration** but needs two new overview routes;
    `BRAND_ROLE_ENABLED` is `false`, so the brand half is not normally
    prod-verifiable. Now stated, §6.
11. **`DONNY_FIRST_DASHBOARD_ENABLED` is already `true`**, so "behind the flag"
    and "shippable on its own" were incompatible. Now a decision to make before
    the PR, §6.
12. **Failure states, accessibility, pending state, Retry-after-reload, and the
    unbounded thread** were unspecified. Now §3, §4.8, §4.9.
13. **Citation fixed**: `isKnownDonnyRoute` is `src/lib/donnyRoutes.ts`.
