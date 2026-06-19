---
title: Organizations
type: entity
created: 2026-06-10
updated: 2026-06-10
sources: [supabase/migrations/20260426200000_team_accounts.sql, src/hooks/useOrgData.ts, src/types/org.ts]
tags: [organizations, team-accounts, multi-unit, billing, rls, schema]
---

# Organizations

The team-accounts layer: a parent **organization** owns one or more **org units** (locations for
restaurants, products for brands) and has **org members** (users with roles). This is the structure
that makes DragonCandy multi-location/multi-brand ready — a prerequisite for the Y2+ multi-metro
scaling in the [[DragonCandy Platform]] three-year plan. Surfaced as a wiki gap by the first
autoresearch `loop` run (no prior page despite being a shipped system).

## Schema

Three core tables, all RLS-enabled, defined in
`supabase/migrations/20260426200000_team_accounts.sql`:

- **`organizations`** — `org_type` ('restaurant' | 'brand'), `slug`, `logo_url`, billing fields
  (`stripe_customer_id`, `stripe_subscription_id`, `subscription_tier` free→enterprise, `seat_count`),
  soft-delete (`deleted_at`, `hard_purge_at`).
- **`org_units`** — `org_id` FK, `unit_type` ('location' | 'product'), name/address/geo, per-unit
  social URLs, and **per-unit Stripe Connect** fields (`stripe_account_id`,
  `stripe_onboarding_complete`, `pending_balance`) added in `20260512200000_org_unit_stripe.sql`.
- **`org_members`** — `org_id` + `user_id` (unique), `role` ('owner' | 'admin' | 'standard'),
  `invitation_status` ('invited' | 'active' | 'suspended').

**Wiring into the rest of the schema:** `profiles` gained `org_id` + `active_org_unit_id`;
`campaigns` gained `org_id` + `org_unit_id`; `campaign_applications` gained `org_id`;
`dragonshare_posts` gained `target_org_id` + `target_org_unit_id`. A `public_organizations` view
(`20260507032145_*.sql`) exposes only `id, name, slug, org_type, logo_url` for non-deleted orgs.

RLS uses security-definer helpers (`get_user_org_ids()`, `request_org_deletion()`, `restore_org()`,
`force_gdpr_erasure()`, `cron_hard_purge_expired()`) so policies stay non-recursive — the same
pattern as `has_role()` (see [[Supabase]]).

## Frontend

Fully wired, lazy-loaded under business/brand role guards:

- **Hooks** — `src/hooks/useOrgData.ts` (`useOrg`, `useOrgUnits`, `useActiveOrgUnit`,
  `useCreateOrgUnit`/`useUpdateOrgUnit`/`useDeleteOrgUnit`, `useMyOrgRole`) and
  `src/hooks/useOrgMembers.ts` (`useOrgMembers`, `useUpdateMemberRole`, `useRemoveMember`,
  `useInviteMembers`).
- **Components** — `src/components/org/` (`OrgUnitSwitcher`, `AddEditUnitModal`, `InviteModal`,
  `DeleteOrgSheet`, `LeaveOrgSheet`, `LocationBadge`).
- **Pages** — `OrgUnitsPage.tsx` (`/dashboard/business/locations`, `/dashboard/brand/products`) and
  `OrgBillingPage.tsx` (`/dashboard/.../billing`).
- **Edge function** — `supabase/functions/invite-member/index.ts` (owner/admin-gated invites; magic
  link for new users; fires `send-notification-email`). No other org-specific edge functions — orgs
  are managed via direct RLS-governed queries.

## Maturity

**Partially built.** Core team management is shipped end-to-end: org/unit/member CRUD, the invite
flow, soft-delete with a 30-day grace + hard-purge. Incomplete: the billing portal
(`OrgBillingPage` calls a `create-billing-portal-session` edge function that is **not present in the
repo**), per-unit Stripe onboarding (schema fields exist, no managing UI), and `take_rate` /
`active_campaign_limit` org columns (no editing UI).

## Known Issues

- **Logo sync trigger exists in prod but not in migrations — drift risk (flag, verified 2026-06-10).**
  `useOrgData.ts` references a `sync_brand_logo_from_business_profile` trigger that appears in **no
  migration file**. Live-DB verification confirmed it **does** exist in prod: trigger
  `trg_sync_brand_logo` on `business_profiles` (`AFTER INSERT OR UPDATE OF logo_url`) runs the
  security-definer function, which propagates `logo_url` to `organizations` and `org_units` for the
  owner's org (non-destructively — only when the target logo is null/empty or still matches the old
  value). So post-creation logo edits **do** propagate — this is **not** a data bug. The real hazard
  is **migration drift**: because the trigger lives only in the prod DB, a clean replay
  (staging/CI) recreates the schema *without* it, silently breaking logo sync there. Capture it in a
  migration to close the gap. See [[Migration Replay Drift]].

## See Also

- [[DragonCandy Platform]]
- [[File Management]]
- [[Stripe Connect]]
- [[Supabase]]
- [[Migration Replay Drift]]
- [[Take-Rate Ladder]]
- [[Pricing Architecture]]
