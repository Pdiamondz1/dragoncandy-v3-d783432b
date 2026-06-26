# Session — AIOS Stakeholder Invite (PR #178)

**Date:** 2026-06-26 (backfill ingest 2026-06-26 — the feature shipped without a wiki page;
caught by the verify-knowledge orphan/wikilink check during the AIOS UI polish knowledge-sync).
**PR:** #178 — branch `feat/aios-stakeholder-invite`, **merged + deployed to prod.**
**Scope:** new admin-tier page + one edge function + one trigger guard. No new table/secret/
RLS/OAuth/consumer-enum change.

## Problem / driver

Grant **Adrian Vella** (`Adrian.Vella.jobs@gmail.com`) access to the DragonCandy **AIOS**
(`internal.dragoncandy.io`) **without** ever giving him a consumer DragonCandy.io account.
More broadly: a reusable, admin-only **invite-by-email** so internal stakeholders get AIOS
access and set their own password, never touching the consumer app. Before this, AIOS access
(`user_roles` `admin`/`stakeholder` rows) was provisioned only by hand in the DB.

## Decisions (locked with founder)

- **Access level:** invitees default to the **`admin`** app-role (founder's choice — full AIOS);
  the invite UI still exposes a per-invite **Admin / Stakeholder (read-only)** tier selector.
- **Consumer access: hard-blocked** — internal invitees get **no consumer profile at all**.
- **Email:** branded DragonCandy email via Resend with a Supabase set-password link.
- **UI:** an admin-only `/internal/stakeholders` management page (invite · list · revoke).

## What shipped

### DB — `handle_new_user` guard (migration `20260626120000_…`)
A guard clause at the **top** of `public.handle_new_user()`:
`IF NEW.raw_user_meta_data->>'account_scope' = 'internal' THEN RETURN NEW; END IF;` — so an
internal account creates **no** `profiles` / `creator_profiles` / `business_profiles` rows. It
therefore never appears in Browse Creators and can't open a consumer dashboard. This works
because `AuthContext.fetchProfile` already tolerates a null profile (`.maybeSingle()`) and
`DashboardRedirect` bounces a null-role user to `/auth`; **AIOS access is purely `user_roles`**.
**Keystone gotcha (Codex P2):** the guard was rebuilt on top of the **current** trigger body —
a newer migration (`20260610120000_refresh_profile_on_resignup`, `DO UPDATE`) had superseded the
old `ON CONFLICT DO NOTHING`; basing on the stale body would have regressed the resignup refresh.

### Edge function — `manage-internal-users` (`verify_jwt=false`, admin-gated)
A single choke point, `{ action: 'invite' | 'list' | 'revoke' }`. Browser-invoked, so it does
its own auth: `auth.getUser(jwt)` → require a `user_roles` row with `role='admin'` (else 403).
- **invite** `{ email, full_name?, tier }` (default `admin`; explicit invalid → 400):
  - **New user:** `admin.generateLink({ type:'invite', data:{ account_scope:'internal', full_name }, redirectTo: internal-host /auth/update-password })` → insert `user_roles(tier)` → branded Resend invite email.
  - **Existing, accepted (has signed in), already has tier:** `already_has_access` (no-op).
  - **Existing, never accepted (no `last_sign_in_at`):** add role if missing → **re-send** a fresh `type:'magiclink'` set-password link (covers first-email-failed / expired-link). **(Codex P2 catch:** the original short-circuited never-accepted users to `already_has_access`, never re-sending a working link.)
  - **Existing consumer user:** add the role + a granted-access email.
- **list:** `user_roles` rows in (`admin`,`stakeholder`) enriched server-side via the admin API with email + status (`active` if ever signed in, else `invited`) + name. (Client can't read others' `user_roles` under self-select RLS, so it's server-side.)
- **revoke** `{ user_id }`: delete the user's `user_roles` rows; **refuses to remove the last admin** (lockout safety).
- Pure vitest-tested `lib.ts` helpers (email/tier/status validation + branded email HTML; no `https://` imports so Vitest loads them) — 13 tests. `FROM = "DragonCandy AIOS <onboarding@notify.dragoncandy.io>"`.

### Frontend
- `src/hooks/internal/useInternalUsers.ts` — `useInternalUsers` (list), `useInviteInternalUser`, `useRevokeInternalUser`; raw `fetch` with session bearer + anon `apikey`.
- `src/pages/internal/InternalStakeholders.tsx` — admin-tier dark ops-deck page (invite form + list + revoke w/ confirm), per-invite Admin/Stakeholder toggle. Reuses the two-tier `InternalRoute` and the existing `/auth/update-password` (`UpdatePassword`) flow on the internal host.

## Founder go-live (out of repo, done)
1. Supabase Auth → Redirect URLs: allow `https://internal.dragoncandy.io/auth/update-password` (+ `/*`).
2. Deploy `manage-internal-users` with **`verify_jwt=false`** (`RESEND_API_KEY` already existed — no new secret).
3. Invite Adrian as Admin from `/internal/stakeholders`.

**Verified:** migration applied to prod (guard present, DO-UPDATE preserved); edge fn deployed
(boot-checked OPTIONS 200 + unauth POST 401); keystone proven on prod (throwaway internal auth
user → no consumer profile; normal user → has profile; cleaned up). Adrian's account confirmed
(`account_scope=internal`, role `admin`, no consumer/creator/business profiles, status Invited).

## Notes / invariants
- Internal-only accounts never reach the consumer app or marketplace.
- Provisioning is admin-only (edge-fn admin gate + admin-tier route/nav).
- Codex second review clean. Spec:
  `docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md`.
