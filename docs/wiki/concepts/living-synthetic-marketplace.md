---
title: Living Synthetic Marketplace
type: concept
created: 2026-07-25
updated: 2026-08-02
sources: [2026-07-25-living-marketplace-phase-a1]
tags: [synthetic, marketplace, seeding, rls, prod, teardown, sim]
---
# Living Synthetic Marketplace

**Sub-project A** of the living-marketplace / 200K-DAU initiative: a **persistent, browsable synthetic
marketplace on prod**, built through **real, RLS-enforced app flows** (bot JWTs) so the app *feels
populated* from both the business and creator sides — real profiles, free campaigns,
applications→collaborations, uploaded content, DragonFeed posts, messaging, discounts, reviews,
multi-location orgs, and CGC. Visible to everyone, yet **excluded from founder metrics** via the
existing `is_synthetic` segregation. Branch `feat/living-marketplace`. Siblings: the runner-matrix
load Slice and the live daily `bot0##` crew cohort (see [[Synthetic Weight Engine]]).

Phase A1 (this build) is the **populate**: the offline harness code + the scoped teardown. Phase A2
(live daily tick + growth guard), Sub-project B (Stripe test transactions), and Sub-project C (200K
load) are separate.

## Architecture

A new `sim/marketplace/` module + a `marketplace-seed` harness subcommand, reusing the existing harness
spine verbatim (`serviceClient`/`bootGate`/`mintBot`/`SessionPool`/`makeBotFor`) and the verified
free-campaign lifecycle in `sim/behavior/actions.ts` (`executeAction`). It **adds** only the writes the
crew engine lacks (messaging, DragonFeed, discounts, multi-location units, CGC) + full profiles. All
writes go through **real bot JWTs (real RLS)**; the only service-role use is cohort reads, org campaign-
limit provisioning, and teardown.

- **Cohort namespace `botmk_b_<seed>_<i>` / `botmk_c_<seed>_<i>@synthetic.dragoncandy.test`** — distinct
  from `bot0##` (live crew), `botla…` (load), `botseed_…` (depth). **Critical integration fix:**
  `sim/mint.ts readSessionCapableBots` now excludes `botmk_`, or the daily crew tick + single-runner
  load would sweep the persistent cohort in.
- **Sequencer** (`sim/marketplace/seed.ts`, pure/injected `SeedSteps`): mint-missing → readCohortRefs →
  completeProfiles → setupBusinesses → publishCampaigns → runCollaborations → seedMessaging →
  seedDragonFeed → [multiLocation] → [cgc]. `buildDefaultSeedSteps` (`sim/run.ts`) is the live glue
  wiring it to real Supabase writes (not unit-tested by design — verified on the prod run).

## Key Decisions

- **Free money model.** Standard campaigns are FREE (`fixed_price=0`, `group_id=null` public) → complete
  via the reused dual-party NO-payout path. Paid/Stripe = Sub-project B.
- **Public free campaigns don't auto-activate on hire** — the verified `accept_application_with_collaboration`
  only auto-activates *crew* campaigns, so `runCollaborations` explicitly flips `campaigns.status`
  published→active→completed via own-row update (a realistic browse mix: some open, some in-progress,
  some completed).
- **Campaign-limit provisioning.** `enforce_active_campaign_limit` (org `active_campaign_limit` DEFAULT
  1; counts published+active public per `user_id`; org via `profiles.org_id`) would abort a 2nd publish
  → `setupBusinesses` raises the synthetic org's limit (service-role provisioning). This is why the
  load-mix `campaign_write` uses `status='draft'`.
- **Orgs auto-exist per business.** `trg_auto_create_org_fn` (on `business_profiles` insert) creates an
  org + primary unit + owner membership → multi-location is just inserting extra `org_units` (RLS
  `is_org_owner_or_admin`). Business geo lives on `org_units.lat/lng`; profile-table geo is text only.
- **Full profiles, no social.** `completeProfiles` fills business/creator profiles (industry,
  description, bios, `creator_skill[]` enum skills, rates, availability, languages, timezone,
  US locations, `is_completed`) but **excludes every social-account field** (`instagram_url`/…/`x_url`,
  `brand_social_guidelines`), `stripe_*`, and computed `average_rating`/`total_reviews`. `industry` ∈
  `industry_type` enum; `skills` ∈ `creator_skill[]` enum (display text breaks the update).
- **US-diverse locations.** 24-city `US_LOCATIONS` pool (`locations.ts`) assigned by cohort index; the
  same city feeds the profile AND the business's primary org_unit geo.
- **ONE-SHOT command.** `marketplace-seed` mirrors `bulk-seed`: `assertMarketplaceCohortCap` (≤150
  biz/≤450 creators, non-negative — prevents a fat-finger minting thousands) runs before any prod
  contact; `assertMarketplaceCohortFresh` fails fast if a `botmk_` cohort exists. Downstream phases are
  NOT idempotent, so a re-run is *blocked* rather than duplicating persistent data — **recovery is
  `marketplace-purge` then re-dispatch** (fast + verified), deliberately chosen over per-phase
  idempotency.
- **Seeding vehicle.** `.github/workflows/marketplace-seed.yml` (manual dispatch, `synthetic-weight`
  Environment, `SIM_*` secrets, fail-closed at boot). The `SIM_*` secrets are GitHub-Environment-only
  (not on any local machine), and GitHub `workflow_dispatch` needs the file on the default branch → the
  branch must merge before the first dispatch.

## Teardown

`purge_synthetic_marketplace_cohort()` (migration `20260725120000`, **applied + no-op-verified on prod
2026-07-25**, service-role-only, 0 new advisors) — the `botmk_`-scoped teardown. Grounded in the live
`pg_constraint` FK graph: deleting the botmk `auth.users` cascades the vast majority
(profiles→campaigns/applications/collaborations/reviews/messages/conversations/dragonshare/file_uploads;
business_profiles→promotions→discount_codes/promotion_submissions; creator_profiles; synthetic_users;
org_members). Explicit residue: `storage.objects` (botmk uids + botmk promotion ids), `organizations`
(captured before the delete → cascades org_units/org_members), and precaution
`push_notifications`/`crew_activity`. The `residual_*` report is the fail-loud backstop. **Teardown =
`marketplace-purge` ONLY — NEVER `purge_synthetic_data()`** (that also deletes the live `bot0##` 25 +
`botla…`). See [[Synthetic Weight Engine]].

## Known Issues

- **buildDefaultSeedSteps runtime-verify items** (live glue, confirmed on the first prod seed): the
  `--cgc` anon upload to `promotion-videos`, the own-row `campaigns.status` flips, org targeting, and
  the `profile-assets` avatar-bucket RLS (avatar upload is best-effort — never aborts the seed).
- **Reviews:** per-task + whole-branch (opus) + Codex (4 passes). Codex caught, in order: the campaign-
  limit abort, seed-shipped-without-teardown, the missing cohort cap, downstream-not-resumable, and the
  one-shot/documented-resumable contradiction — all resolved.

## State — PURGED from prod 2026-07-30; prod is real-only

**The cohort no longer exists.** It ran as described below, then was torn down completely and the
master kill switch `SYNTHETIC_BOTS_ENABLED` was set `false` (`feature_flags.updated_at =
2026-07-30 18:13:56Z` — the flag row is the surviving record of the teardown).

Verified against prod on 2026-08-02: `synthetic_users` = **0 rows**, **0** profiles on
`@synthetic.dragoncandy.test`, 42 `auth.users` / 42 `profiles` — all real. Nothing `botmk_` remains.

**The engine itself is retained, not deleted.** To restore, in this order:

1. **Set `SYNTHETIC_BOTS_ENABLED` back to `true`.** The purge left it `false`, and every run is
   fail-closed at boot (`sim/env.ts`): it refuses unless the Stripe keys are TEST keys **and** this
   flag reads back exactly `true`. Skipping this step fails the restore at the gate.
2. **Dispatch the `marketplace-seed` workflow** (manual-only by design; runs in the
   `synthetic-weight` GitHub Environment). This is the harness that builds the cohort through real
   RLS-enforced flows — profiles, free campaigns, applications→collaborations, content, DragonFeed
   posts, messaging, discounts, reviews. It is **one-shot**: it fails fast if a `botmk_` cohort
   already exists, a condition this purge has cleared. Start at the small 2/4 defaults.
3. **Only then** consider `seed_synthetic_marketplace_depth` — the **inert, browse-only depth pool**
   (its own migration header calls it "browsable-but-INERT"; those profiles never authenticate). It
   scales an existing marketplace and **cannot stand one up**.

Teardown remains the same workflow with `command=marketplace-purge` (the `botmk_`-scoped
`purge_synthetic_marketplace_cohort()`) — never the broad `purge_synthetic_data`.

> **Why this page said otherwise for three days:** the purge was a pure **database** operation — it
> produced no commit, so nothing in git recorded it and every doc kept asserting "LIVE at 2,000".
> Prod state that changes without a commit does not reach the knowledge layer on its own. When a
> teardown happens by RPC or dashboard, write the doc in the same session, and prefer a check against
> the DB (here, the `feature_flags` row) over trusting any doc's claim of what is live.

### What ran (historical — 2026-07-25/26)

PRs #339–#342 merged; the whole founder-gated sequence below was executed and the cohort reached
prod, **scaled well past the original 100/300 target**:

| Lane | Business | Creator | Total |
|-|-|-|-|
| **Active** (interactive, `botmk_b_`/`botmk_c_`) | 8 | 16 | 24 |
| **Depth** (browse-only bulk insert, `botmk_db_`/`botmk_dc_`) | 492 | 1,484 | 1,976 |
| | **500** | **1,500** | **2,000** |

**The active/depth split is the load-bearing design decision, not an optimisation.** Minting a session
costs an authentication, and prod rate-limits those per IP at roughly 25 — so a browsable marketplace of
2,000 profiles is unreachable by minting 2,000 sessions. Depth profiles are bulk-inserted and never
authenticate (they exist to be *browsed*); only the ~24-bot active core runs real interactive flows.
Scaling further is direct `seed_synthetic_marketplace_depth(<biz>, <creators>, <seed>)` calls under fresh
seeds, ~400 rows apiece.

**Segregation held byte-identically** across the scale-up — real founder metrics unchanged, and the live
25-bot [[Synthetic Weight Engine]] `bot0##` crew cohort untouched. Reset is the `botmk_`-scoped
`marketplace-purge`, never `purge_synthetic_data()`.

(This section read "Offline code COMPLETE … **Pending (founder-gated):** merge → dispatch a small 2/4 →
… → scale to 100/300" until 2026-07-26, describing the state at build time — it had been wrong since the
merges on 07-25.)

## See Also
- [[Synthetic Weight Engine]]
- [[Creator Groups (Crews)]]
- [[CGC Campaigns]]
