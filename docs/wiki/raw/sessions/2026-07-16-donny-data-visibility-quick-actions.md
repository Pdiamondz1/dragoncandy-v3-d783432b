# Session — Donny data visibility + quick-action 404 (branch worktree-dc-issues-6, PR #260)

**Date:** 2026-07-16
**Trigger:** Founder bug report (Uncle Rocco). Two failures in the Donny chat panel: (1) pressing
the "Invite Creators" quick-action pill went to a **404 "Page not found"** screen (repeatedly);
(2) Donny did not recognize campaigns tied to the account — *"the system isn't finding any
campaigns tied to your account right now. This could be a data sync issue."* Ask: fix for **all
users**, businesses **and** creators, covering campaigns, DragonShare, etc.

## Which Donny? (the wiring, confirmed again)

The consumer in-app chat panel calls **`donny-orchestrator`** (`src/hooks/useDonny.ts:156`), whose
deterministic sub-agents (`agents/campaign.ts`, `agents/dragonshare.ts`, …) query the DB under the
service role. `donny-chat` is the separate backend for Donny OAuth / the browser extension / the
internal AIOS surface. Both had the same class of bug, so both were fixed. (See [[AI Creator
Matching]] for the earlier statement of this two-backend fact.)

## Root causes (all prod-verified via SQL, not migration files)

1. **Quick-action pills 404.** Their `route` strings are **free text emitted by the LLM**, regex-
   scraped in `donny-orchestrator/index.ts` `parseSuggestedActions`, and passed straight to
   `navigate()` in `DonnyMessage.tsx` with **zero validation**. The model invents a plausible path
   (e.g. an "Invite Creators" page — inviting is a **modal**, there is no route) → the `*` catch-all
   → `NotFound`. `agents/campaign.ts` also hardcoded `/dashboard/brand/campaigns` (a list route that
   exists for **no** role) and the wrong-role `/dashboard/brand/campaigns/:id` for restaurants.

2. **"No campaigns" — the actual root cause was a nonexistent column, swallowed.** The campaign
   agent selected **`campaigns.platform`**, which **does not exist** (the column is `platforms
   text[]`). PostgREST 400'd the whole SELECT; the code did `campaignsRes.data ?? []`, so **every**
   campaigns query returned `[]` → "no campaigns tied to your account". (Uncle Rocco actually has 12
   campaigns / 10 applications / 7 collaborations / 3 DragonShare posts — all reported as none.)
   IMG_0733 showing Donny recognize "1 application, accepted" is consistent: the `campaignApps`
   sub-query selected only valid columns, so applications surfaced while the campaign row came back
   null. **Initial diagnosis (org-ownership / fragile `.or`) missed this — the `platform` column was
   caught by the edge-function-reviewer.**

3. **The whole DragonShare agent queried a dead schema.** `dragonshare_posts` has no `user_id`
   (owner is `creator_id`; target is `target_org_id`) and no `campaign_id` (it's `source_brief_id`);
   `dragonshare_boosts` has no `org_id`/`budget_used`/`reach_estimate` (real: `boosting_org_id`,
   `amount_cents`); `dragonshare_payouts` uses `amount_cents`/`processed_at` not `amount`/`payout_date`.
   Every query 400'd → swallowed to `[]` → **DragonShare always empty for everyone.** Enum values were
   also wrong: `boost_status` "pending" (real: `available`), payouts "paid/completed" (real:
   `succeeded`), boosts "active/captured" (real: `transferred`).

4. **`donny-chat` parity:** the system-prompt campaign count filtered `status='published'` only, so
   an `active`/`draft` campaign read as **0** (priming the false "data sync issue" reply); the
   `get_campaigns` tool was `user_id`-only (empty for creators, who don't own campaigns); no
   DragonShare tool at all. Plus the same `campaigns.platform` bug in `get_campaigns` and the
   `create_campaign` INSERT.

## The fix

- **New pure `donny-orchestrator/routes.ts`** (+ `routes.test.ts`, vitest): `isKnownRoute` allow-list
  (mirrors `src/App.tsx`) + role-aware builders (`campaignsListRoute`, `campaignDetailRoute`,
  `browseCreatorsRoute`, `createCampaignRoute`, `dragonshareRoute`). `index.ts` **drops any
  suggested action whose route isn't `isKnownRoute`** after `parseSuggestedActions`, and the system
  prompt forbids inventing URLs. Frontend mirror `src/lib/donnyRoutes.ts` (+ test) re-guards
  **already-persisted** bad routes in `DonnyMessage.tsx` (so old messages don't 404 either). Invite
  intent → Browse Creators.
- **`agents/campaign.ts`** — role-aware rewrite: owners see campaigns (`user_id`) + applications
  (`org_id`, fallback `in(campaign_id)`) + collaborations (`in(campaign_id)`); creators see their
  applications/collaborations (`creator_id`); `platforms` not `platform`; real
  `campaign_brief_generations` columns; errors surfaced via a `data_partial` flag (never a silent
  `[]`); and **an ownership/authorization gate in `campaignDetail`** (service-role bypasses RLS →
  assert `user_id`/`org_id` owner-match, else a creator application/collaboration row) closing a
  cross-tenant IDOR; applicant ids only returned to owners.
- **`agents/dragonshare.ts`** — schema-correct + role-aware rewrite (real columns + real enum values).
- **`index.ts`** — `org_id` is resolved **server-side only** (`profile.org_id`), never from the
  client body, so org-scoped service-role reads can't be pointed at another tenant (Codex P1).
- **`donny-chat/index.ts`** — role-aware `get_campaigns` (creators → applications/collaborations via
  `campaigns!inner(...)`), new `get_dragonshare` tool (all 3 roles), `platforms` fix in
  `get_campaigns` + `create_campaign` (drops nonexistent `content_type`), system-prompt count no
  longer filters `published`.

## Review, deploy, gotchas

- **edge-function-reviewer**: both functions PASS. First orchestrator pass found the `platform`
  column, the IDOR, the brief-gen columns, and 3 wrong enums — all fixed + re-verified. donny-chat
  PASS twice.
- **Codex**: 1 P1 (client `org_id` fallback still trusted → cross-tenant) → fixed (server-side only)
  → re-verified clean. (Codex flaky in this env — sandbox rejections + a DLL crash + timeouts; the
  targeted commit review completed.)
- **Deploy pre-flight caught a collision:** `origin/main` had #248 (Donny web access / Tavily) + #251
  (`find_creators`) touching these exact functions; deploying the stale branch would have **reverted**
  them. Merged `origin/main` (one trivial import conflict in orchestrator `index.ts`; verified
  `find_creators`'s routes — `/dashboard/{business,brand}/creators`, `/creator/:slug` — all pass the
  new allow-list, and the web-tool wiring survived).
- Deployed via the **careful** gate + Supabase CLI: `donny-orchestrator` **v63** (verify_jwt=true),
  `donny-chat` **v145** (verify_jwt=false); boot-checked (OPTIONS → 200). Frontend ships via PR #260 →
  Vercel.

## Durable lessons

- A Donny "no data / data sync issue" answer over a non-empty account is almost always a **swallowed
  query error from schema drift** (a selected column/table/enum that no longer exists), not logic.
  Donny's data agents `?? []` every result, so a 400 reads as "empty". **Verify every selected column
  vs prod** (`information_schema` / distinct enum values), not the migration file, and **surface the
  error** (a `data_partial` flag) so the model can say "couldn't load" instead of "you have none".
- **LLM-emitted navigation routes must be validated against a real-route allow-list** — never pass a
  model-invented `route` to `navigate()`. Belt-and-suspenders: drop unknown routes server-side AND
  guard client-side (old persisted messages carry bad routes).
- **A service-role tool must never scope reads by a client-supplied id** (org_id here). Resolve the
  tenant server-side from the profile; no server org ⇒ no org.
