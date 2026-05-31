# Migration Drift Audit — 2026-05-31

**Scope:** Compare all repo migrations in `supabase/migrations/` against the production
`schema_migrations` ledger and verify actual schema-object existence in production
(`zocahiffooqdybdhguqv` / DragonCandy_v3). Read-only. No writes to production.

**Why:** Second confirmed instance of repo changes not reaching production. Migrations are
applied by hand (Lovable deploys frontend only), so any file can be silently skipped.

**Method:**
- Layer 1 (ledger diff): `supabase migration list --linked` (CLI was already authenticated and
  linked; no Docker, no DB password, no MCP needed).
- Layer 2 (object existence): production schema introspected via `supabase inspect db
  table-sizes/index-sizes --linked` (tables + indexes) and `supabase gen types typescript
  --linked` (columns + RPC functions + enums). All read-only.
- Local lint: `node scripts/audit-migrations.mjs --git` (`npm run migrations:audit`).

---

## TL;DR

| Metric | Value |
|---|---|
| Repo migration files | **201** |
| Production ledger entries | **197** |
| Repo versions NOT in ledger | **55** |
| Ledger versions NOT in repo | **51** |
| Histories diverge starting | **2026-05-09** |
| Duplicate version prefixes | **1** (`20260526200000`, 2 files) |
| **Confirmed TRUE drift (object actually missing in prod)** | **1 — `campaign_skips`** |
| Confirmed applied (objects present, recorded under different version) | ~38 |
| Not object-verifiable via introspection (RLS policy / CHECK / data-only) | ~16 (high-confidence applied) |

**Headline:** Only **one** migration is genuinely missing from production —
`20260512100000_campaign_skips.sql`. Its table and both indexes are absent, and the feature is
**actively used by the frontend** (`src/hooks/useCampaignSkips.ts`, 3 call sites), so that
feature is currently **broken in production** (queries hit a non-existent relation). Every other
"missing from ledger" migration was in fact applied — it was just **re-stamped with a different
version number** when applied through Lovable/MCP, which is why the ledger and repo disagree.

---

## The structural problem: two parallel migration histories

Up to **2026-05-08** the repo and the production ledger track in perfect lockstep. From
**2026-05-09** they fork into two bookkeeping systems for largely the same schema changes:

- **Repo files** use hand-authored *round* timestamps: `20260509200000`, `20260510100000`, …
- **Ledger rows** use *wall-clock* timestamps recorded at apply time: `20260509231042`,
  `20260510143144`, … (51 such entries have no matching repo file).

This is consistent with migrations being applied through **Lovable's Supabase integration / MCP
`apply_migration`**, which records the apply event under a fresh timestamp/name rather than the
repo filename's version. Net effect:

1. **Ledger ≠ repo bookkeeping** — the `schema_migrations` version list is not a reliable index
   of which repo files were applied. (This is why ledger-diff alone reported 55 "missing" when
   only 1 is truly missing.)
2. **Repo cannot reproduce production** — the 51 ledger-only entries are real schema changes
   applied directly in production whose SQL was *never mirrored back* into `supabase/migrations/`.
   A clean `supabase db reset` from the repo would **not** rebuild the current production schema.

Both are real risks. (1) makes silent drift (like `campaign_skips`) easy to miss. (2) means the
repo is not the source of truth for the production schema.

---

## Finding 1 — TRUE DRIFT: `campaign_skips` missing in production

`supabase/migrations/20260512100000_campaign_skips.sql` creates `public.campaign_skips`
(table) + `idx_campaign_skips_campaign` + `idx_campaign_skips_user` + RLS policy
`"Users can manage their own skips"`.

**Production state (verified):**
- Table `campaign_skips` — **ABSENT** (0 of 75 public tables).
- `idx_campaign_skips_campaign`, `idx_campaign_skips_user` — **ABSENT**.

**Impact:** `src/hooks/useCampaignSkips.ts` queries `.from('campaign_skips')` in 3 places
(insert + 2 selects). Against production these fail with *relation "campaign_skips" does not
exist*. The campaign-skip feature is broken for all users in production.

**Recommended remediation (user runs — not done by this audit):**
Apply the migration to production, then verify the feature.
```
# review first
cat supabase/migrations/20260512100000_campaign_skips.sql
# apply via MCP apply_migration, or:
supabase db push --linked --include-all   # NOTE: see Finding 3 before using db push
```
After applying, confirm `campaign_skips` exists and the skip feature works (desktop + mobile).

---

## Finding 2 — Duplicate version `20260526200000`

Two files share the same version prefix; the ledger keys on `version`, so at most one could ever
be recorded:
- `20260526200000_backfill_historical_notifications.sql` (data-only backfill)
- `20260526200000_dragonshare_optimization.sql` (schema: nullable `post_url`/`platform`,
  `content_file_path`/`flagged_at`/`flagged_by` columns, `dragonshare-content` bucket, 3 storage
  policies)

**Production state (verified):** `dragonshare_posts.content_file_path`, `.flagged_at`,
`.flagged_by` all present, and `dragonshare-content` is referenced by live code
(`useDragonShareUpload.ts`, `DragonSharePostCard.tsx`) — so the **dragonshare_optimization**
schema change **is applied**. The backfill half is data-only (not object-verifiable).

**Risk:** This duplicate is a latent hazard for `supabase db push` and any tooling that keys on
version. **Recommended fix:** rename the *backfill* file to a new, later, unique timestamp (e.g.
`20260526200001_backfill_historical_notifications.sql`). Do **not** rename the dragonshare file —
its change is already live; renaming an applied migration causes its own drift. (Rename is a repo
edit only; it does not touch production.)

---

## Finding 3 — Back-dated migrations (`db push` hazard)

`npm run migrations:audit` flags files whose version is older than a migration committed before
them. Two classes:

- **Import-boundary false positives (18):** all `2025-06-…` files share git-commit date
  `2026-03-29` — a one-time history import (repo squash-imported from Lovable). Not real
  back-dating; ignore.
- **Genuine back-dating (~10):** files stamped earlier than they were actually committed —
  e.g. `20260406050000_brand_shortlists.sql` and `20260407000004_profile_uploads.sql` (committed
  2026-05-09), `20260426050000_add_quick_actions_to_donny_messages.sql` (committed 2026-05-09),
  `20260515000000_backfill_missing_collaborations.sql` (committed 2026-05-16, sorts before
  `…000001`), `20260526200000_dragonshare_optimization.sql`, the two `outstand_account_links`
  files. **A back-dated file is exactly what `supabase db push` can silently skip** if a
  later-versioned migration is already recorded. These were applied through Lovable (objects
  present), so no current damage — but the pattern is the root cause of this whole class of bug.

---

## Finding 4 — 51 production-only ledger entries (repo cannot reproduce prod)

51 `schema_migrations` rows (precise timestamps, 2026-05-09 → 2026-05-31) have **no repo file**.
These are schema changes applied directly in production (via Lovable/MCP) and never written back
to `supabase/migrations/`. Consequence: the repo is not a faithful source of the production
schema; `db reset`/local dev will not match prod. **Recommended:** going forward, mirror every
applied change into a repo migration (see deployment checklist added to `CLAUDE.md`).

---

## Layer-2 verification detail

**Confirmed present in production (sample of the ~38 — objects verified):**
- Tables: `payment_events`, `stripe_webhook_events`, `user_roles` ✓
- High-risk payments/Stripe columns: `org_units.stripe_account_id`, `.stripe_onboarding_complete`,
  `.pending_balance` ✓; `campaigns.escrow_checkout_session_id` ✓;
  `project_reviews_sponsorship_reviewer_reviewee_unique` ✓
- Functions (RPC): `apply_to_campaign`, `accept_application_with_collaboration`,
  `create_counter_offer`, `can_create_application`, `get_user_conversations`,
  `has_collaboration_on_campaign`, `get_org_unit_financials`, `has_role`, `is_platform_admin`,
  `verify_dragonshare_post`, `check_prerequisite_status` ✓
- Indexes (16/16 non-campaign_skips): `idx_profiles_first_run_active`,
  `idx_conversations_org_unit_id`, `idx_push_notif_user_unread`, `idx_donny_conversations_active`,
  `campaign_social_hooks_campaign_stage_user_deliverable_key`, `user_roles_user_id_role_key`, … ✓
- Enum `app_role` ✓
- Positive control: `payment_events` (ledger-recorded, pre-divergence) confirmed present — proves
  the introspection method correctly reports existence.

**Not object-verifiable via type introspection — high-confidence applied via co-evidence
(recommend a final confirm; see query below):**
- RLS-policy-only migrations: `20260513000001` (expand_deliverable_access), `20260514000010`
  (restrict_applications), `20260517000001` (messages update policy), `20260518000000`
  (profile_visibility_rls), `20260519140000` (invited_creators_view), `20260526300000`
  (notification_delete_policy).
- CHECK-constraint-only: `20260510200000` (social_post_log_post_type_check), `20260512000000`
  (help_articles_category_check), `20260524000001` (campaigns_escrow_status_check),
  `20260520000000` (allow_invited_counter_offers — check + policy).
- Trigger functions (excluded from `gen types` by design): `20260513000000` (notify_donny_nudge),
  `20260521000007` (triple_post_check_completion — its sibling columns
  `triple_post_sessions.status/completed_at` are present, so the migration applied).
- Data/config-only (no schema object to verify): `20260512000001` (help_articles_content_refresh),
  `20260515000000` (backfill_missing_collaborations), `20260517100000` (reset_transactional_data),
  `20260519130000` (campaign_invitations_realtime), `20260526200000` (backfill notifications),
  `20260527100001` (cgc_nullable_customer_fields).

**To close the residual to 100% (run in Supabase SQL Editor, read-only, paste result):**
```sql
SELECT jsonb_pretty(jsonb_build_object(
  'policies', (SELECT jsonb_agg(schemaname||'.'||tablename||' :: '||policyname)
               FROM pg_policies WHERE schemaname IN ('public','storage')),
  'check_constraints', (SELECT jsonb_agg(conname)
               FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
               WHERE n.nspname='public' AND c.contype='c')
));
```

---

## Prioritized remediation (user-run; this audit made no production writes)

1. **Apply `20260512100000_campaign_skips.sql` to production** — fixes a live broken feature.
   Verify the skip feature afterward (desktop + mobile).
2. **Rename the backfill file** to deduplicate version `20260526200000` (repo edit only).
3. **(Optional) Confirm the ~10 policy/CHECK migrations** with the query above; apply any that
   come back missing.
4. **Adopt the deployment checklist** (now in `CLAUDE.md`) so every push mirrors migrations to
   prod and re-records them in the repo — closing the two-histories gap going forward.
5. **Run `npm run migrations:audit` before every push** to catch duplicates/back-dating early.

## How to re-run this audit
```
npm run migrations:audit            # local lint (duplicates, back-dating, malformed)
supabase migration list --linked    # ledger diff (Layer 1)
supabase gen types typescript --linked > /tmp/prod_types.ts   # columns + functions (Layer 2)
supabase inspect db index-sizes --linked                      # indexes (Layer 2)
```
