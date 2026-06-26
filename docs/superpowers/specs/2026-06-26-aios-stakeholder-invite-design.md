# AIOS Stakeholder Invite — Design

**Date:** 2026-06-26
**Status:** Built (branch `feat/aios-stakeholder-invite`), founder go-live pending
**Spec author:** Claude (Opus 4.8)

## Problem / Context

We want to add **Adrian Vella** (`Adrian.Vella.jobs@gmail.com`) as a stakeholder on the
DragonCandy **AIOS** (`internal.dragoncandy.io`). Adrian has no account on the consumer app
(dragoncandy.io) and should never get one — his account exists **exclusively** for the AIOS.
More broadly we want a reusable, founder-run **invite** option so internal stakeholders can be
granted AIOS access by email and set their own password, without ever touching the consumer app.

Before this, AIOS access (`user_roles` rows `admin`/`stakeholder`) was provisioned only by hand in
the DB. The internal host already has a founders-only login (`InternalAuth`, no signup) and is fully
role-gated; the consumer password-set flow (`/auth/update-password`) already works on the internal
host. So this is mostly **provisioning + an admin invite UI**, not new auth plumbing.

## Decisions

- **Access level:** invitees get the **`admin`** app-role (founder's choice — full AIOS incl.
  financials, Corrections, Playbooks, Internal Donny). The invite UI exposes a per-invite
  Admin/Stakeholder tier selector (Admin default) so the same feature serves read-only stakeholders.
- **Consumer access: hard-blocked.** Internal invitees get **no consumer profile** (no `profiles`,
  `business_profiles`, or `creator_profiles` row). `AuthContext.fetchProfile` already tolerates a
  null profile; `DashboardRedirect` bounces a null-profile user to `/auth`; with no `creator_profiles`
  row they never appear in Browse Creators. AIOS access is purely `user_roles`.
- **Email:** branded DragonCandy email via Resend (existing sender), carrying a secure Supabase
  set-password link.
- **UI:** an admin-only `/internal/stakeholders` management page — invite, list, revoke.

## Architecture

### 1. DB — `handle_new_user` guard (`supabase/migrations/20260626120000_…`)
A guard clause at the top of `handle_new_user()`: when the new auth user carries
`raw_user_meta_data.account_scope = 'internal'`, return immediately and create no consumer rows.
The rest of the body is the **current** definition (the `DO UPDATE` refresh-on-resignup logic from
`20260610120000` is preserved — not the older `DO NOTHING`). Additive; ordinary signups are
unaffected because they never set `account_scope`.

### 2. Edge function — `manage-internal-users` (`verify_jwt=false`, admin-gated)
Single choke point, `{ action: 'invite' | 'list' | 'revoke' }`. Browser-invoked, so it does its own
auth: `auth.getUser(jwt)` → require a `user_roles` row with `role='admin'` (non-admin → 403).

- **invite** `{ email, full_name?, tier }` (tier default `admin`; explicit invalid → 400):
  - **New user:** `admin.generateLink({ type:'invite', data:{ account_scope:'internal', full_name }, redirectTo: internal-host /auth/update-password })` → insert `user_roles(tier)` → branded Resend invite email with the action link.
  - **Existing, accepted (signed in), already has tier:** `already_has_access` (no-op).
  - **Existing, accepted, missing tier:** add role → granted-access email.
  - **Existing, never accepted (no `last_sign_in_at`):** add role if missing → **re-send** a fresh `type:'magiclink'` set-password link (covers first-email-failed / expired-link). Status `invited`.
- **list:** `user_roles` rows in (`admin`,`stakeholder`) enriched server-side via the admin API with
  email + status (`active` if ever signed in, else `invited`) + name from `profiles` when present.
  (Client can't read others' `user_roles` under self-select RLS, so this is server-side.)
- **revoke** `{ user_id }`: delete the user's `user_roles` rows; refuses to remove the **last admin**.

Pure, vitest-tested helpers in `lib.ts` (email/tier validation, status derivation, branded email
HTML) — no `https://` imports so Vitest loads them. 13 tests.

### 3. Frontend
- `src/hooks/internal/useInternalUsers.ts` — `useInternalUsers` (list), `useInviteInternalUser`,
  `useRevokeInternalUser`; raw `fetch` with session bearer + anon `apikey` (mirrors `useCommitWikiPr`).
- `src/pages/internal/InternalStakeholders.tsx` — admin-tier, dark ops-deck page: invite form
  (email + optional name + Admin/Stakeholder toggle), list with tier+status badges, revoke w/ confirm.
- Route `/internal/stakeholders` (`InternalRoute tier="admin"`) + `adminNav` item.

## Invariants held
- *Provisioning is admin-only* (edge fn admin gate + admin-tier route/nav).
- *Internal-only accounts never reach the consumer app or marketplace* (no consumer profile).
- No new table, no new secret, no consumer-enum change, no RLS/OAuth change.

## Founder-run go-live (out of repo)
1. **Supabase Auth → URL Configuration → Redirect URLs:** add
   `https://internal.dragoncandy.io/auth/update-password` (and `https://internal.dragoncandy.io/*`),
   or `generateLink`'s `redirectTo` is rejected.
2. **Deploy** `manage-internal-users` (Lovable deploys frontend only) with **`verify_jwt=false`**
   (confirm via `list_edge_functions`). `RESEND_API_KEY` already exists — no new secret.
3. After merge: provision Adrian — invite `Adrian.Vella.jobs@gmail.com` as **Admin** from
   `/internal/stakeholders`.

## Verification
typecheck clean · lint 0 errors · 568 tests pass (13 new) · build OK · Codex second review clean.
Live: invite → branded email → set password on internal host → sign in → `/internal` with admin nav;
negative: redirected away from consumer dashboards, absent from Browse Creators; revoke denies access.
