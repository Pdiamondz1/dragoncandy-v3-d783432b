---
title: Donny Data Visibility & Quick-Action Routing
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-donny-data-visibility-quick-actions.md]
tags: [donny, edge-functions, schema-drift, routing, security, dragonshare, campaigns]
---

# Donny Data Visibility & Quick-Action Routing

How the consumer Donny chat panel **sees a user's own data** (campaigns, applications,
collaborations, DragonShare) and **navigates** via quick-action pills — and the two bug classes
that broke both. Sibling of [[AI Creator Matching]] (which covers creator *discovery*/matching and
first documented that the consumer Donny runs on `donny-orchestrator`, not `donny-chat`). See also
[[Donny AI]].

## Two backends (recap)

- **`donny-orchestrator`** — the consumer in-app chat panel (`src/hooks/useDonny.ts`). A router over
  deterministic sub-agents (`agents/campaign.ts`, `agents/dragonshare.ts`, `agents/creators.ts`, …)
  that query the DB under the **service role** (RLS bypassed).
- **`donny-chat`** — Donny OAuth / browser extension / internal AIOS surface; its own tool set +
  `executeTool`.

Both surface the same user data and shared the same two bug classes below, so both were fixed
together.

## Bug class 1 — schema drift + silent swallow ("Donny can't see my campaigns/DragonShare")

Donny's data agents read `res.data ?? []`. If a `.select(...)` names a **column/table/enum value
that no longer exists**, PostgREST returns a 400 and `.data` is `null` → the code treats it as a
genuinely **empty** result. The user gets *"no campaigns tied to your account — data sync issue"* or
an always-empty DragonShare, even with real data.

Concrete instances found (2026-07-16, all verified against prod `information_schema`, **not** the
migration files):

- **`campaigns.platform` does not exist** — the column is `platforms text[]`. The campaign agent (and
  `donny-chat` `get_campaigns` + `create_campaign`) selected/inserted `platform` → every campaigns
  query 400'd → `[]`. **This was the actual root cause of "no campaigns"** (Uncle Rocco had 12).
- **`campaigns` has no `content_type`** (it lives on `campaign_deliverables`/`donny_scheduled_posts`).
- **`campaign_brief_generations`** real columns are `id, org_id, user_id, source_url, brief_jsonb,
  ip_address, generated_at` — not `campaign_id`/`status`/`created_at`.
- **The whole DragonShare agent** queried dead columns: `dragonshare_posts` owner is `creator_id` (no
  `user_id`), target is `target_org_id`, and it has `source_brief_id` (no `campaign_id`);
  `dragonshare_boosts` uses `boosting_org_id`/`amount_cents` (no `org_id`/`budget_used`);
  `dragonshare_payouts` uses `amount_cents`/`processed_at` (no `amount`/`payout_date`).
- **Wrong enum values** (queries succeed but filters silently match nothing): `boost_status` ∈
  `available|boosted|expired|withdrawn` (not "pending"); `dragonshare_payouts.status` ∈
  `pending|succeeded|failed|reversed` (not "paid"/"completed"); `dragonshare_boosts.status` ∈
  `pending|captured|transferred|refunded|failed` (not "active").

**Fixes:** correct every column/enum to the real schema; make the queries **role-aware** (owners see
campaigns by `user_id` + applications by `org_id`/`in(campaign_id)` + collaborations by
`in(campaign_id)`; creators see their applications/collaborations by `creator_id`); and **surface
errors instead of swallowing** — the summary carries a `data_partial` flag so Donny can say
"couldn't load right now, try again" rather than falsely claiming an empty account.

## Bug class 2 — LLM-invented navigation routes → 404

Quick-action pill `route`s were **free text the LLM writes**, regex-scraped in
`donny-orchestrator/index.ts` `parseSuggestedActions`, and passed straight to `navigate()` in
`DonnyMessage.tsx` — **unvalidated**. When the model invents a plausible-but-nonexistent path (e.g.
an "Invite Creators" page — inviting is a **modal**, not a route), React Router's `*` catch-all
renders `NotFound`. Agents also hardcoded `/dashboard/brand/campaigns` (a list route that exists for
**no** role) and wrong-role detail paths.

**Fix (three layers):**
1. **`donny-orchestrator/routes.ts`** (pure, unit-tested) — `isKnownRoute(route)` allow-list that
   mirrors `src/App.tsx`, plus role-aware builders (`campaignsListRoute`, `campaignDetailRoute`,
   `browseCreatorsRoute`, `createCampaignRoute`, `dragonshareRoute`) so agents emit real paths.
2. **Server-side filter** — `index.ts` drops any suggested action whose route fails `isKnownRoute`,
   and the system prompt tells the model to only use tool-provided routes, never invent one.
3. **Client-side guard** — `src/lib/donnyRoutes.ts` (mirror allow-list) re-validates in
   `DonnyMessage.tsx` before `navigate()`, so **messages persisted before the fix** with bad routes
   are ignored rather than 404'd.

The allow-list is a hand-maintained mirror of the route table in three places
(`src/App.tsx` ⇢ `donny-orchestrator/routes.ts` ⇢ `src/lib/donnyRoutes.ts`) — keep them in sync when
routes change. `find_creators`'s routes (`/dashboard/{business,brand}/creators`, `/creator/:slug`)
are in the list, so the server filter never drops them.

### The guard's blind spot — corrected 2026-08-09 (PR #409)

**The three layers above were written as if they close this bug class. They do not, and reading
them that way is what let twelve dead links ship past a working guard.**

`isKnownRoute` / `isKnownDonnyRoute` validate routes **the LLM invents**. They never see a route
**hardcoded in source, in agent prompt text, or in a nudge action payload** — those never pass
through `parseSuggestedActions`, so nothing validates them.

`/settings/billing` and `/settings/social` were hardcoded in **12 places across 10 files**. There is
**no top-level `/settings/*` route in `src/App.tsx`**, so all twelve hit the catch-all `NotFound` —
including the **"Upgrade" CTA gating the paid Weekly Content Plan** (the revenue path) and the
primary **"Connect Outstand"** button on a high-priority `donny_nudges` row. `/settings/billing/upgrade`
was dead twice over: no `/upgrade` sub-route either.

**Three role vocabularies coexist and are not interchangeable** — this is where the fix nearly went
wrong twice:

| Vocabulary | Values | Used by |
|---|---|---|
| `profiles.role` | `business_client` \| `content_creator` \| `brand` | what `billingRoute()`/`socialRoute()` expect |
| `fire-campaign-social-hook` `parties[]` | `restaurant` \| `brand` \| `creator` | **persisted as `party_role`**, so it cannot be renamed to match |
| others | their own | — |

Folding `brand` into the business branch sends a brand user to `/dashboard/business/social`, which
sits behind `BusinessRoute` and **redirects them away — a silent failure, not a 404.** The first fix
attempt copied an adjacent existing ternary believing that was conservative; **that ternary was
itself broken for `brand`**, and Codex plus `edge-function-reviewer` caught it independently. *A
neighbouring line is not a specification.*

**Fix:** role-aware `billingRoute()` / `socialRoute()` in both mirrors, plus a local
`partySocialRoute()` where the vocabulary genuinely differs. `routes.test.ts` asserts every
role-route helper's output passes `isKnownRoute`, and pins the three dead paths as rejected.
**Creators have no billing route** — `/dashboard/{business,brand}/billing` exist; creators land on
`/dashboard/creator/earnings`. Whether a creator should see an "Upgrade" CTA at all is an open
product question, not just a routing one.

**A new test asserts the mirrors agree** (`src/lib/donnyRoutes.parity.test.ts`) — nothing did before.
It is **directional, not an identity check**: every *server* route must exist in the client mirror
(the server emits; the client validates, and `DonnyMessage` drops what it rejects), while the client
may hold only the two documented legacy Crews redirects the server must never emit.

**This was found and correctly diagnosed on 2026-06-07.**
`docs/superpowers/specs/2026-06-07-ios-purchase-cta-gating-design.md:51,167` names the exact fix; the
paired plan says *"Do NOT fix the legacy `/settings/billing` route — out of scope."* It stayed broken
for two months across the whole pre-launch push. **A dead link on a money path is not "unrelated."**

## Service-role tenant scoping (security)

A service-role tool must **never scope reads by a client-supplied id**. The orchestrator originally
took `org_id` from the request body; it now resolves the tenant **server-side only** from
`profile.org_id` (no server org ⇒ no org). Otherwise a caller could pass another tenant's `org_id`
and read that org's applications / DragonShare / campaign details (Codex P1). Same discipline as the
`profile_visibility='public'` re-assertion in [[AI Creator Matching]].

## Key Decisions

- Fix **both** Donny backends (the screenshots are `donny-orchestrator`, but "all users" includes the
  OAuth/extension/internal surface on `donny-chat`).
- The "Invite Creators" quick action routes to **Browse Creators** (`/dashboard/business/creators`),
  where the invite modal lives — there is no invite *page*.
- Campaign visibility mirrors the user's **own** account (owner by `user_id`, org-scoped by the
  **server-derived** `org_id`), not org-wide teammate campaigns.

## Known Issues

- Campaigns owned by a *teammate* under a shared org can still be invisible to a member (the fix
  scopes to the signed-in user's own `user_id` + server org); org-wide visibility is a possible later
  enhancement.
- ~~The route allow-list is mirrored in three files; a new app route must be added to
  `routes.ts` + `src/lib/donnyRoutes.ts` or Donny won't link to it.~~
  **Corrected 2026-08-09.** True, but it framed the risk as *under*-linking — a missing route means
  Donny stays quiet, which is the safe failure. The expensive failure is the opposite and it
  shipped: a route that never reaches the guard at all. Since PR #409 the parity test catches
  mirror drift; **nothing catches a hardcoded path**, so that remains the live risk. See "The
  guard's blind spot" above.
- **The RAG seed still teaches the dead paths.** `supabase/seed/donny-knowledge-seed.ts` hardcodes
  `/settings/billing` and `/settings/social` in `page_paths` in **8 places**. PR #409 fixed the live
  CTAs; the seeded knowledge was not re-seeded, so Donny's retrieval layer still carries them.
  Needs a gated `donny_knowledge` write.

## Bug class 3 — inventing a cause for his own failure

Recorded here because it has now happened **three times**, and each time the invented cause
sent the user somewhere real to do something impossible.

The third instance (2026-08-09) is the cleanest specimen: asked to post to Instagram, Donny
said he had *"no visibility into which Instagram account is connected"*, told the owner to
find an **"account ID"** on a settings page that displays no ID anywhere, and promised to post
once he had it — while the underlying tool had never once succeeded, for reasons entirely
unrelated to any id. See [[Donny Social Tools]].

The fix pattern is the same in all three: **the tool result must carry the reason, derived
from what actually happened**, and the model must be told to relay it rather than explain it.
Where the code cannot know why, it says so plainly instead of guessing. A prompt instruction
alone is not enough — a tool that returns a bare failure invites a plausible story.

## See Also

- [[Donny Social Tools]] — the third instance, and the `social_*` repair that followed.
- [[AI Creator Matching]] — creator discovery/matching sibling; the two-backend wiring; service-role
  `profile_visibility` re-assertion.
- [[Donny AI]] — the intelligence layer overview.
- [[Donny Web Access]] — the `find_creators` / web-tool work this branch merged with.
- [[Donny-First Dashboard]] — validates every proposal CTA through `isKnownDonnyRoute` before
  render, as a direct consequence of the blind spot above.
