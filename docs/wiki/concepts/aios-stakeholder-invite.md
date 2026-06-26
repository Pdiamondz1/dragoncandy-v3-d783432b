---
title: AIOS Stakeholder Invite
type: concept
created: 2026-06-26
updated: 2026-06-26
sources: [2026-06-26-aios-stakeholder-invite.md]
tags: [aios, internal, auth, user-roles, provisioning, supabase, resend]
---
# AIOS Stakeholder Invite

How **internal-only accounts** are provisioned for the DragonCandy AIOS
(`internal.dragoncandy.io`): a reusable, admin-only **invite-by-email** that grants AIOS access
and lets the invitee set their own password — **without ever creating a consumer DragonCandy.io
account**. Shipped in PR #178; the driver was adding Adrian Vella as an AIOS admin. Provisioning
used to be hand-inserted `user_roles` rows in the DB; this is the UI + plumbing that replaces that.
The provisioned accounts navigate the surface described in [[AIOS Internal Shell]].

## The hard-block keystone (`handle_new_user` guard)

A guard clause at the top of the `public.handle_new_user()` trigger:

```sql
IF NEW.raw_user_meta_data->>'account_scope' = 'internal' THEN
  RETURN NEW;   -- internal-only: create NO consumer profile rows
END IF;
```

So an internal account has **no** `profiles` / `creator_profiles` / `business_profiles` row — it
never appears in Browse Creators and can't open a consumer dashboard. This works only because the
consumer app already tolerates a profile-less user: `AuthContext.fetchProfile` uses `.maybeSingle()`
(null, no crash) and `DashboardRedirect` bounces a null-role user to `/auth`. **AIOS access is
purely `user_roles`** (`admin` ⇒ full; `stakeholder` ⇒ read-only), gated by the two-tier
`InternalRoute`. No consumer `app_role` enum change was needed.

> **Migration gotcha (Codex P2):** the guard must be `CREATE OR REPLACE`-d onto the **current**
> trigger body. A newer migration (`refresh_profile_on_resignup`, `DO UPDATE`) had superseded the
> old `ON CONFLICT DO NOTHING`; building on the stale body would have regressed the resignup
> refresh. (General rule: base any function replace on the latest migration's body.)

## The choke point (`manage-internal-users` edge function)

One admin-gated function, `{ action: 'invite' | 'list' | 'revoke' }`. Browser-invoked, so
`verify_jwt=false` + manual auth: `auth.getUser(jwt)` → require a `user_roles` `admin` row (else 403).

- **invite** (`{ email, full_name?, tier }`, default `admin`):
  - **New user** → `admin.generateLink({ type:'invite', data:{ account_scope:'internal', … }, redirectTo: internal-host /auth/update-password })` (the metadata triggers the hard-block guard above), insert `user_roles(tier)`, send a **branded Resend** set-password email.
  - **Existing, never accepted** (no `last_sign_in_at`) → grant role + **re-send a fresh `magiclink`** link. **(Codex P2 catch:** the original wrongly short-circuited these to `already_has_access`, never re-sending a working link.)
  - **Existing, accepted** → `already_has_access` no-op, or grant the role + a granted-access email.
- **list** → server-side enrichment (email + `active`/`invited` status + name); needed because a client can't read others' `user_roles` under self-select RLS.
- **revoke** → delete the user's `user_roles` rows; **refuses to remove the last admin** (lockout safety).

Pure, vitest-tested `lib.ts` helpers (no `https://` imports so Vitest loads them), 13 tests.
Frontend: `/internal/stakeholders` (admin-tier) + `useInternalUsers`/`useInviteInternalUser`/
`useRevokeInternalUser`, reusing the existing `/auth/update-password` flow on the internal host.

## Key Decisions

- **Internal-only by construction, not by convention** — the trigger guard makes a consumer profile
  *impossible* for these accounts, rather than relying on UI hiding.
- **Admin default tier, with a per-invite read-only `stakeholder` option** (founder's choice).
- **No new table/secret/RLS/OAuth/consumer-enum change** — built on `user_roles`, the existing
  `handle_new_user` trigger, `InternalRoute`, and Resend (`RESEND_API_KEY` already existed).

## Known Issues

- None functional. Codex second review clean; the two Codex P2 catches (stale-trigger-body
  regression, never-accepted re-invite gap) were fixed before merge.
- **Founder go-live prerequisites** (one-time, done): allow-list
  `internal.dragoncandy.io/auth/update-password` (+ `/*`) in Supabase Auth Redirect URLs; deploy
  the edge fn with `verify_jwt=false`.

## See Also
- [[AIOS Internal Shell]] — the navigation/layout surface these accounts use; the `admin` vs
  `stakeholder` tier here is what hides its admin-only "Operate" nav group.
- [[Supabase]] — Auth (`generateLink`, `user_roles`, the `handle_new_user` trigger) backing this.
- [[Notification Delivery]] — the branded-email delivery patterns this reuses (Resend).
