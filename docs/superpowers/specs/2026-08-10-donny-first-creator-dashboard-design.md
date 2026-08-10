# Donny-First Creator Dashboard — Design (Phase 3)

> Status: approved design, ready for implementation planning.
> Date: 2026-08-10 · Author: Claude Code with Dame Williams
> Parent: `docs/superpowers/specs/2026-08-09-donny-dashboard-unification-design.md` §6 "Phase 3".
> Input audit: `.claude/handoffs/2026-08-10-donny-first-creator-dashboard-audit.md`
> (copied into this worktree and committed — it was untracked in `dc-improvements-21`,
> whose branch is already merged, so `worktree-cleanup` would have deleted it).

## 1. What this is

The business role got a Donny-first dashboard across PRs #423, #426, #428 and #429:
the `/dashboard/business` body is Donny — a greeting, an attention list, a prompt box
and a small row of taps — with the previous body preserved verbatim at
`/dashboard/business/overview`. This ships the same experience for the **creator**
role.

Brand is out of scope. `BRAND_ROLE_ENABLED` is `false`, so the brand half cannot be
prod-verified through the normal flow. The components are nonetheless built
role-generic, per the parent design §6, so adding brand later is configuration.

## 2. The audit, re-verified

The parent design's §6 note is explicit that Phase 3 is not pure configuration, and
the prod audit exists because the business scope was set by measurement rather than
by the mockup. That discipline is why the audit was re-run rather than read.

**Re-measured against prod on 2026-08-10 16:29 UTC.** Three of its claims moved, and
one of its premises was wrong.

| Audit claim | Measured 2026-08-10 | |
|---|---|---|
| 17 pending invitations — "the strongest bucket" | 17 rows, **all 17 expired**; newest lapsed 2026-08-09 14:07 UTC. `useCreatorPendingInvitations` already exists and filters on `expires_at`, so it returns **0 rows for every creator** | changed |
| 24 open campaigns = real supply | 24 `published` + non-crew, but only **8** survive `get_unavailable_campaign_ids()`, and **0** have a future deadline — the latest across all 24 is 2026-08-02 | changed |
| 18 creators | 18 `profiles` rows with `role='content_creator'`; only **15** have a `creator_profiles` row | nuance |
| 26 creators with DC Points | 26 across all roles; **13** are creators — 52 creator point events, top balance 4,650 | confirmed |
| 5 content-pending collaborations | 5 rows across **4** creators | confirmed |
| 3 pending applications | 3 rows across **2** creators | confirmed |
| 3 of 18 payout-ready | Confirmed, but the composition matters: **14** have no `stripe_account_id`, **1** has an account with the flag still `false`, 3 are ready | nuance |
| 1 creator with a $360 pending balance | Confirmed — and that creator **is** the ambiguous one | nuance |
| `donny_tool_executions` has zero creator rows, so every tap is unproven | True as a statement about the table, but the premise it rests on is wrong — see §2.1 | **premise wrong** |

### 2.1 `donny_tool_executions` cannot prove or disprove any tap

The audit treats an empty table as evidence that no creator tap has ever worked. The
insert that populates it sits **inside the `isSocialTool(toolName) && mcpBridge`
branch** of `donny-orchestrator/index.ts:499-520`. Sub-agents are dispatched through
`dispatchAgent` and are **never logged at all**, for any role. Every row in the table
today is either an MCP social tool or a tool belonging to the *internal* AIOS Donny
(`donny-chat`), which is a different edge function.

So `rewards_agent`, `campaign_agent`, `billing_agent`, `guidance_agent`,
`dragonshare_agent`, `find_creators` and `prepare_campaign` have zero rows **for
business too** — including the two taps the business dashboard shipped. The absence
of rows is not evidence of absence of use, and no amount of creator traffic will ever
produce a row for these taps.

This is the trap `docs/DATABASE_SCHEMA.md` already records against this very table
("an empty table is indistinguishable from 'no errors'"), reached from the other
direction.

**Consequence for this design: the acceptance bar changes.** A tap cannot be proven
by waiting for a log row. It is proven by running the agent's own queries against
real creator ids — which is what the agent itself does, with the same service-role
client. That is the method used in §2.2. A live signed-in creator session remains the
stronger proof and belongs in `verify-prod`, but it cannot be a merge gate, because
the founder's own account is the only prod creator login available and Claude may not
type passwords.

### 2.2 The taps, proven at the data layer

| Candidate | Verdict | Evidence |
|---|---|---|
| `rewards_agent` | **Proven** | Its exact read, `dre_user_aggregates`, returns `balance 4650, role content_creator, campaigns_completed 8, avg_rating 4.75` for a real creator, with 19 ledger events. The agent has an explicit `content_creator` branch and a creator-prefixed earn catalog. `DRAGON_REWARDS_ENABLED` is on and `dre_config.go_live_at` is 2026-06-28 (past). 13 of 18 creators have a non-zero balance. |
| `campaign_agent` | **Real, partial** | `creatorSummary` reads the creator's own applications and collaborations. Real for the **5 of 18** creators who have ever applied or collaborated (top creator: 13 applications, 9 collaborations, 13 involved campaigns). For the other 13 it returns honest zeros plus a "Browse campaigns" action — an empty answer, not a wrong one. |
| `billing_agent` | **Wrong for creators** | It reads `organizations` for tier, seats and `stripe_customer_id`. A creator has no org, so `orgId` is undefined, `currentTier` falls to `free`, and the creator is handed the **restaurant subscription catalog** — "1 active campaign, 10% take rate, Campaign brief generation (1/week)" — plus an "Upgrade to Starter" action. The only creator-correct thing it does is resolve `billingRoute('content_creator')`. |
| "find work" | **No agent exists** | `find_creators` returns creators, which is the wrong direction. `campaign_agent` returns only campaigns the creator is *already* in. `general_agent` is RAG-only. Nothing in the orchestrator returns open campaigns to a creator. |
| `guidance_agent` | Has material, not used | 32 help articles; "When do creators get paid?" and "How DragonShare works (creator)" both match a payout query. Excluded anyway — see D4. |
| `dragonshare_agent` | Too thin | 10 DragonShare posts platform-wide. The audit already excluded it; unchanged. |

## 3. Decisions

D1–D3 were the founder's calls on 2026-08-10, taken after the re-verified numbers
above. D4–D6 follow from them and from the parent design.

**D1 — The invitation item fires on the campaign still being open, not on
`expires_at`.** All 17 pending invitations point at campaigns that are still
`published`, and none of the invited creators has applied. The codebase is split on
what expiry means: `useCreatorPendingInvitations` hides expired rows, while
`useCreateApplication` ignores `expires_at` entirely and lets an expired-but-pending
invitation grant apply rights to a non-published campaign. Since a `published`
campaign is public and applying works regardless, gating the *nudge* on a column that
does not gate the *action* would hide 17 live opportunities from 9 creators. The item
fires when the invitation is `pending` and the campaign is still `published` and the
creator has no application on it.

> This deliberately does not reuse `useCreatorPendingInvitations` unchanged, and
> deliberately does not "fix" that hook — the marketplace's own invitation card is a
> different surface with its own reasons. The inconsistency is recorded here, not
> resolved.

**D2 — Two taps, not three.** Only `rewards_agent` is unambiguously proven; the
business version already set the precedent of cutting a tap rather than shipping a
shrug. "Get paid" is dropped as an ask entirely and becomes attention item C, because
a money-shaped question is exactly what would route to `billing_agent`. "Find work"
is dropped as an ask because no agent can answer it, and becomes attention item E.

**D3 — The ambiguous payout case leads with the money, not the homework.** One
creator has a Stripe account, `stripe_onboarding_complete = false`, and the $360
pending balance. That flag is known to go stale-false because the webhook never
delivers (#173), and the only verifier — `_shared/payout-ready.ts` — calls the Stripe
API from the backend, so the frontend cannot distinguish "unfinished" from "finished,
webhook missed it". The copy is therefore true under both readings: *"You have $360
waiting — check your payout setup."* Telling someone who is already set up to go set
up is the #357 false-"verify your email" class, and this is the top item on the page.

**D4 — No new backend.** No migration, no edge-function change, no RLS change, no new
agent. Everything the creator surface needs is reachable under the creator's own RLS.
`campaign_invitations` SELECT allows `creator_id = auth.uid()` (verified against
`pg_policy`).

**D5 — Copy: an invitation is a nudge to apply, never an assignment.** No Accept
button, no "you've been selected", no implied priority. The campaign is already public
and the invitation carries none (#382). The item reads *"N businesses asked you to
apply."*

**D6 — Build role-generic, ship creator-only.** Per the parent design §6. Brand gets
no route, no suggestion set and no container in this phase.

## 4. Architecture

### 4.1 Split `DonnyHome` three ways

`DonnyHome.tsx` today is ~200 lines of conversation machinery — the queued ask, the
visit baseline, the scroll intent, the `messagesErrored` handling — wrapped in a
business-specific data shell, with `<DashboardLayout userRole="business_client">`
hardcoded at **two** sites. That machinery cost four Codex rounds and is
founder-verified on prod; it must be moved, not rewritten.

| Unit | Responsibility |
|---|---|
| `src/hooks/donny/useDonnyHomeConversation.ts` | Every piece of the conversation machinery, moved verbatim: `queuedAsk`, `visitBaselineId`, `dispatch`, `visitMessages`, the flush effect, `isBusy`, `askedHere`, `historyUnavailable`, `threadError`/`threadRetry`, `hasConversation`, `composerRef`, `userAskedHere`, `ask`. Role-agnostic; consumes `useDonnyContext()` only. |
| `src/components/donny/DonnyHomeShell.tsx` | The layout. Props: `userRole`, `roleLabel`, `badge?`, `overviewRoute`, `suggestions`, `proposals` slot, `greetingName`. Owns the collapsing hero, the two-arrangement wrapper, `DonnyThreadRegion`, `DonnyHomePrompt`, the overview link and the tour. |
| `src/components/donny/DonnyHome.tsx` | Business container. Same external behaviour as today: `usePendingActions`, `useUpcomingCampaignDeadlines`, `useLocationReadiness`, `buildDonnyProposals`, `BUSINESS_SUGGESTIONS`, `LocationBadge`, the two rating managers. |
| `src/components/donny/CreatorDonnyHome.tsx` | Creator container: the §4.3 hooks, `buildCreatorProposals`, `CREATOR_SUGGESTIONS`, `RatingPromptManager`. No `LocationBadge` — locations are an org concept. |

**Why separate containers rather than one component with a `role` prop.** Hooks
cannot be conditional. A single component would fire `usePendingActions` — which is
scoped `campaigns.user_id = auth.uid()` — for every creator, spending a query to
receive an empty array that the creator's RLS guarantees. Two containers over one
shell is the boundary that keeps each role paying only for its own data.

**What must not change.** `DonnyThreadRegion` and `DonnyHomePrompt` are already
role-parameterized and are reused byte-unchanged. The conversation block keeps
`max-h-[calc(100dvh-12rem)] min-h-[20rem]`, founder-verified on mobile 2026-08-10 —
that number is derived from the collapsed hero and is not to be re-derived. The
composer must stay at the same slot in the element tree across the resting →
conversation switch; `DonnyHomeShell` renders the wrapper in both states for exactly
that reason, and a remount would drop focus and any half-typed follow-up.

**Regression net.** `DonnyHome.test.tsx` (12 tests), `DonnyHomePrompt.test.tsx` and
`DonnyThreadRegion.test.tsx` must pass unchanged. If the extraction is a move, they
do. If any of them needs editing, that is the signal the extraction changed
behaviour.

### 4.2 The creator overview page

`/dashboard/creator/overview` does not exist. Extract it the way #411 extracted
`BusinessOverview`:

- `src/pages/CreatorOverview.tsx` — today's `CreatorDashboard` body, verbatim,
  including `DashboardGreeting`, `HeroPrimaryAction` ("Find paid work"), `StatsRow`,
  the DragonShare tiles, `NeedsAttentionSection`, `RecentActivitySection`, the
  calendar disclosure and `UpcomingPostsWidget`. All three body tour anchors travel
  with it.
- `src/pages/CreatorDashboard.tsx` — reduced to the same three-way switch
  `BusinessDashboard` is: first-run missions first, then
  `DONNY_FIRST_DASHBOARD_ENABLED`, then `CreatorDonnyHome`.
- `src/App.tsx` — a lazy route at `/dashboard/creator/overview` under
  `ProtectedRoute`. Creators have no role guard equivalent to `BusinessRoute`;
  `ProtectedRoute` is what every other `/dashboard/creator/*` route uses.

**The route must be registered in three places or a test fails.** `src/App.tsx` is
the real table; `src/lib/donnyRoutes.ts` is the client-side guard; the orchestrator's
`ROUTE_TEMPLATES` in `supabase/functions/donny-orchestrator/routes.ts` is the
server-side allow-list. `src/lib/donnyRoutes.parity.test.ts` diffs the last two, so a
one-sided edit is caught at test time. Adding it to the allow-list is what stops
`isKnownDonnyRoute` downgrading the "← Dashboard" CTA to a dead label.

### 4.3 Creator data hooks

`usePendingActions` is business-scoped and cannot be parameterized into service. The
creator container needs its own reads, all under the creator's own RLS:

| Hook | Reads | Feeds |
|---|---|---|
| `useCreatorAttentionInvitations` | `campaign_invitations` where `creator_id = auth.uid()` and `status='pending'`, joined to `campaigns` filtered to `status='published'`, excluding campaigns the creator already applied to | Item D |
| `useCreatorContentTodo` | `campaign_collaborations` where `creator_id = auth.uid()` and `content_status='pending'` | Item A |
| `useCreatorPendingApplications` | `campaign_applications` where `creator_id = auth.uid()` and `status='pending'` | Item B |
| `useCreatorPayoutState` | `creator_profiles` (`stripe_account_id`, `stripe_onboarding_complete`, `pending_balance`) for the caller, via `.maybeSingle()` | Item C |

`useCreatorPayoutState` **must use `.maybeSingle()`, never `.single()`**. Three of the
18 creators have no `creator_profiles` row at all; `.single()` throws on zero rows,
and the resulting error would be indistinguishable from a real failure. A missing row
means "no Stripe account", which is item C's `no stripe_account_id` branch — the
right answer, reached honestly.

Every query names its columns explicitly; `select *` is forbidden. Every hook handles
its own error state, and an errored query contributes **no** proposal rather than a
zero — a failed read must never render as "you have nothing to do".

### 4.4 `buildCreatorProposals.ts`

Pure, no hooks, no network, no `Date.now()` — `now` is injected, mirroring
`buildDonnyProposals`. It returns the same
`{ blocker, proposals, overflowCount, allProposalIds }` shape so `DonnyHomeProposals`
renders it with no change, and reuses `routeCta()` so an unknown route downgrades to
text instead of shipping a dead button.

Proposal ids follow the existing convention and must be stable, because they are the
dismissal keys: `creator:invitation:${campaignId}`, `creator:content_todo:${collabId}`,
`creator:application:${applicationId}`, `creator:payout`, `creator:find_work`.

**The items:**

| | Item | Fires when | CTA | Live today |
|---|---|---|---|---|
| A | Content not started | a collaboration with `content_status='pending'` | route → `/dashboard/creator/my-campaigns/:id` | 4 creators |
| B | Waiting on a reply | an application with `status='pending'` | route → `/dashboard/creator/my-campaigns?tab=applied` | 2 creators |
| C | Payouts | see the table below | route → `/dashboard/creator/earnings` | 14 creators |
| D | Invitations | pending invite, campaign still `published`, no application yet | route → `/dashboard/creator/campaigns/:id` | 9 creators |
| E | Find work | nothing in flight | route → `/dashboard/creator/campaigns` | 8 visible campaigns |

**Item C's four states, in order:**

| State | Item |
|---|---|
| `stripe_onboarding_complete === true` | **none** — it disappears for the 3 who are set up |
| `pending_balance > 0` | "You have $360 waiting — check your payout setup" |
| no `stripe_account_id` (including no `creator_profiles` row) | "Set up payouts so you can get paid" |
| account set, flag false, no balance | **silent** — the state is unknowable from the client, and there is no urgency to justify a guess |

**Item C's ranking — the conditioning rule.** C ranks **first** when
`pending_balance > 0 || collaborations.length > 0` — money is coming, or work is in
flight. Otherwise it ranks **below** E. `PROJECT_CONTEXT.md` §7 is explicit: *"Never
ask users to configure before they understand why."* Telling a creator with no
earnings and no work to go do Stripe onboarding is precisely
configure-before-you-understand-why; telling a creator with $360 sitting in a pending
balance is urgent and concrete. Both cases are live on prod right now.

A permanently-parked dead item at the top of the list trains people to ignore the
whole region, which is why the `=== true` branch removes it entirely rather than
rendering a satisfied state.

**Copy for item D — the hard constraint.** *"N businesses asked you to apply"*, with
the campaign titles. Never "you've been selected", never an Accept affordance, never
implied priority. The campaign is already public; the invitation is a nudge with zero
standing (#382). Where the invitation is old, the copy may say so ("invited 8 days
ago") — honest about staleness without hiding the opportunity.

`PROPOSAL_CAP` stays at 3, as on the business side.

### 4.5 `CREATOR_SUGGESTIONS`

Appended to `src/lib/donny/donnyHomeSuggestions.ts` beside `BUSINESS_SUGGESTIONS`,
under the same rule that file already records: constrained to what a capability audit
proved works.

```ts
export const CREATOR_SUGGESTIONS: DonnySuggestion[] = [
  { label: 'My DC Points',   message: "How many DC Points do I have and what's my creator standing?" },
  { label: 'My applications', message: "What's happening with my campaign applications?" },
];
```

The wording is load-bearing, not decorative. Tool choice is made by the model from
the tool descriptions, and nothing role-gates the tool list, so a tap's phrasing is
the only thing steering it. "DC Points" and "standing" are distinctive to
`rewards_agent`; "campaign applications" matches `campaign_agent`'s description
verbatim. **No tap may be money-shaped**, because `billing_agent`'s description
("pricing, subscription tiers, upgrading, billing, invoices") is what a "how do I get
paid" question would land on — and §2.2 shows what a creator gets when it does.

Extending the file's own comment: do not add a third tap without re-running the
capability audit, and note that `donny_tool_executions` cannot be the instrument
(§2.1).

### 4.6 The creator tour

`CREATOR_TOUR` (`src/lib/tours/role-tours.ts:32-53`) has four steps. Three target
anchors that live in the `CreatorDashboard` body being replaced —
`[data-tour='profile-completion']` (`StatsRow`), `[data-tour='browse-campaigns']`
(`HeroPrimaryAction`) and `[data-tour='dragonshare-nav']` (`DragonShareStatTile`).

The business tour survived Phase A by luck: `org-switcher`, `bottom-nav-add` and
`donny-help` are app chrome, and `brief-generator` sits on `DonnyHomePrompt`, which
the parent design §4.10 explicitly required be carried forward. The creator tour has
no such luck.

`DCTour` degrades rather than crashes — `document.querySelector` misses,
`targetRect` stays `null`, and the popover renders centred with no spotlight
(`DCTour.tsx:28-33`). So this ships as three quiet dead steps unless re-pointed.

Re-point the three body steps at anchors that exist on the new page: the prompt box
(`DonnyHomePrompt` already carries `data-tour="brief-generator"` and is reused
unchanged), the attention region, and the overview link. The old anchors travel to
`CreatorOverview`, where the tour still resolves them if triggered from that page.

## 5. Testing

**Unit (Vitest, co-located).** `buildCreatorProposals.test.ts` carries the weight,
because it is pure and every rule above is a branch:

- Item C is absent when `stripe_onboarding_complete === true`.
- Item C is the balance copy when `pending_balance > 0`, whatever the flag says.
- Item C is silent when an account exists, the flag is false, and there is no balance.
- Item C ranks above everything when a balance or a collaboration exists, and below E
  when neither does.
- Item D fires for a `published` campaign and not for any other status.
- Item D does not fire when the creator already has an application on that campaign.
- Item D is unaffected by `expires_at` in either direction (D1).
- An errored input contributes no proposal, and never a zero.
- Ids are stable across rebuilds, since they are the dismissal keys.
- `PROPOSAL_CAP` and `allProposalIds` behave as on the business side — the full
  pre-cap id list is returned so a dismissal below the cap is not resurrected.

**Regression.** `DonnyHome.test.tsx`, `DonnyHomePrompt.test.tsx` and
`DonnyThreadRegion.test.tsx` pass **unchanged**. Needing to edit them means §4.1's
extraction changed behaviour.

**Route parity.** `donnyRoutes.parity.test.ts` must pass with the new overview route
in both mirrors.

> `npm run test` exits `1` from pre-existing failing files in the main checkout. From
> a worktree the suite is green, so red here is a real regression. RTL tests need
> `// @vitest-environment jsdom` plus the jest-dom import as the first two lines —
> jsdom is per-file here, not global.

**Manual, on prod, both viewports (`verify-prod`).** This is the first both-viewport
check ever run on a Donny-first dashboard for the creator role, and the parent design
records that the business one has still never had one either — so budget for finding
inherited bugs. Land on `/dashboard/creator` and confirm the resting arrangement;
send and confirm the answer lands inline and the panel does not open; confirm the
hero collapses and the thread is readable on a phone; tap both suggestions and
confirm each returns something real rather than a shrug; follow "← Dashboard" to
`/dashboard/creator/overview` and confirm the old body is intact; reload and confirm
you land on the dashboard, not mid-thread; check the console on both viewports.

**The taps' live proof.** `verify-prod` is where the two taps are exercised by a real
signed-in creator for the first time. If `campaign_agent` returns something unhelpful
for a creator with no history, cut it to one tap rather than shipping it — the same
call the business version made.

## 6. Constraints and known traps

- **Desktop and mobile are separate targets.** `lg:`/`xl:` for desktop, unprefixed for
  mobile. Do not re-derive the conversation block's sizing; it is founder-verified.
- **`dvh`, never `vh`**, and safe-area insets on anything bottom-anchored. The app
  document never scrolls, so iOS toolbars never collapse and `vh` overshoots.
- **`window.scrollY` is always `0`.** The scroller is `#main-content`. The existing
  `scrollIntoView({ block: 'nearest' })` handles this and moves with the machinery.
- **No gray surfaces or badges.** Use the light-app kit — `PageBody`, `AppCard`,
  `AppStatusBadge`, `dc-*` tokens. Muted *text* is fine.
- **`AppChip`'s off state is muted on purpose** and is wrong for a chip that is the
  primary affordance. The taps use `DonnyHomePrompt`'s existing treatment, which is
  already correct — do not substitute `AppChip`.
- **`select *` is forbidden**; every Supabase query names its columns and handles its
  error.
- **`.maybeSingle()`, never `.single()`**, for any per-user row that may not exist
  (§4.3).
- **A migration ledger row is not proof an object exists.** Nothing here needs a
  migration, but the same rule applies to any claim about prod made during
  implementation: verify the object.
- **Verify on prod, not staging.** Staging is drift-corrupted, so its green smoke gate
  is false assurance.

## 7. Review gates

1. `/simplify` before presenting code.
2. **Codex second review** — `codex review --base main` from the worktree, re-run
   until clean. A blank run is a failed gate, not a pass.
3. Both-viewport `verify-prod` after merge.
4. `knowledge-sync` on branch finish — wiki source, `/wiki-ops ingest`,
   `SHIPPED_LOG.md` prepend, `PROJECT_CONTEXT.md` §5 index line, Donny RAG sync after
   merge.

`data-exposure-reviewer` and `edge-function-reviewer` do **not** apply: no edge
function changes, no service-role read, no RLS policy, no new bucket, no migration.

## 8. Non-goals

- The brand role. `BRAND_ROLE_ENABLED` is `false`; no route, no suggestion set, no
  container.
- A `find_campaigns` sub-agent. It is the creator's core job and the obvious follow-up,
  but it is orchestrator work with its own deploy and review gates, and this phase is
  a frontend generalisation.
- Fixing `billing_agent` for creators. Out of scope; the fix here is not to route a
  creator there.
- Reconciling `useCreatorPendingInvitations`' expiry filter with
  `useCreateApplication`'s lack of one. Recorded in D1, not resolved.
- Extending `donny_tool_executions` to log sub-agents. It is the right fix for §2.1
  and it is its own task.
- Changing the docked panel or the mobile sheet.
- Attachments — parent design Phase 2, unshipped, and unchanged by this.

## 9. What this delivers

**Deletes** — the creator's need to know which of nine pages holds the thing that
needs them; the dead "Donny tools" section that offered one content-idea card; three
tour steps that would have pointed at nothing.

**Simplifies** — one dashboard body per role instead of two divergent ones; one shell
and one conversation hook instead of a business component and a creator copy of it;
one proposals contract rendering both roles' attention lists.

**Automates** — nothing new. Donny already reads this data; this stops the creator
having to go looking for it.

**Keystrokes removed** — a creator with $360 unpaid currently has no path from the
dashboard to that fact; it is now the first line on the page with a one-tap route.
Asking "what's happening with my applications" replaces a navigation to
`/dashboard/creator/my-campaigns`, a tab switch, and a scan of 13 rows.
