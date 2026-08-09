# Donny-First Dashboard — Business (Restaurant) Role

**Date:** 2026-08-08 (revised same day after `spec-document-reviewer`)
**Status:** Phase A design approved, not yet implemented
**Scope:** Business/restaurant dashboard body. Phase A only. Creator and brand follow after prod verification.

## 1. Problem

DragonCandy has 73 pages, 206 hooks and 80 edge functions. A restaurant owner opens
`/dashboard/business` and fiddles — clicking around to work out how to begin. The acceptance bar
is the **Mom Test**: a 75-year-old who is not tech savvy should log in and comfortably get
something done, without being taught first and without opening a help page.

The dashboard body becomes Donny: a greeting, what needs the owner's attention right now, a
prompt box, and a few taps that work.

## 2. What Phase 0 established

Grounded in an audit run 2026-08-08, not assumption:

- **`usePendingActions` → `PendingActionBanners` already produces state-derived proposals** —
  *"Ricky Ricardo applied to 'Taco Tuesday' 2h ago — Review Application →"*, dismissible, capped
  at 3 with a "+N more" overflow. Buried below a greeting, a hero CTA and a frame. **The hard
  part is built.**
- **`FirstRunDashboard` already short-circuits the dashboard** for new users. The zero-state is
  not this design's problem.
- **Three of four stat tiles are hardcoded `'—'`** (Creators, Spend, ROI). Only "Active" is real.
- **`donny_nudges` is a notification feed, not a proposal engine** — 33 rows ever, 0 acted on.
  This design does **not** build on it.
- **Only four Donny tools verifiably work on prod**: `prepare_campaign`, `find_creators`,
  `web_search`, `read_url`.
- **`prepare_campaign` already pre-loads the campaign builder** — auto-populate is verification
  work, not construction.

## 3. Phasing — and why

`spec-document-reviewer` established that every hard problem in the original design lived in one
half of it. The slice is cut there.

**Phase A (this spec's implementation scope).** The dashboard restructure. Taps and proposals
open the **existing** Donny panel via `openDonnyWithContext()`. `DonnyStage` is untouched,
`DonnyChatView` is not used on this page, and no shared context changes. Additive and
independently prod-verifiable.

**Phase B (specified in §13, deferred).** Inline chat — the dashboard *becomes* the chat.

This ordering is a deliberate trade the founder accepted: **for one release the dashboard
launches Donny rather than being Donny.** Phase A is a stepping stone, not a substitute.

## 4. Goals

1. A restaurant owner knows their next move within seconds of landing.
2. Every tap does something real.
3. No path where Donny shrugs — if it cannot do a thing, it says where the thing lives.
4. Nothing that works today is deleted; it moves or is absorbed. **This includes the two rating
   prompts and the location-setup blocker**, which have no other home for this role.

## 5. Non-goals

Inline chat (Phase B). Creator and brand roles. The plain-language terminology pass. The four
open Phase 0 bugs. Re-seeding `donny_knowledge`. Any change to `FirstRunDashboard`.

## 6. Architecture

Feature flag `DONNY_FIRST_DASHBOARD_ENABLED` in `src/lib/featureConfig.ts` (mirrors
`BRAND_ROLE_ENABLED`). Default **off**.

`BusinessDashboard.tsx` becomes a thin three-way switch:

1. `isFirstRun && missions` → `<FirstRunDashboard>` — **unchanged, checked first**
2. flag off → today's body (imported from `BusinessOverview`)
3. flag on → `<DonnyHome />`

New route `/dashboard/business/overview` → `BusinessOverview.tsx`, today's body moved verbatim,
registered in **both** route mirrors.

`DonnyHome` renders inside `DashboardLayout` + `PageBody`, exactly as the current body does — so
the sidebar, mobile bottom nav and header are unchanged and `PageBody`'s no-own-padding rule
applies.

### Components

**`src/components/donny/DonnyHome.tsx` — a container, not a dumb shell.**

The first draft declared five required props *and* had the component calling its own hooks. Those
are two different components. Resolved: `DonnyHome` is the container. It mounts the data hooks,
calls the pure merge function, and renders.

```tsx
export function DonnyHome() {
  const { profile } = useAuth();
  const { openDonnyWithContext } = useDonnyContext();
  const campaigns   = useBusinessActiveCampaigns(activeOrgUnit?.id);
  const readiness   = useLocationReadiness();
  const pending     = usePendingActions();

  const proposals = buildDonnyProposals({ pending, campaigns, readiness });
  …
}
```

**Note the corrected rationale.** The first draft claimed these signals cost "no new query
because the page already fetches this data." That was false by construction — those hooks are
mounted by the body being replaced. `DonnyHome` mounts them itself. The queries are the *same
queries*, so there is no net new load versus today, but the honest statement is "same queries,
newly owned by this component," not "free."

**`src/lib/donny/buildDonnyProposals.ts` — pure.**

Takes already-fetched data as arguments and returns proposals. No hooks, no network, so its tests
need no mocks. (The first draft called a *hook* pure; it wasn't.)

```ts
type ProposalCta =
  | { kind: 'route'; label: string; route: string }
  | { kind: 'ask';   label: string; message: string };

interface DonnyProposal {
  id: string;                  // `${kind}:${actionType}:${campaignId}` | `signal:${key}`
  kind: 'pending_action' | 'signal';
  text: string;                // Donny's voice, plain language
  cta: ProposalCta;
  priority: number;
  dismissible: boolean;
}

interface DonnySuggestion { label: string; message: string; }
```

`DonnySuggestion` stays a separate, simpler type — the reviewer agreed the shapes genuinely
differ and collapsing them would force optional fields everywhere.

**Route CTAs are validated through `isKnownDonnyRoute` before render.** A proposal whose route
fails validation renders as text without a button. Direct lesson of the twelve `/settings/*` CTAs
fixed in PR #409.

### Ranking, cap and dismissal — all previously undefined

- **Order:** pending actions first, newest `occurredAt` first; then signals by fixed priority.
- **Cap 3**, and the **"+N more need attention" overflow line is kept** — the first draft dropped
  it silently.
- **Dismissing promotes**: dismiss #1 and #4 takes its place. This is an explicit test.
- **The location-setup blocker is exempt from the cap** and renders above the list. Today it
  renders unconditionally and it *blocks campaign creation, promotions and DragonShare*. Ranked
  below three pending applications it would vanish, which would be a regression.
- **Dismissal key** reuses the existing 24-hour `localStorage` convention but keys on the proposal
  id, `donnyProposalDismissed_pending_action:${actionType}:${campaignId}:${sourceId}` — **not**
  today's `pendingBannerDismissed_${campaignId}`. `sourceId` is the row's own primary key
  (`campaign_applications.id` / `campaign_collaborations.id`); without it, two different creators
  applying to the SAME campaign collide on one id, and dismissing one silences the other — the
  normal marketplace case of multiple applicants, not an edge case. The existing key is also
  campaign-scoped in the same way, so dismissing an "applied" prompt also hides the "submitted
  content" prompt for the same campaign — Donny goes quiet about delivered work. Not inherited.
- Signals are **not dismissible** in Phase A. Few, low-noise, and each disappears when its
  condition clears.

### The rating prompts

`RatingPromptManager` and `SponsorshipRatingPromptManager` (`variant="row"`) are **mounted
directly inside `DonnyHome`**, below the proposals. They are state-derived "needs you" prompts
with no other home for this role, and moving them to `/overview` — a page nobody visits — would
violate Goal 4. Mounting the existing components verbatim needs no data extraction.

## 7. Quiet-day signals — cut from four to two

The first draft listed four. Two were not implementable from the sources cited:

| Signal | Threshold | Source | Status |
|---|---|---|---|
| Campaign deadline approaching | within **3 days** | `useBusinessActiveCampaigns` → `deadline` | ✅ ships |
| Location setup incomplete | `hasActiveLocation && !isReady` | `useLocationReadiness` | ✅ ships, cap-exempt |
| ~~No campaign in 14 days~~ | — | — | ❌ **cut** |
| ~~Social connected, nothing scheduled~~ | — | — | ⏸ **deferred** |

**Why cut:** `useBusinessActiveCampaigns` selects `id, title, status, deadline` only — there is
no `created_at`, so the 14-day signal cannot be computed from the hook the spec cited. It is also
a nag rather than an action.

**Why deferred:** `UpcomingPostsWidget`'s query is inline in the component, not an exported hook.
The signal would force an extraction, and it mixes org-unit-scoped social readiness with
user-scoped scheduled posts. Revisit with Phase B.

"Deadline approaching" deliberately drops the first draft's "and not yet delivered" qualifier:
delivery state lives in `campaign_collaborations.content_status`, which this hook never fetches.
Two implementers would have built two different predicates.

The 3-day threshold lives in one exported constant. It is a first guess — revisit it against §11
rather than defending it.

## 8. The taps

Constrained to the Phase 0 WORKS list. Business role ships **three**:

| Tap | Tool | Status |
|---|---|---|
| "Create a campaign for…" | `prepare_campaign` | WORKS |
| "Find creators near me" | `find_creators` | WORKS |
| "What's trending for restaurants near me?" | `web_search` | WORKS |

Excluded: anything routing to `social_*` (0/7 on prod), and analytics claims the honest-analytics
work already had to walk back. **A tap that produces a shrug is worse than no tap.**

**`DonnyHome` does not render `useDonnyQuickChips`.** That hook matches `/dashboard/business`
exactly and returns a **"📊 Campaign stats"** chip — precisely the analytics claim excluded
above. It would have silently re-introduced what this section rules out. The panel keeps its own
chips when opened; that is existing behaviour, unchanged, and out of scope.

## 9. The tour — Phase A must not break it

`RESTAURANT_TOUR` (`src/lib/tours/role-tours.ts`) has four steps. Replacing the body removes the
`[data-tour='brief-generator']` anchor (on `HeroPrimaryAction`) and the `TourButton` that triggers
it.

Phase A fix: put `data-tour="brief-generator"` on `DonnyHome`'s prompt input, and render
`TourButton` beside the "View full dashboard →" link. `[data-tour='donny-help']` (on
`DonnyNavButton`) and `[data-tour='bottom-nav-add']` are unaffected in Phase A, because Phase A
does not hide the nav button — **that hazard belongs to Phase B**.

## 10. Failure and empty states

| Condition | Behaviour |
|---|---|
| `usePendingActions` errors | Signals render alone (matches today: the banner returns `null` on error) |
| `useBusinessActiveCampaigns` errors | Deadline signal omitted; everything else renders |
| Proposals loading | `DCSkeleton` rows, not a spinner |
| No proposals, no signals | Greeting + taps + input. Never a blank screen. |
| Panel fails to open | The tap is a no-op the user can retry; existing `openDonnyWithContext` behaviour, unchanged |
| Donny cannot do the thing | Says where it lives and offers to navigate, routed through `isKnownDonnyRoute`. A generic apology is a bug. |

Phase A has **no unmount-mid-stream and no stage-transition failure modes** — it does not own a
conversation. Both are Phase B's problem and are specified in §13.

## 11. Metrics

Named `analytics_events` events, so this is implementable as written. **Do not persist a
firehose** — see the `analytics_events` firehose incident in `SHIPPED_LOG.md`.

| Event | Payload |
|---|---|
| `donny_home_viewed` | `{ role, proposal_count, has_pending }` |
| `donny_home_proposal_tapped` | `{ proposal_kind, cta_kind }` |
| `donny_home_proposal_dismissed` | `{ proposal_kind }` |
| `donny_home_suggestion_tapped` | `{ label }` |
| `donny_home_prompt_submitted` | `{}` |
| `donny_home_overview_opened` | `{}` |

Read as: proposal action rate vs dismiss rate (**the number to beat is 0%** — `donny_nudges`'
lifetime record); time from view to first action; and fall-through, where `donny_home_viewed`
is followed by a nav click with no other event. Fall-through is the honest "did it work" signal.

## 12. Testing

- `buildDonnyProposals` — merge, rank, cap, **promotion on dismiss** (dismiss #1 → #4 appears),
  cap-exemption of the setup blocker. Pure function, fixture-driven, no mocks.
- Each signal predicate — table-driven.
- Every proposal CTA route asserted through `isKnownDonnyRoute`.
- **Route-mirror parity test — new, and the first of its kind.** The claim that the existing
  "every builder output is a known route" test would cover the new route was wrong: that test
  loops the builder *functions*, not the route table. **Nothing currently asserts the client and
  server mirrors agree.** Add a test that the two `ROUTE_TEMPLATES` arrays are identical.
- `DonnyHome` under RTL — greeting with a name, without a name (never "undefined"), proposals
  render, rating prompts render, taps call `openDonnyWithContext`. Mock `useDonnyContext` the way
  `DonnyMessage.test.tsx:20` already does.
- RTL files need `// @vitest-environment jsdom` + the jest-dom import as the **first two lines** —
  jsdom is per-file in this repo, not global.
- `npm run test` exits 1 on ~103 pre-existing failing files. Trust "N passed, 0 failed", not the
  exit code.

## 13. Phase B — inline chat (deferred, specified so the hazards are not lost)

Phase B makes the dashboard *become* the chat. It must resolve all of the following, each
verified against code by the reviewer:

1. **`DonnyChatView` cannot be reused as-is.** It renders `DonnyPanelHeader` with
   `onCollapse={collapse}` / `onClose={close}`. Inline, `collapse()` sets `stage='tray'`,
   un-hiding the panel → **two Donnys on one screen**. `close()` sets `stage='closed'`, disabling
   the conversation's queries while the page is still mounted, unrecoverable because
   `setInline()` is mount-only. Needs header suppression or provider-level guards.
2. **Guard `close()`/`collapse()` in `DonnyProvider`, not by convention** — make them no-ops while
   `stage === 'inline'`.
3. **Audit every co-mounted `stage` consumer**, not three of five. Known:
   `DonnyNavButton`, `DonnyDesktopPanel`, `DonnyMobileSheet`, `DonnyPanelHeader` (via
   `DonnyChatView`), the desktop header Donny button at `DashboardLayout.tsx:230-242`, and
   `DonnyMessage.tsx:122` (`close()` before `navigate()`).
4. **`setInline()` arriving from `'chat'`** — a panel session opened on another page. Decide
   restore-previous-stage vs always-close; unmount cleanup currently destroys it.
5. **Unmount mid-stream** — `useDonny`'s send has no `AbortController` and `DonnyProvider` sits
   above the router, so the stream survives navigation and the reply persists. State that as the
   intended contract; note `close()` on cleanup disables the messages query so the reply is not
   refetched, and `isSendingRef` stays true until settle.
6. **Layout** — `DonnyChatView` is an `h-full` flex column sized for a fixed panel. Inside the
   scrollable `<main id="main-content">`, `h-full` has no definite height, and its auto-scroll
   writes to its own `scrollRef`, not the real scroller.
7. **Tour anchors** — Phase B hides `DonnyNavButton`, orphaning `[data-tour='donny-help']` and
   leaving `MobileBottomNav.tsx:48`'s wrapper `<div>` empty for `[data-tour='bottom-nav-add']`.

## 14. Rollout

1. Build Phase A behind `DONNY_FIRST_DASHBOARD_ENABLED` (default off)
2. Claude review → `/simplify` → `codex-review` until clean
3. Merge; flip the flag on
4. `verify-prod` — screenshot desktop **and** mobile, console errors, on dragoncandy.io
5. Read §11 before starting Phase B or touching creator/brand
6. `knowledge-sync`

## 15. Follow-ups

- Phase B (§13)
- Creator and brand dashboards
- The plain-language terminology pass — the bigger lever for the Mom Test, and a prerequisite for
  writing this dashboard's copy well
- The four Phase 0 bugs: fabricated DC Points redemption rates; `social_*` failing while blaming
  the user's connection; `acted_at` never recorded; the "Later" button posting
  `Execute action: dismiss with {}` into the chat
- Whether a creator should ever see an "Upgrade" CTA (surfaced by PR #409, unanswered)
- Real "frequently used" prompt ranking from `donny_messages` — v1 is curated
