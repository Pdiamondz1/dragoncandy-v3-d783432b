# Session — Living Synthetic Marketplace (Sub-project A), Phase A1 offline build

Date: 2026-07-25
Branch: `feat/living-marketplace`
Spec: `docs/superpowers/specs/2026-07-25-living-synthetic-marketplace-design.md`
Plan: `docs/superpowers/plans/2026-07-25-living-marketplace-phase-a1.md`

## What this is

Sub-project A of the "living marketplace / 200K-DAU" initiative: stand up a **persistent, browsable
synthetic marketplace on prod** through **real, RLS-enforced app flows** (bot JWTs), so the app *feels
populated* from both the business and creator sides — real profiles, free campaigns,
applications→collaborations, uploaded content, DragonFeed posts, messaging, discounts, reviews,
multi-location orgs, and CGC — visible to everyone yet **excluded from founder metrics** via the
existing `is_synthetic` segregation. Siblings: the runner-matrix load Slice and the live daily
`bot0##` crew cohort (Synthetic Weight Engine).

This session built and reviewed the **entire offline codebase**, applied the teardown migration to
prod, and stopped at the founder-gated first seed run.

## What shipped (offline code, branch `feat/living-marketplace`)

A new `sim/marketplace/` module + a `marketplace-seed` harness subcommand, reusing the existing harness
spine verbatim (`serviceClient`/`bootGate`/`mintBot`/`SessionPool`/`makeBotFor`) and the verified
free-campaign lifecycle in `sim/behavior/actions.ts` (`executeAction`):

- **`sim/marketplace/personas.ts`** — `botmk_b_<seed>_<i>` / `botmk_c_<seed>_<i>@synthetic.dragoncandy.test`
  cohort namespace, distinct from `bot0##`/`botla`/`botseed_`.
- **`sim/mint.ts`** — `readSessionCapableBots` now EXCLUDES `botmk_` (else the daily crew tick +
  single-runner load would sweep the 400 persistent bots in — the key integration hazard).
- **`sim/marketplace/text.ts`** — curated deterministic text pools + the `briefFn` seam + (Task 12)
  full-profile field pools.
- **`sim/marketplace/actions.ts`** — real-flow writes the crew engine lacks: `sendMessage`
  (create_or_get_direct_conversation + messages insert), `postDragonFeed` (dragonshare_posts),
  `createDiscount` (promotions, status='active'), `addOrgUnit` (multi-location), `submitCgc`
  (anonymous promotion_submissions). Fail-loud.
- **`sim/marketplace/content.ts`** — real storage upload to DragonCandy's OWN public buckets
  (uid-first path for the RLS folder check) — the media-egress source Sub-project C lacked.
- **`sim/marketplace/locations.ts` (Task 12)** — 24-city US pool (`{city,state,location,postalCode,
  timezone,lat,lng}`) + `locationAt(i)`.
- **`sim/marketplace/profile.ts` (Task 12)** — pure builders for full business/creator profile field
  objects + org_unit geo, **excluding social-account fields**.
- **`sim/marketplace/seed.ts`** — pure idempotent populate sequencer `runMarketplaceSeed` over injected
  `SeedSteps` (mint-missing → readCohortRefs → completeProfiles → setupBusinesses → publishCampaigns →
  runCollaborations → seedMessaging → seedDragonFeed → [multiLocation] → [cgc]); + the cohort cap +
  one-shot freshness guards.
- **`sim/run.ts`** — `marketplace-seed` + `marketplace-purge` commands + `buildDefaultSeedSteps` (the
  LIVE integration glue wiring the sequencer to real Supabase writes; not unit-tested by design —
  verified on the prod run).
- **`supabase/migrations/20260725120000_purge_synthetic_marketplace_cohort.sql`** — the `botmk_`-scoped
  teardown RPC (**applied to prod + no-op verified this session**).
- **`.github/workflows/marketplace-seed.yml`** — manual-dispatch workflow (populate + teardown), runs
  in the `synthetic-weight` GitHub Environment with the `SIM_*` secrets, fail-closed at boot.

223 sim tests green; `tsc` + `eslint` clean throughout.

## Key decisions / gotchas (durable)

- **Money model:** standard campaigns are FREE (`fixed_price=0`, `group_id=null` public) → complete via
  the reused dual-party NO-payout path (`requestCompletion`). Paid/Stripe = Sub-project B.
- **A public free campaign does NOT auto-activate on hire** — the verified
  `accept_application_with_collaboration` only auto-activates *crew* campaigns (`group_id NOT NULL`), so
  `runCollaborations` explicitly flips `campaigns.status` published→active→completed via own-row update.
- **`enforce_active_campaign_limit`** (org `active_campaign_limit` DEFAULT **1**; counts published+active
  public campaigns per `user_id`, reads the org via `profiles.org_id`) would abort a 2nd publish →
  `setupBusinesses` raises the synthetic org's limit (service-role provisioning, valid — like the
  auto-created org). This is why the load-mix `campaign_write` uses `status='draft'`.
- **Every business bot already has an org + primary unit + owner membership** (trigger
  `trg_auto_create_org_fn` on `business_profiles` insert) → multi-location is just inserting extra
  `org_units` into the owned org (RLS `is_org_owner_or_admin`).
- **Geo is text on the profile tables** (`location`/`city`/`postal_code`/`country`/`timezone`); business
  lat/lng lives on `org_units.lat/lng` (set on the primary unit); creator geo = client-geocoded
  location text (no creator lat/lng column).
- **`creator_profiles.skills` is `creator_skill[]` ENUM** (video_editing, ugc_creation, illustration,
  photography, copywriting, social_media_management, graphic_design, animation, influencer_marketing,
  content_strategy, other) — NOT free text; `business_profiles.industry` is `industry_type` enum
  (…food, lifestyle, …). Using display text breaks the update. Full profiles EXCLUDE all social-URL
  fields + `brand_social_guidelines` + `stripe_*` + computed `average_rating`/`total_reviews`.
- **Teardown = `marketplace-purge` (botmk_-scoped) ONLY — NEVER `purge_synthetic_data()`** (that also
  deletes the live `bot0##` 25 + `botla…`). Grounded in the live pg_constraint FK graph: deleting the
  botmk `auth.users` cascades the vast majority; explicit residue = storage.objects (botmk uids +
  botmk promotion ids) + organizations (captured before the delete) + push_notifications/crew_activity
  precaution. `residual_*` report is the fail-loud backstop.
- **`marketplace-seed` is ONE-SHOT + cohort-capped** (Codex final review): `assertMarketplaceCohortCap`
  (<=150 biz / <=450 creators, non-negative ints — prevents a fat-finger minting thousands) called
  first; `assertMarketplaceCohortFresh` (fail if any botmk_ profile exists → "purge before re-seeding")
  after boot, before seeding. Only minting is resumable; downstream is not, so a second run is blocked
  rather than duplicating persistent data. Mirrors bulk-seed's `assertActiveNamespaceFree`.
- **`SIM_*` prod secrets are GitHub-Environment-only** — not on any local machine (verified). So
  `marketplace-seed` runs via the GitHub workflow, which (GitHub rule) needs the file on the default
  branch → the branch must merge before the first dispatch.

## Reviews

Every task passed per-task spec+quality review. Whole-branch review (opus): *ready to merge*, 1
Important (cgc via service-role/unconditional) — fixed to bizClient + `--cgc`-gated. Codex second
review, 3 passes: R1 (Tasks 1-8) → 2 P1 (campaign-limit abort; seed-without-teardown) fixed; R2
(Tasks 1-12) → P1 cohort cap + P2 downstream-not-resumable → fixed via the cap + one-shot guard; R3
confirmation. Prod: teardown migration applied + no-op verified, 0 new security advisors.

## State at session end

Offline code COMPLETE + reviewed. Teardown RPC LIVE on prod. **PENDING (founder-gated):** merge the
branch → dispatch a small 2/4 `marketplace-seed` → segregation proof (`aios_*`/`platform_weight.*_real`
byte-identical across promotions/org_units/promotion_submissions/business_profiles/dragonshare) +
teardown-to-zero → scale to 100/300 (+`--multi-location`/`--cgc`) → optional LLM brief (Task 11).
First-run verify items: the `--cgc` anon upload to `promotion-videos`, the own-row `campaigns.status`
flips, the `profile-assets` avatar-bucket RLS (best-effort), org targeting.
