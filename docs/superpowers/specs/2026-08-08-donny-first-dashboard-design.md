# Donny-First Dashboard — Business (Restaurant) Role

**Date:** 2026-08-08
**Status:** Design approved, not yet implemented
**Scope:** Business/restaurant dashboard body only. Creator and brand follow after prod verification.

## 1. Problem

DragonCandy has 73 pages, 206 hooks and 80 edge functions. A restaurant owner opens
`/dashboard/business` and fiddles — clicking around to work out how to begin. The founder's
acceptance bar is the **Mom Test**: a 75-year-old who is not tech savvy should log in and
comfortably get something done, without being taught first and without opening a help page.

The dashboard body becomes Donny: a greeting, what needs the owner's attention right now, a
prompt box, and a few taps that work.

## 2. What Phase 0 established

This design is grounded in an audit run 2026-08-08, not in assumption. The findings that shaped
it:

- **`usePendingActions` → `PendingActionBanners` already produces state-derived proposals** —
  *"Ricky Ricardo applied to 'Taco Tuesday' 2h ago — Review Application →"*, dismissible, capped
  at 3 with a "+N more" overflow. It is buried below a greeting, a hero CTA and a
  `NeedsAttentionSection` frame. This is the single most important finding: the hard part is
  built.
- **`FirstRunDashboard` already short-circuits the whole dashboard** for new users
  (`isFirstRun && missions`). The zero-state is not this design's problem.
- **Three of four stat tiles are hardcoded `'—'`** (Creators, Spend, ROI). Only "Active" is real.
  Replacing the body forfeits far less than it appears to.
- **`donny_nudges` is a notification feed, not a proposal engine.** 33 rows ever, 0 acted on, 29
  dismissed; every row is an event notification ("X boosted your post"), never a state-derived
  proposal. Its `acted_at` has never been recorded because `executeAction` fires the update and
  then immediately sets `window.location.href`, cancelling it. **This design does not build on
  `donny_nudges`.**
- **Only four Donny tools verifiably work on prod**: `prepare_campaign`, `find_creators`,
  `web_search`, `read_url`. The `social_*` tools have failed 7/7 across ten weeks — and told
  users their accounts were not connected when prod shows an `active` Instagram row.
- **`prepare_campaign` already pre-loads the campaign builder.** The auto-populate half of the
  brief is verification work, not construction.

## 3. Goals

1. A restaurant owner knows their next move within seconds of landing, without hunting.
2. Every tap on the dashboard does something real.
3. No path where Donny shrugs — if it cannot do a thing, it says where the thing lives.
4. Nothing that works today is deleted; it moves.

## 4. Non-goals

Creator and brand roles. The plain-language terminology pass. In-flow guidance and the existing
tour/coachmark kit. The four open Phase 0 bugs. Re-seeding `donny_knowledge`. Any change to
`FirstRunDashboard`.

## 5. Decisions and rationale

| Decision | Rationale |
|---|---|
| Pending actions are **absorbed** into Donny's body, not moved to the overview page | They are the only thing on the dashboard that already tells an owner what needs them. Moving them would leave Donny unable to say anything is waiting. |
| The conversation renders **inline**; the dashboard becomes the chat | Matches the stated UX ("similar to Claude Chat"). A full-screen sheet over a page that is already just a prompt box is redundant on mobile. |
| Quiet-day state = **curated taps + free state signals**, no AI call on load | An AI call on the most-visited screen bills against the ≤15%-of-revenue cap on every page view, adds latency, and Phase 0 showed Donny fabricates confidently when it lacks data. |
| Inline chat via a **fourth `stage` value**, not a second `useDonny` | `useDonny` keeps local `streamingContent` / `isStreaming` / `avatarState` and its own `channelRef` realtime subscription. Two instances = two channels and a split streaming buffer: the dashboard streams while the panel shows nothing. Data would converge (both queries key on `user?.id`) but the live state would not. |
| Old dashboard **preserved** at `/dashboard/business/overview` | Reversible in one line; nothing is lost; Donny can deep-link there. |
| Ship **business first**, prod-verify, then replicate | Matches the project's "never propose batch changes" rule and de-risks the shared shell. |

## 6. Architecture

Feature flag `DONNY_FIRST_DASHBOARD_ENABLED` in `src/lib/featureConfig.ts` (mirrors the existing
`BRAND_ROLE_ENABLED` pattern).

`BusinessDashboard.tsx` becomes a thin three-way switch:

1. `isFirstRun && missions` → `<FirstRunDashboard>` — **unchanged, and checked first**
2. flag off → today's body (now imported from `BusinessOverview`)
3. flag on → `<DonnyHome role="business_client" />`

New route `/dashboard/business/overview` → `BusinessOverview.tsx`, the current body moved
verbatim. **Register it in both route mirrors** (`donny-orchestrator/routes.ts` and
`src/lib/donnyRoutes.ts`) so `isKnownRoute` accepts it and the existing
"every builder output is a known route" test covers it.

### Components

**`src/components/donny/DonnyHome.tsx`** — role-agnostic shell.

```ts
interface DonnyHomeProps {
  role: UserRole;
  greeting: { name: string | null };      // null renders "there", never "undefined"
  proposals: DonnyProposal[];
  suggestions: DonnySuggestion[];
  overviewRoute: string;
}
```

Renders greeting → proposals → input → suggestions → overview link when the conversation is
empty; hands rendering to the existing `DonnyChatView` once messages exist. **It does not fork
the chat renderer** — `DonnyChatView` / `DonnyChatInput` / `DonnyMessage` / `DonnyRichCard` are
reused as-is.

**`src/hooks/useDonnyProposals.ts`** — the only genuinely new logic, kept pure so it is testable
without network mocks.

```ts
interface DonnyProposal {
  id: string;
  kind: 'pending_action' | 'signal';
  text: string;                                     // Donny's voice, plain language
  cta: { label: string; route: string }
     | { label: string; message: string };          // navigate, or ask Donny
  priority: number;
  dismissible: boolean;
}

interface DonnySuggestion {
  label: string;      // what the chip reads: "Find creators near me"
  message: string;    // what is actually sent to Donny
}
```

`DonnySuggestion` is intentionally a separate, simpler type from `DonnyProposal`: a suggestion is
a static, role-scoped conversation starter with no state behind it, while a proposal is derived
from this account's data and can carry a route, a priority and a dismissal. Collapsing them would
make the "only WORKS-list taps ship" rule harder to enforce, since it applies to suggestions only.

Dismissal reuses the existing 24-hour `localStorage` convention from `PendingActionBanners`
(`pendingBannerDismissed_<campaignId>`) rather than introducing a second dismissal store.

Merges `usePendingActions` output with quiet-day signals, ranks, caps at **3** (the cap
`PendingActionBanners` already uses). Pending actions always outrank signals: someone is waiting
on the owner, or money is blocked.

**Route CTAs are validated through `isKnownDonnyRoute` before render.** A proposal whose route
fails validation renders as text without a button rather than shipping a dead link — the direct
lesson of the twelve `/settings/*` CTAs fixed in PR #409.

### Quiet-day signals

Each is a pure predicate over data the page **already fetches**. No new query, no AI call, no
opportunity to fabricate:

| Signal | Threshold | Source (already on the page) |
|---|---|---|
| Campaign deadline approaching | deadline within **3 days** and not yet delivered | `useBusinessActiveCampaigns` → `deadline` |
| No recent campaign | no campaign created in **14 days**, and at least one exists | `useBusinessActiveCampaigns` |
| Social connected, nothing scheduled | ≥1 active account, **0** upcoming posts | `UpcomingPostsWidget`'s query |
| Location setup incomplete | `hasActiveLocation && !isReady` | `useLocationReadiness` (already rendered here today) |

Thresholds live in one exported constant block in `useDonnyProposals.ts` so they are tunable in
one place and assertable in tests. They are first guesses, not research — revisit them against
the §11 metrics rather than defending them.

The "no recent campaign" signal requires at least one existing campaign: an account with zero
campaigns is either in `FirstRunDashboard` or genuinely new, and telling such an owner they
haven't run a campaign in 14 days is noise, not help.

### Stage machine

`DonnyStage` gains `'inline'`: `'closed' | 'inline' | 'tray' | 'chat'`.

- `DonnyHome` calls `setInline()` on mount and `close()` in the effect cleanup.
- `enabled: stage !== 'closed'` then covers inline with no change to that expression.
- `DonnyNavButton`, `DonnyDesktopPanel` and `DonnyMobileSheet` return `null` when
  `stage === 'inline'` — never two Donnys on one screen.

**No existing code path produces `'inline'`**, so every other authenticated page is
byte-identical. This is what makes the change additive rather than a state-machine rewrite.

## 7. Data flow

1. Mount → `setInline()` → `useDonny` enabled → conversation loads
2. `useDonnyProposals()` merges pending actions + signals from already-loaded hooks
3. No messages → greeting + proposals + input + suggestions + overview link
4. Messages exist → `DonnyChatView` inline; greeting and proposals give way
5. Proposal tap → navigate (validated) **or** `sendMessage`
6. Suggestion tap → `sendMessage`
7. Unmount → `close()`

## 8. The taps

Constrained to the Phase 0 WORKS list. Business role ships **three**:

| Tap | Tool | Status |
|---|---|---|
| "Create a campaign for…" | `prepare_campaign` | WORKS |
| "Find creators near me" | `find_creators` | WORKS |
| "What's trending for restaurants near me?" | `web_search` | WORKS |

Deliberately excluded: anything routing to `social_*` (0/7 on prod), and analytics claims the
honest-analytics work already had to walk back. **A tap that produces a shrug is worse than no
tap** — it teaches the user the assistant is decorative, which is the exact failure this project
exists to avoid.

## 9. Failure and empty states

| Condition | Behaviour |
|---|---|
| Conversation fails to load | Greeting, proposals and input still render; quiet inline error + retry. Never a blank screen. |
| `usePendingActions` errors | Signals render alone (matches today: the banner returns `null` on error) |
| Proposals loading | `DCSkeleton` rows, not a spinner |
| Orchestrator down / message fails | Existing `error` + `retry` from `useDonny`, surfaced by `DonnyChatView` — already handled |
| Donny cannot do the thing | Says where it lives and offers to navigate, routed through `isKnownDonnyRoute`. A generic apology is a bug. |

## 10. Accessibility — the Mom Test bar

Applies to every surface this design touches: plain language, no insider vocabulary; body text
≥16px; tap targets ≥44×44px on mobile; no icon without a text label where a decision is made;
WCAG AA contrast against the `dc-*` palette (checked, not assumed); nothing depends on hover;
errors say what to do next.

Styling uses the light-app kit — `PageBody`, `AppCard`, `AppChip`, `AppStatusBadge`,
`Button variant="dc-primary"|"dc-secondary"`, `dc-*` tokens, Outfit/Pacifico. **Not** the
`landing-*` tokens. No gray surfaces or badges.

Mobile/desktop are separate targets: base classes for mobile, `lg:`/`xl:` for desktop. The input
is bottom-anchored on mobile using `dvh`/`svh` + `env(safe-area-inset-bottom)`, never `vh`. No
transform on any ancestor of `position: fixed` UI.

## 11. Metrics

Instrumented via `analytics_events`. **Do not persist a firehose** — see the `analytics_events`
firehose incident in `SHIPPED_LOG.md`.

- Share of dashboard sessions where the first meaningful action came from Donny vs the nav
- Time from dashboard load to first meaningful action
- Proposal action rate vs dismiss rate — **the number to beat is 0%**, `donny_nudges`' lifetime record
- Unanswered-prompt rate (user asks, Donny cannot help)
- Fall-through: landed on the Donny dashboard, went straight to the nav anyway. This is the
  honest "did it work" signal.

## 12. Testing

- `useDonnyProposals` — merge, rank and cap, table-driven over fixtures, no network
- Each signal predicate — pure functions, table-driven
- Every proposal CTA route asserted through `isKnownDonnyRoute`, extending the loop added in #409
- `DonnyHome` under RTL — greeting with a name, without a name (never "undefined"), proposals
  render, suggestions shown when no messages, chat shown when messages exist.
  **RTL files need `// @vitest-environment jsdom` + the jest-dom import as the first two lines** —
  jsdom is per-file in this repo, not global.
- Stage — mount sets `inline`, unmount closes, nav button and panel hidden while inline
- Note: `npm run test` exits 1 on ~103 pre-existing failing files. Trust the
  "N passed, 0 failed" line, not the exit code.

## 13. Rollout

1. Build behind `DONNY_FIRST_DASHBOARD_ENABLED` (default **off**)
2. Claude review → `/simplify` → Codex second review until clean
3. Merge; flip the flag on
4. `verify-prod` — screenshot desktop **and** mobile, check console errors on dragoncandy.io
5. Read the §11 metrics before touching creator or brand
6. `knowledge-sync`

## 14. Follow-ups this design deliberately leaves open

- Creator and brand dashboards (same shell, different proposals and overview route)
- The plain-language terminology pass — the bigger lever for the Mom Test, and a prerequisite
  for writing this dashboard's copy well
- The four Phase 0 bugs: fabricated DC Points redemption rates; `social_*` failing while
  blaming the user's connection; `acted_at` never recorded; the "Later" button posting
  `Execute action: dismiss with {}` into the chat
- Whether a creator should ever see an "Upgrade" CTA (surfaced by PR #409, unanswered)
- Real "frequently used" prompt ranking, computable from `donny_messages` — v1 is curated
