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

**D4 — No backend behaviour change, and no deploy.** No migration, no RLS change, no
new agent, no change to any edge function's behaviour. Everything the creator surface
needs is reachable under the creator's own RLS: `campaign_invitations` SELECT allows
`creator_id = auth.uid()` (verified against `pg_policy`).

> **One edge-function *source* file is nonetheless edited.** `ROUTE_TEMPLATES` lives
> in `supabase/functions/donny-orchestrator/routes.ts`, and
> `src/lib/donnyRoutes.parity.test.ts` is **bidirectional** — it fails both when a
> server route is missing from the client and when a client route is missing from the
> server, with a documented `ALLOWED_CLIENT_ONLY` exception list that covers two
> legacy Crews redirects and nothing else. So `/dashboard/creator/overview` must be
> added to **both** mirrors; adding it to the client alone fails the second
> assertion, and widening `ALLOWED_CLIENT_ONLY` to dodge that would be abusing a list
> whose stated purpose is legacy redirects.
>
> **No redeploy of `donny-orchestrator` is required**, and this is a reasoned
> conclusion rather than an omission. The server list governs exactly one thing:
> `isKnownRoute` drops routes the *model* invents from `suggested_actions`. No agent
> returns `/dashboard/creator/overview` in its `suggested_actions` — the route is
> brand new and nothing references it — and the "← Dashboard" control is a hardcoded
> `<Link>` in the shell, not an LLM-emitted route, so it is never subject to the
> guard. The worst case of the skew is that Donny cannot spontaneously emit a link to
> a page it has no reason to emit.
>
> **Record the skew rather than assume it away.** After merge the repo's server list
> and the deployed function's list differ by one entry until the next
> `donny-orchestrator` deploy for any reason picks it up. Anyone later reading
> `routes.ts` as evidence of prod behaviour would be wrong — this project's recurring
> "merged ≠ deployed" trap, reached from the harmless end.

**D5 — Copy: an invitation is a nudge to apply, never an assignment.** No Accept
button, no "you've been selected", no implied priority. The campaign is already public
and the invitation carries none (#382). One row per invitation, reading
*"{Business} asked you to apply to \"{campaign title}\""*.

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
| `src/hooks/donny/useDonnyHomeConversation.ts` | Every piece of the conversation machinery, moved verbatim: the `registerInlineConversation` mount effect, `queuedAsk`, `visitBaselineId`, `dispatch`, `visitMessages`, the flush effect, `isBusy`, `askedHere`, `historyUnavailable`, `threadError`/`threadRetry`, `hasConversation`, `composerRef`, `userAskedHere` and its scroll effect, and `ask`. Role-agnostic; consumes `useDonnyContext()` only. |
| `src/components/donny/DonnyHomeShell.tsx` | The layout only. Owns the collapsing hero, the two-arrangement wrapper, `DonnyThreadRegion`, `DonnyHomePrompt`, the `!profile` skeleton, the overview link and the tour. Holds no conversation state. |
| `src/components/donny/DonnyHome.tsx` | Business container. Same external behaviour as today: `usePendingActions`, `useUpcomingCampaignDeadlines`, `useLocationReadiness`, `buildDonnyProposals`, `BUSINESS_SUGGESTIONS`, `LocationBadge`, the two rating managers. |
| `src/components/donny/CreatorDonnyHome.tsx` | Creator container: the §4.3 hooks, `buildCreatorProposals`, `CREATOR_SUGGESTIONS`, `RatingPromptManager`. No `LocationBadge` — locations are an org concept. |

**The container calls the hook and passes its result down.** Not the shell. The
container needs `ask` directly, because `handleProposalTap` routes a
`cta.kind === 'ask'` proposal through it (`DonnyHome.tsx:346-352`), and because the
three `trackEvent` calls for prompt submit, suggestion tap and proposal tap must stay
in the component the existing tests assert against.

`DonnyHomeShell`'s full prop list follows from that:

```ts
interface DonnyHomeShellProps {
  userRole: UserRole;              // the alias from src/types/user.ts, as DonnyThreadRegion uses
  roleLabel: string;               // "Restaurant Dashboard" | "Creator Dashboard"
  greetingName: string;
  subtitle: string;
  badge?: ReactNode;               // LocationBadge for business, omitted for creator
  overviewRoute: string;
  onOverviewOpen: () => void;      // the trackEvent call stays in the container
  suggestions: DonnySuggestion[];
  onSubmit: (text: string) => void;
  onSuggestionTap: (s: DonnySuggestion) => void;
  profileLoaded: boolean;          // drives the skeleton branch
  children: ReactNode;             // the proposals block, rendered by the container

  /** Per-role tour anchors for the two elements the SHELL owns (§4.6).
   *  Business passes nothing; creator passes both. Keeps the shell role-generic
   *  and DonnyHomePrompt byte-unchanged. */
  tourAnchors?: { prompt?: string; overview?: string };

  // straight from useDonnyHomeConversation, spread by the container
  hasConversation: boolean;
  isBusy: boolean;
  historyUnavailable: boolean;
  composerRef: React.RefObject<HTMLDivElement>;
  thread: {
    messages: DonnyMessage[];
    avatarState: DonnyAvatarState;
    streamingContent: string;
    error: string | null;   // the hook's DERIVED threadError, not the raw error
    retry: () => void;      // the hook's DERIVED threadRetry, not the raw retry
  };
}
```

> `thread.error` and `thread.retry` are the hook's **derived** `threadError` /
> `threadRetry`, never the raw `error` / `retry` from context — the derivation is what
> makes a failed history load offer the refetch that actually fixes it rather than a
> replay that cannot. And `historyUnavailable` is passed for exactly one purpose: the
> shell computes `isStreaming={isBusy && !historyUnavailable}` (`DonnyHome.tsx:484`),
> because a typing indicator rendered over an error is a lie about what is happening.
> Both are easy to drop or re-invent wrongly during the extraction, so they are named
> here.

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

**Regression net.** `DonnyHome.test.tsx` — **37 `it()` cases across 8 `describe`
blocks**, not the 12 the parent design §8 cites, which was written pre-Phase-B —
plus `DonnyHomePrompt.test.tsx` and `DonnyThreadRegion.test.tsx`, all passing
unchanged. If the extraction is a move, they do. If any needs editing, that is the
signal the extraction changed behaviour.

> **Several of those tests pin structure, not just behaviour, so the shell's markup
> is constrained.** `DonnyHome.test.tsx:493-495` reaches the conversation block by
> `getByRole('log').parentElement.parentElement` to assert
> `max-h-[calc(100dvh-12rem)]`, and `:460-483` uses `compareDocumentPosition` to
> assert the composer sits below the thread in the conversation arrangement and above
> "Needs your attention" while resting. **Any extra wrapper element the shell
> introduces around `DonnyThreadRegion` breaks the first**, and it will read as a
> layout regression rather than as a test that was measuring depth. Preserve the
> existing element depth exactly.

### 4.2 The creator overview page

`/dashboard/creator/overview` does not exist. Extract it the way #411 extracted
`BusinessOverview`:

- `src/pages/CreatorOverview.tsx` — today's `CreatorDashboard` body, verbatim
  **except for the two tour anchors §4.6 re-points**, including `DashboardGreeting`,
  `HeroPrimaryAction` ("Find paid work"), `StatsRow`, the DragonShare tiles,
  `NeedsAttentionSection`, `RecentActivitySection`, the calendar disclosure and
  `UpcomingPostsWidget`. `browse-campaigns` travels unchanged; `profile-completion`
  and `dragonshare-nav` are renamed here to match §4.6, or they are left targeting
  nothing.
- `src/pages/CreatorDashboard.tsx` — reduced to the same three-way switch
  `BusinessDashboard` is: first-run missions first, then
  `DONNY_FIRST_DASHBOARD_ENABLED`, then `CreatorDonnyHome`.
- `src/App.tsx` — a lazy route at `/dashboard/creator/overview` under
  `ProtectedRoute`. Creators have no role guard equivalent to `BusinessRoute`;
  `ProtectedRoute` is what every other `/dashboard/creator/*` route uses.

**The route must be registered in three places or a test fails** — `src/App.tsx` (the
real table), `src/lib/donnyRoutes.ts` (the client guard) and the orchestrator's
`ROUTE_TEMPLATES` (the server allow-list). See D4 for why both mirrors must move
together and why no redeploy follows.

**Every other CTA this design emits is already allow-listed.**
`/dashboard/creator/campaigns`, `/dashboard/creator/campaigns/:id`,
`/dashboard/creator/my-campaigns`, `/dashboard/creator/my-campaigns/:id` and
`/dashboard/creator/earnings` are all present in the client mirror
(`donnyRoutes.ts:84-97`), so only the new overview route is added. Item B's
`?tab=applied` is safe: `isKnownDonnyRoute` strips the query string and fragment
before matching (`donnyRoutes.ts:158`), and `MyCampaignsPage` genuinely honours the
parameter — so `routeCta` will not silently downgrade it to a dead label.

**`DONNY_FIRST_DASHBOARD_ENABLED` is shared and already `true`.** There is no
per-role switch, so merging this **is** the creator launch, exactly as it was for
business. The flag's own comment in `featureConfig.ts` is business-specific and
should be widened to say it now gates two roles.

### 4.3 Creator data hooks

`usePendingActions` is business-scoped and cannot be parameterized into service. The
creator container needs its own reads, all under the creator's own RLS:

| Hook | Reads | Feeds |
|---|---|---|
| `useCreatorAttentionInvitations` | `campaign_invitations` where `creator_id = auth.uid()` and `status='pending'`, embedding `campaigns!inner(id, title, status)` filtered to `status='published'`, minus the campaigns the creator already has an application on | Item D |
| `useCreatorContentTodo` | `campaign_collaborations` where `creator_id = auth.uid()`, `status='active'` **and** `content_status='pending'`, returning `campaign_id` alongside the collaboration id | Item A |
| `useCreatorPendingApplications` | `campaign_applications` where `creator_id = auth.uid()` and `status='pending'` | Item B |
| `useCreatorPayoutState` | `creator_profiles` (`stripe_account_id`, `stripe_onboarding_complete`, `pending_balance`) for the caller, via `.maybeSingle()`, plus the caller's collaboration count for the §4.4 conditioning rule | Item C |

**Each item's `occurredAt` must be named, not left to the implementer.**
`DonnyHomeProposals.tsx:47-49` renders it inline through `formatRelativeTime`, the
ordering rule is "newest first", and item D's copy explicitly wants "invited 8 days
ago". So: **B** → `campaign_applications.created_at`; **D** →
`campaign_invitations.created_at`; **A** → `campaign_collaborations.created_at`, not
`status_changed_at` — the item says content has not been *started*, and the honest
clock for that is how long the collaboration has existed, not when its status last
moved. **C and E carry `occurredAt: null`**, like every business signal.

Three further details that would otherwise be invented twice:

- **The embedded campaign filter needs `!inner`.** A plain embed returns the
  invitation row with a `null` campaign when the filter excludes it, so without
  `!inner` a closed campaign's invitation still arrives and has to be re-filtered
  client-side.
- **"Already applied" needs a second read.** PostgREST cannot express a
  not-exists against a sibling table in one request; fetch the creator's own
  `campaign_applications.campaign_id` list and exclude client-side. It is the
  creator's own rows, so RLS returns them all.
- **`useCreatorContentTodo` must pin `status='active'`**, mirroring
  `usePendingActions.ts:64-65`. Without it a cancelled collaboration still sitting at
  `content_status='pending'` renders as "content not started".

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

| | Item | Fires when | CTA | `kind` | Dismissible | Live today |
|---|---|---|---|---|---|---|
| A | Content not started | collaboration `status='active'` and `content_status='pending'` | route → `/dashboard/creator/my-campaigns/:campaignId` | `pending_action` | yes | 4 creators |
| B | Waiting on a reply | application `status='pending'` | route → `/dashboard/creator/my-campaigns?tab=applied` | `pending_action` | yes | 2 creators |
| C | Payouts | see the state table below | route → `/dashboard/creator/earnings` | `signal` | **no** | 14 creators |
| D | Invitations | pending invite, campaign still `published`, no application yet | route → `/dashboard/creator/campaigns/:campaignId` | `pending_action` | yes | 9 creators |
| E | Find work | nothing in flight (no A, B, D and no collaboration) | route → `/dashboard/creator/campaigns` | `signal` | **no** | see below |

> **Item A's route takes a campaign id, not a collaboration id.**
> `MyCampaignDetailPage` resolves `:id` through `useCampaignById`. The proposal's own
> id keys on the collaboration (two collaborations can share a campaign), so the hook
> must return both — the collaboration id for the dismissal key, the campaign id for
> the route.

**Ordering — explicit, because the cap makes it decisive.** Five item types share a
`PROPOSAL_CAP` of 3, and `buildDonnyProposals` deliberately does **not** rank by
`priority` across kinds (`buildDonnyProposals.ts:41-43`) — it concatenates fixed
groups. So `buildCreatorProposals` states its order rather than inheriting one:

```
hasMoneyOrWork = pending_balance > 0 || collaborations.length > 0

hasMoneyOrWork   →  C, A, B, D            (E cannot fire — work is in flight)
otherwise        →  A, B, D, E, C
```

Within a type, newest first, on the `occurredAt` named per item in §4.3. C is the
only item that moves, and it moves for the reason in the conditioning rule below.
**E is mutually exclusive with A, B, D and any collaboration** — it is the "you have
nothing on" state — so the second row resolves in practice to `B, D, C`, `D, C`,
`B, C`, `E, C` or bare `C`, **or any of those with C absent**, since C does not fire
for the 3 creators who are already set up nor in its silent fourth state. The cap is
never the binding constraint on E.

**Item E takes no new query and names no number.** It is derived entirely from the
absence of the other items, so it adds no fifth read. This is deliberate: the only
hook that counts visible campaigns, `usePublicCampaigns`, runs a per-campaign fan-out
that would undo §4.1's whole cost argument for two containers. The copy is therefore
*"Nothing on your plate — find your next campaign"*, with no count.

> **A known weakness, recorded rather than hidden.** §2 measured that **0 of the 24
> open campaigns have a future deadline** — the latest is 2026-08-02 — and that only
> 8 survive the taken-campaign exclusion. So E currently points at a board of 8
> campaigns whose deadlines all read as past. It is not a dead end (a `published`
> campaign is public and applying still works, which is why the marketplace shows
> them at all), but it is thin, and it is the honest reason E ranks *below* the items
> that point at something specific. If the board is still all-lapsed at
> `verify-prod`, that is a supply problem for the founder, not a reason to hold this
> phase — and it is the strongest argument for the `find_campaigns` follow-up in §8.

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

**Copy for item D — the hard constraint.** **One row per invitation**, not one
aggregated row: *"{Business} asked you to apply to \"{campaign title}\""*. Per-row is
what the id (`creator:invitation:${campaignId}`) and the per-campaign CTA already
commit to, and it matches the business precedent — `pendingProposal` emits one row
per action and never an aggregate. It also gives the right dismissal grain: a creator
with several invitations dismisses them one at a time rather than losing all of them
in one tap. `occurredAt` supplies the optional staleness rider ("invited 8 days ago")
— honest about age without hiding the opportunity.

Never "you've been selected", never an Accept affordance, never implied priority. The
campaign is already public; the invitation is a nudge with zero standing (#382).

> Several D rows crowding C below the cap is the intended outcome, not a regression.
> When money or work is in flight C is already first; when neither is, C is the
> deprioritised "set up payouts" homework item that §4.4's conditioning rule
> deliberately ranks last.

`PROPOSAL_CAP` stays at 3, as on the business side.

**`blocker` is always `null` for creators.** The business builder reserves it for the
location-readiness blocker — a state that genuinely prevents creating campaigns,
promotions and DragonShare. Nothing in the creator flow is blocked that way: an
unpaid creator can still browse, apply and deliver. Item C is a ranked proposal, not
a blocker, and returning `null` keeps `DonnyHomeProposals` rendering unchanged.

**`ProposalIcon` will give every creator item the default clock icon** — its
special-cases key on business-specific proposal ids
(`DonnyHomeProposals.tsx:20-27`). Accepted for this phase; per-item icons are
cosmetic and would mean editing a shared presentational component for no behavioural
gain.

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

`DCTour` degrades rather than crashes — `document.querySelector` misses,
`targetRect` stays `null`, and the popover renders centred with no spotlight
(`DCTour.tsx:26-35`). So this ships as three quiet dead steps unless addressed.

**The invariant, which is what the business role actually satisfies.** `useTour`
resolves steps by **role alone** — `getTourForRole(profile?.role)`, with no page
awareness — and **both** creator pages render a `TourButton`. So there is only ever
one creator tour, and it must resolve on `/dashboard/creator` **and**
`/dashboard/creator/overview`.

That is not luck on the business side, it is a deliberate duplication:
`data-tour="brief-generator"` exists on **both** `DonnyHomePrompt.tsx:98` and
`BusinessOverview.tsx:122` (wrapping `HeroPrimaryAction`). One selector, the same
step, resolving on either page — the primary action of whichever page you are on.
`org-switcher`, `bottom-nav-add` and `donny-help` are chrome and resolve everywhere.

**So the rule is: every `CREATOR_TOUR` selector must exist on both creator pages.**
Two of the three orphaned anchors have a genuine equivalent on the Donny page and one
does not:

| Step | Today's anchor | Resolution | Where the Donny-page anchor lives |
|---|---|---|---|
| "Browse campaigns" | `browse-campaigns` on `HeroPrimaryAction` | **Duplicate**, mirroring `BusinessOverview:122` — the primary action of whichever page you are on | `tourAnchors.prompt` on the shell's `DonnyHomePrompt` wrapper |
| "Complete your profile" | `profile-completion` on `StatsRow` | **Re-point + rewrite.** Both pages have an attention region (`DonnyHomeProposals` renders `NeedsAttentionSection`; `CreatorOverview` renders it directly). New copy, since a stats grid no longer leads the page | a `creator-attention` wrapper the container puts around the `children` proposals block |
| "DragonShare" | `dragonshare-nav` on `DragonShareStatTile` | **Re-point** to a shared anchor: the overview link on the Donny page, the existing tile on the overview | `tourAnchors.overview` on the shell's overview link |
| "Ask Donny" | `donny-help` | Unchanged — chrome (`DonnyNavButton.tsx:18`) | n/a |

**Two of these three anchors sit on elements the *shell* owns, not the container** —
`DonnyHomePrompt` and the overview link are both in `DonnyHomeShell` per §4.1, and
the container never holds either. That is why `DonnyHomeShellProps` carries
`tourAnchors`: the container declares the selector, the shell applies it. Business
passes nothing and is byte-unchanged; `DonnyHomePrompt` itself is not touched, which
§4.1 requires since it is shared. Only `creator-attention` is genuinely container-side,
because the proposals block is passed as `children`.

**Both anchors land on elements that already exist — add no wrapper.**
`tourAnchors.prompt` goes on the existing `composerRef` div that wraps
`DonnyHomePrompt` (`DonnyHome.tsx:491`), and `tourAnchors.overview` on the existing
overview `<Link>` (`:519`). Introducing a new wrapper node instead would risk the
element-depth pins §4.1 warns about, for no gain.

Exact copy is a plan-level detail; the constraint is not. **A unit test enforces it:**
every **body** selector in `CREATOR_TOUR` must be present in the rendered tree of both
`CreatorDonnyHome` and `CreatorOverview`.

> **Chrome selectors are explicitly out of that test's scope.** `donny-help` lives in
> `DonnyNavButton` inside `MobileBottomNav`/`DashboardLayout`, and any unit test of
> these containers must mock `DashboardLayout` the way `DonnyHome.test.tsx:104-106`
> already does — so asserting it would fail against a mock, not against a real
> regression. The same reasoning covers `org-switcher` and `bottom-nav-add` on the
> business side. The test covers the three page-owned anchors; the chrome ones are
> guaranteed by the layout.
>
> One safeguard worth recording rather than assuming: `NeedsAttentionSection` hides
> itself with CSS `:has()`, so the `creator-attention` anchor is always in the DOM but
> could have a zero-size rect and an invisible spotlight. (Note also that
> `DonnyHomeProposals` renders a skeleton, not the section, while loading.)
>
> **CORRECTED after the whole-branch review, 2026-08-10.** This paragraph used to end
> "in practice item E guarantees every creator has at least one row, so it is never
> empty." **That was false, and it was the load-bearing reason this hazard was
> dismissed.** Two ways the region can be empty:
>
> 1. As originally specified, §4.4's rule said item E requires "no collaboration" —
>    a *lifetime* count. On prod 11 of 16 collaborations are already `completed`, so
>    a creator who simply finished their work counted as having something in flight,
>    E never fired, and an onboarded creator in that state got **zero** rows. Fixed
>    in the same review: the builder now splits the two questions
>    (`collaborationCount` for "has ever worked", `activeCollaborationCount` for
>    "is anything in flight"), with tests pinning both.
> 2. Even after that fix, a creator with an `active` collaboration whose content sits
>    at `submitted` — nothing to do, waiting on the business — with no pending
>    application, no invitation, and payout complete renders zero rows. That state is
>    honest ("nothing needs you"), so it is left alone; but it means the anchor CAN be
>    zero-height and the claim above must not be relied on again.
>    `creatorTourAnchors.test.tsx` asserts that the anchor contains at least one
>    rendered `[data-testid="donny-proposal"]` row.
>
> That assertion took two attempts, which is itself the lesson. The first version
> counted the anchor's `childElementCount > 0` — **unfalsifiable**, because
> `DonnyHomeProposals`' `if (!blocker && proposals.length === 0 && !children) return null`
> is dead code for this container (`RatingPromptManager` is always passed as `children`,
> and a React element is always truthy). So the `<section>` renders in every state and
> counts as one child even when it is CSS-hidden with nothing inside it — the test
> would have passed in exactly the situation it was written to catch. **Count the thing
> the user sees, not the container that holds it.**
>
> The general lesson, since this spec made the mistake twice in one paragraph: **a
> safeguard that rests on "in practice X never happens" is not a safeguard.** Assert
> it or handle it.

Without this test the tour silently rots the next time either page is restructured,
which is precisely how the current breakage arrived.

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
- Item E fires only when A, B, D are all empty **and** there is no collaboration.
- The two orderings hold: `C,A,B,D` when money or work exists, `A,B,D,E,C` otherwise.
- An errored input contributes no proposal, and never a zero.
- Ids are stable across rebuilds, since they are the dismissal keys.
- `blocker` is always `null`.
- `PROPOSAL_CAP` and `allProposalIds` behave as on the business side — the full
  pre-cap id list is returned so a dismissal below the cap is not resurrected.

**Tour parity.** A test asserting every **page-owned** `CREATOR_TOUR` selector
resolves in both `CreatorDonnyHome` and `CreatorOverview` — the three body anchors,
not the chrome step, which resolves from a `DashboardLayout` these tests mock (§4.6).
This is the check that would have caught the current breakage.

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

`data-exposure-reviewer` does **not** apply: no service-role read, no RLS policy, no
new bucket, no migration. `edge-function-reviewer` does **not** apply either — its
subject is deploy hazards (`verify_jwt` drift, `_shared` bundling, CORS, deploy
ordering) and nothing here is deployed. The one edge-function source file touched,
`routes.ts`, gains a single string in a pure allow-list array with no runtime imports
(D4).

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
