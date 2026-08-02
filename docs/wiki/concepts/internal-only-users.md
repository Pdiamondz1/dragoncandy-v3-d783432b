---
title: Internal-Only AIOS Users
type: concept
created: 2026-06-26
updated: 2026-08-02
sources: [raw/sessions/2026-06-26-internal-only-user-fks.md, raw/sessions/2026-06-27-internal-donny-profile-read.md, raw/sessions/2026-08-02-verified-route-missing-profile.md, docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md]
tags: [aios, auth, identity, supabase, foreign-keys, internal]
---

# Internal-Only AIOS Users

A distinct identity class introduced by the AIOS stakeholder-invite flow (PR #178): a
person granted access to the internal dashboard (`/internal`) **without** a consumer-app
presence. They authenticate as a normal `auth.users` row, but the `handle_new_user` trigger
**skips all consumer-profile creation** when the signup metadata carries
`account_scope='internal'`. So an internal-only user has **no `profiles` /
`creator_profiles` / `business_profiles` row** — never in Browse Creators, never on a
consumer dashboard. AIOS access is purely `user_roles` (`admin` | `stakeholder`).

The design invariant: **"a null profile is tolerated everywhere."** `AuthContext` tolerates
a null profile; `DashboardRedirect` bounces it to `/auth`.

> **The invariant was aspirational, not true.** Three separate traps have now been found where
> it did not hold — FK writes (PR #180), caller-profile reads (PR #185), and the **frontend
> route guards** (PR #357, below). Each was invisible until an internal-only user reached that
> surface, and each time it was the same person. Treat "a null profile is tolerated here" as a
> claim to verify, not a property to rely on.

## The foreign-key trap

The invariant has a sharp edge the original code missed: **any table that foreign-keys a
user column to `profiles(id)` silently assumes the user is also a consumer user.** For an
internal-only user (no `profiles` row), an insert keyed to their `user_id` fails a foreign-
key violation.

This stayed invisible until the **first internal-only user** (Adrian, 2026-06-26) tried to
use the AIOS surface — every prior connected account had come in through the consumer app
and therefore had a profile. Symptoms:

- **Google Workspace connect** → `google_workspace_accounts_user_id_fkey` violation →
  surfaced as "Google connect failed — internal error" (see [[Google Workspace]]).
- **Internal Donny chat** → `donny_conversations_user_id_fkey` violation.

### The fix: FK target is `auth.users`, not `profiles`

For any AIOS-surface table keyed to **the caller's own user id**, the FK must reference
`auth.users(id)`, not `profiles(id)`. Because `profiles.id` *is* `auth.users.id` (1:1 —
`profiles.id` itself references `auth.users.id`), repointing is **non-destructive**: every
existing row already satisfies `auth.users`. Keep `ON DELETE CASCADE`.

PR #180 repointed three (`google_workspace_accounts`, `donny_conversations`,
`donny_tool_executions`). Consumer-app tables (campaigns, messages, file_\*, dragonshare…)
are **deliberately left on `profiles(id)`** — internal-only users never write them.

> **Rule of thumb:** when adding a new AIOS feature that writes a row keyed to the internal
> user, check the FK target first. Caller-keyed AIOS tables → `auth.users(id)`. A
> `profiles(id)` FK is a latent block for internal-only users.

Watch-out: repointing a FK away from `profiles` also removes that FK as a PostgREST embed
relationship — verify no `.select('…, profiles(…)')` embed rode it before changing it (none
did for these three).

## The profile-read trap (the read side)

FKs are only half of it. **Code that READS the caller's `profiles` row must also tolerate
its absence for internal-only users.** PR #180 fixed the *writes*; PR #185 fixed the first
*read*: `donny-chat/index.ts` loaded the caller's profile with `.single()` and
`throw "Profile not found"` on zero rows, right after auth and before any tool ran — so
**Internal Donny** failed entirely for Adrian (the only occurrence of that string
codebase-wide; v133 logged `POST 500`s at his exact attempt times).

### The fix: tolerate-or-synthesize, gated on surface

A pure, unit-tested `donny-chat/profile.ts` `resolveDonnyProfile({ profile, internalMode,
userId, fallbackName })`:
- real profile exists → return it (consumer **and** internal admins who also have a profile,
  e.g. Joe/Dame, keep theirs);
- **consumer** caller + no profile → still `throw "Profile not found"` (a genuine error there);
- **internal-only** caller + no profile → synthesize a minimal profile
  (`role:null`, `full_name` resolved from `auth.users` metadata/email so Donny greets by
  name instead of "a founder").

The call site switches `.single()` → `.maybeSingle()`. Everything downstream on the internal
path already tolerated a profile-less user — internal mode uses `INTERNAL_TOOL_DEFINITIONS`
(never reads `profile.role`), the consumer `userContext` block is skipped, and
`buildInternalSystemPrompt` reads only `profile.full_name`. So this one guard unblocked the
whole surface.

> **Rule of thumb (read side):** a `.from('profiles')…single()` keyed to the caller in any
> internal/AIOS code path is a latent block — use `.maybeSingle()` and synthesize/skip for
> internal users. The same invariant covers both FK targets *and* caller-profile reads.

`donny-chat` is the core Donny brain (172KB across deps) — too large for a safe MCP
`deploy_edge_function` re-paste, so its deploys go through the **Supabase CLI**
(`functions deploy`, auto-bundles from disk; `--no-verify-jwt` to preserve `verify_jwt=false`).
See [[Donny AI]].

## The frontend route-guard trap (PR #357) — and a false error message

The third and most user-visible instance. On 2026-08-02 the same user was reported as
**"unable to sign up or log in"** to dragoncandy.io. He was not: `last_sign_in_at` showed a
*successful* login that morning, and `email_confirmed_at` had been set on 2026-06-26. He was
being deflected by the consumer app's email-verification guard and told to verify an email he
had verified five weeks earlier — advice he could never act on.

`VerifiedRoute` gated on `profile?.email_verified !== true`, collapsing "email unverified"
with "there is no `profiles` row". Since it guards exactly one route — `/profile/setup`, the
onboarding wizard — a profile-less user was bounced off **the only page that could provision
them**, and `AuthPage` re-runs `checkProfileCompletion` on `isAuthenticated`, closing the loop:

```
login → checkProfileCompletion → !profile → /profile/onboarding
  → /profile/setup (VerifiedRoute) → toast → /auth?mode=login → ↻
```

### "profile is null" is NOT a reliable test for "the row is missing"

The sharpest lesson, and one that survived a review round. `AuthContext` **fabricates** a
profile from user metadata when the row is missing (`createProfileFromMetadata`) — and that
object carries **no `email_verified` key**. So a `profile ? profile.email_verified !== true :
<fallback>` test takes the *first* branch for the fabricated object, where `undefined !== true`
rebuilds the identical loop — and does so for the **common** case (any signup with a missing
row but a `role` in metadata), not just internal accounts.

Resolve on whether the flag is **known**:

```ts
const emailNotVerified =
  settled && (profile?.email_verified ?? !!user?.email_confirmed_at) !== true;
```

`??` falls back to auth truth only when the flag is absent, so a genuinely stored `false`
still blocks. Internal-only accounts (no profile + `account_scope='internal'`) route to
`/internal` instead of being trapped in a consumer flow they have no business in.

Two supporting gaps closed with it: `OnboardingWizard` only ever upserted
`creator_profiles`/`business_profiles`, so onboarding **could not self-heal a missing core
row** — it now provisions `profiles` too (`ignoreDuplicates`, so an existing row is never
touched), and sets `account_type` explicitly rather than inheriting the `'restaurant'` default.
And `AuthContext` had no `refreshProfile()`; `fetchProfile` ran only on an auth-state change,
so anything the app provisions mid-session stayed invisible until a reload.

> **Rule of thumb (frontend):** a route guard that reads `profile.<field>` is a latent lockout
> for anyone without a row. Derive from `auth.users` truth (`email_confirmed_at`) when the
> app-level flag is absent, and never let a guard bounce a user to a route that routes them
> straight back.

**Diagnostic lesson:** for any "can't log in" report, query `auth.users LEFT JOIN profiles`
and read `last_sign_in_at` first — one query falsifies the report's premise and reframes the
whole investigation.

## Why the (FK) failure was opaque (a backend error-handling lesson)

The FK violation presented as a meaningless `"internal error"`, not the real DB message,
because **a Supabase `PostgrestError` is a plain object, not an `Error` instance.**
`google-workspace-proxy`'s catch-all did `err instanceof Error ? err.message : "internal
error"`, so every non-`Error` throw collapsed to the literal fallback — in both the response
and the logs. The real cause was erased, which is why it hid for weeks.

Fix (PR #180): a pure `describeError(err)` helper that pulls `message`+`code` out of
non-`Error` throws and logs the full object. **General lesson:** an edge-function catch-all
that branches on `instanceof Error` will silently swallow PostgrestErrors (and any other
plain-object throw) — normalize them. See [[Error Handling Patterns]].

## Key Decisions

- Internal-only users get **no consumer profile** (PR #178 keystone) — accommodate them
  rather than back-filling a fake profile row, which would re-pollute the consumer surfaces
  the design deliberately keeps them out of.
  - **Qualified 2026-08-02:** this forbids fabricating a row to satisfy plumbing; it does not
    forbid an internal user *legitimately* becoming a consumer user. Adrian was granted a real
    consumer profile by founder decision (business/restaurant) while keeping his `admin` role —
    a genuine dual account, not a fake row. `account_scope` is read only by `handle_new_user`
    at signup, so it is inert afterwards and does not need clearing.
- Frontend route guards must derive verification from `auth.users` truth when the app-level
  flag is absent — and must never treat a fabricated (metadata-derived) profile as
  authoritative for fields it does not carry (PR #357).
- Onboarding is a **provisioning** path, not just a profile-editing one: it creates the
  `profiles` row when absent, so a user missing one can self-heal (PR #357).
- Caller-keyed AIOS tables FK `auth.users(id)`; consumer tables stay on `profiles(id)`.
- Caller-profile **reads** on the internal surface must tolerate a missing row
  (`.maybeSingle()` + synthesize), never `.single()` + throw (PR #185).
- Backend catch-alls must normalize non-`Error` throws, never `instanceof Error ? … :
  "internal error"`.

## See Also

- [[Google Workspace]] (where the symptom surfaced — the connect flow)
- [[Donny AI]] (Internal Donny hit both the FK write AND the profile read; deployed via CLI)
- [[Supabase]] (`auth.users` vs `profiles`, RLS, edge functions)
- [[Error Handling Patterns]] (the PostgrestError-is-not-an-Error lesson)
