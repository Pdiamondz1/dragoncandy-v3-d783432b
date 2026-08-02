# Session — VerifiedRoute missing-profile lockout (PR #357)

Date: 2026-08-02
Branch: `fix/verified-route-missing-profile` → PR #357 (merged, squash `011e2f5a`)
Trigger: founder report — "Adrian Vella is unable to sign-up or login to DragonCandy.io",
with a phone video of the screen.

## The report was wrong in an instructive way

The video showed the landing page with a toast: *"Please verify your email to continue. You
can resend the verification email from the login page."* The natural reading — signup/login
is broken — was false in every particular:

| Checked on prod | Value |
|---|---|
| `auth.users.email_confirmed_at` | `2026-06-26 11:17:44` — verified 8 min after signup |
| `last_sign_in_at` | `2026-08-02 11:48:25` — **logging in successfully that morning** |
| `raw_user_meta_data.account_scope` | `internal` |
| `user_roles.role` | `admin` |
| `public.profiles` row | **none** |

He was authenticating fine and being deflected by the email-verification gate under a notice
he could never act on. Resending the verification mail would never have changed anything.

**Diagnostic lesson:** for any "can't log in" report, query `auth.users LEFT JOIN profiles`
and read `last_sign_in_at` *first*. It falsifies the report's premise in one query.

## Root cause

`VerifiedRoute.tsx:13` gated on `profile?.email_verified !== true`, collapsing two unrelated
states — "email genuinely unverified" and "there is no `profiles` row to read". `VerifiedRoute`
guards exactly **one** route, `/profile/setup` (the onboarding wizard), so a profile-less user
was bounced off the only page that could have provisioned them, in a closed loop:

```
login → checkProfileCompletion → !profile → /profile/onboarding
  → /profile/setup (VerifiedRoute) → profile null → toast → /auth?mode=login
  → isAuthenticated → checkProfileCompletion → ↻
```

`BusinessRoute` and `BrandRoute` also funnel profile-less users to `/profile/onboarding`, so
they feed the same trap; `VerifiedRoute` is where the loop closes.

### Two ways in — the second is the common one

1. **Internal-scoped accounts.** `handle_new_user` early-returns for
   `raw_user_meta_data.account_scope='internal'` (the AIOS stakeholder invite), so these have
   no consumer profile *by design*. Adrian was the first to visit the consumer app.
2. **Any signup whose `profiles` row is missing but whose metadata still carries a `role`.**
   `AuthContext.createProfileFromMetadata()` fabricates a stand-in profile — and that object
   **has no `email_verified` key at all**. This is not internal-specific; it is the general case.

Cause 2 is what made the first fix attempt wrong, and it survived a review round (below).

## The fix (PR #357)

- **`VerifiedRoute`** now resolves on whether the flag is *known*, not on whether a profile
  object exists: `profile?.email_verified ?? !!user?.email_confirmed_at`. `??` falls back to
  auth truth only when the flag is absent, so a genuinely stored `false` still blocks.
  Internal-only accounts (no profile + `account_scope='internal'`) are sent to `/internal`.
- **`OnboardingWizard`** now provisions the `profiles` row it had always *assumed* existed —
  it previously upserted only `creator_profiles`/`business_profiles`, so onboarding could not
  self-heal a missing core row. Uses `ignoreDuplicates: true` (INSERT … ON CONFLICT DO
  NOTHING) so an existing row is never touched and a real `email_verified=false` cannot be
  overwritten. Also sets `account_type` explicitly — the column defaults to `'restaurant'`,
  which would strand a brand user in `BrandRoute` now that onboarding is a provisioning path.
- **`AuthContext`** gains `refreshProfile()`. It previously had no way to re-read the profile
  outside an auth-state change (`fetchProfile` ran only in the listener), so a freshly
  provisioned user would navigate to a dashboard still holding `profile === null`.

RLS already permits the wizard's insert: policy `Users can insert their own profile`,
`WITH CHECK (auth.uid() = id)`.

## Codex second review — three rounds, two real defects found

Round 1 and round 2 each surfaced a genuine defect in this branch:

1. **Stale auth state after provisioning** — verified real: `AuthContext` exposed no refresh,
   so the newly onboarded user's dashboard would read a stale null profile. → `refreshProfile()`.
2. **Unconfirmed users could self-provision** — the guard treated "no row" as verified.
   Empirically unreachable (prod: 42 users, 0 unconfirmed) but that was a *dashboard-config*
   guarantee, not a code one. → auth-level fallback.
3. **The metadata-fabricated profile** (round 2's fix was still wrong) — `profile ? … : …`
   takes the first branch for the fabricated object, and `undefined !== true` rebuilt the
   original loop for the *common* case. → the `??` formulation.

Finding 3 is the one worth remembering: it means **"profile is null" is not a reliable test
for "the profile row is missing"** anywhere in this codebase.

## Verification

- 9 unit tests (`VerifiedRoute.test.tsx`). The **4 covering genuine unverified-email blocking
  pass against both old and new code**, so the real verification path is provably unchanged;
  the regression tests fail against the old code with the expected assertions.
- `npm run typecheck` + `npm run build` clean; 542 tests across 76 files pass.
- Three Codex rounds to clean.

## Prod data remediation (one-time, founder-confirmed)

Adrian's account was separately unblocked by direct prod write, gated through the `careful`
skill (exact SQL quoted and confirmed before running):

1. `profiles` row — `role='business_client'`, `email_verified=true` (truthful:
   `email_confirmed_at` was long set).
2. `business_profiles` row — `account_type='restaurant'`, `is_completed=false` so he still
   fills in real details.
3. `raw_user_meta_data.role='business_client'` — **required, not cosmetic.**
   `OnboardingWizard` reads role from metadata and **defaults to `content_creator`**; without
   it he would have landed in the creator flow and hit a *second* loop
   (`business_profiles.is_completed` never becoming true).

His `account_scope='internal'` and `user_roles.role='admin'` were left untouched — he keeps
`/internal`. `account_scope` is read only by `handle_new_user` at signup, so it is inert
afterwards. He was the only user on prod without a profile row; that count is now **0**.

Verified post-write: both previously-failing guard conditions now pass, and the downstream
path was traced end to end (`business_profiles_user_id_key UNIQUE (user_id)` exists, so the
wizard's `onConflict:'user_id'` upsert cleanly updates the seeded row;
`ROLE_STEPS.business_client` and `DASHBOARD_ROUTES.business_client` both resolve).

## Notes / open threads

- This **partially qualifies** the "accommodate, don't back-fill" decision recorded for
  internal-only users. Adrian was back-filled a *real* consumer profile — but by founder
  decision that he should genuinely have consumer access, making him a legitimate dual
  internal+consumer user, not a fake row created to satisfy a constraint. The original
  principle (don't fabricate a profile merely to unblock plumbing) still stands.
- The `/auth?mode=login` bounce is loop-prone for *any* blocked state, including the
  legitimate unverified-email case, because `AuthPage` re-runs `checkProfileCompletion` on
  `isAuthenticated`. Pre-existing and out of scope here, but it is the structural reason a
  wrong guard verdict becomes an infinite loop rather than a dead end.
