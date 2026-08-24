---
title: Social Login
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-social-login.md]
tags: [auth, oauth, onboarding, supabase, verification, roles]
---
# Social Login

Google, Apple and Facebook sign-in, **shipped dark** behind `SOCIAL_LOGIN_ENABLED`.
Slice 3 of the onboarding redesign named it; this is it. Setup steps:
`docs/runbooks/social-login-setup.md`.

## Two things had to be true first, and neither was

**An OAuth user would have been told to verify an email that never arrives.**
`profiles.email_verified` defaults false, `handle_new_user` never set it, and `AuthPage`
gates every login on it — while the verification mail only goes out from the password
signup path. The client cannot patch over it either: `authenticated` holds INSERT on that
column but not UPDATE.

**Every social signup would have become a content creator.** `signInWithOAuth` cannot
carry user metadata, so the trigger has nothing to read and falls back to its default. On
a three-role marketplace that files every restaurant and every brand as a creator, and
the client cannot fix it afterwards for the same grant reason.

## The obvious fix was wrong, and production said so

Mirroring `email_confirmed_at` into `email_verified` is the one-line fix, and it would
have **auto-verified every password signup**, silently switching the app's own email gate
off for everyone.

Supabase's built-in confirmation is **disabled** on this project. Measured 2026-08-24:
45 of 45 users have `email_confirmed_at` set, **44 of them within one second of
`created_at`, minimum gap 6ms**. GoTrue stamps it during signup, not on a click. So on
this project that column does not mean "this person proved they own this address"; it
means almost nothing.

Verification is granted from the **provider** instead, via an allowlist rather than
`<> 'email'` — a provider nobody planned for (a SAML tenant, a phone signup, a magic
link) would otherwise inherit "verified" from a match the code never considered.

**The durable rule: a column that looks like a verification signal is only one if
something verifies. Check what actually writes it before trusting its name.**

## Three objects, and each exists for a case a trigger cannot see

Migration `20260825140000`.

| Object | Covers |
|---|---|
| `handle_new_user` (changed) | Accounts OAuth **creates** — sets `email_verified` from the provider allowlist |
| `claim_initial_role(p_role)` | The role chosen before the redirect, applied **once** |
| `sync_oauth_email_verification()` | Accounts OAuth **links to** — which the INSERT trigger never sees |

The third exists because of the second's blind spot, found by review: `handle_new_user`
fires on INSERT, so it misses a password account that never verified whose owner later
signs in with Google. GoTrue links the identity to the existing row, nothing is inserted,
and the app rejects a sign-in a provider just completed. It keys off `auth.identities`,
which GoTrue writes and no client can, and only ever sets `true`.

## `claim_initial_role` refuses more than it accepts

Identity from `auth.uid()` with **no id parameter**, so nothing can be pointed at another
account. Then four refusals, and two of them were added because "nothing completed and no
organization" describes an **abandoned signup** exactly as well as a brand-new one:

- `onboarding_complete` / `organization_exists` — one-shot by condition rather than by
  timestamp. Claiming business or brand provisions an org via `trg_auto_create_org`, so
  the org check is what makes a second claim impossible. A second claim would leave org
  rows describing an account type the user no longer has.
- `not_an_oauth_account` — `raw_app_meta_data->>'provider'` records the identity that
  **created** the account and does not change when another is later linked. A password
  account that just linked Google still reads `email` and is refused.
- `account_not_new` — an account **genuinely created by Google months ago**, whose owner
  now presses "Sign up with Google" and picks a different role. The provider check passes
  for it; only age refuses it.

**Neither guard is redundant.** Provider catches the linked-password case, age catches
the returning-OAuth case, and either alone converts an existing account into one it never
agreed to be.

**The age window is not a deadline on the consent screen**, and assuming otherwise is how
someone would widen it and reopen the case it closes: `auth.users.created_at` is stamped
when GoTrue processes the provider's **callback**, so leaving Google open for an hour
creates the account at the end of that hour. The window covers the gap between the
redirect landing and the claim on the very next page load — seconds.

This is **not a privilege surface**. Password signup already lets the client choose `role`
freely in `options.data`, because role here is a declared *account type*; real
authorization lives in `user_roles` and `has_role()`, which none of this touches.

It also privates the leftover creator row when a business claims — that row comes from the
trigger's default and `creator_profiles.profile_visibility` **defaults to `public`**, so a
restaurant would otherwise appear in Find Creators as an empty creator.

## Carrying state across a redirect that destroys it

The role and the guarded destination both travel in the **redirect URL**, not only in
`sessionStorage`. Storage is scoped to an **origin**, and this round trip can change one —
the Capacitor shell runs on `capacitor://localhost` while `publicOrigin()` is
`https://dragoncandy.com` — and a private-mode browser may refuse storage entirely.

Neither is a trust question. Both are user-editable, and neither protects anything;
`claim_initial_role` does. Editing the role parameter lets someone set the account type of
their own brand-new account, which is what the button does anyway. Both are validated on
the way in regardless, so no arbitrary string reaches an RPC.

**The stash is written on every attempt — the role, or nothing.** A signup that reached
the provider and was cancelled *there* leaves its role behind with no redirect to consume
it, and a later login in the same tab carries no role to overwrite it.

The destination is validated as a same-origin **path**: `//evil.com` is protocol-relative
and resolves to another origin, a backslash reads as a slash to some parsers, and `/auth`
would loop. It is deliberately a **new** parameter rather than the existing `returnTo`,
which `handleOAuthReturn` treats as an absolute URL for `window.location.href` after an
origin-allowlist check — that is the external-handoff path, this is an in-app route.

## Web only, for now

`signInWithOAuth` must redirect to a real https origin, which in the Capacitor webview
walks the user out of the app into Safari and finishes them on the web app. Native needs a
custom-scheme redirect (`com.dragoncandy.app://`) through Capacitor's Browser plugin, with
that scheme registered in all three provider consoles. Until then `isNativeApp()` hides the
buttons and the shell shows the email form alone.

**Apple is not optional.** Apple rejects any iOS app offering another social login without
Sign in with Apple, and a test asserts its presence — dropping it is an App Store
rejection, not a preference.

## TypeScript will not catch a wrong RPC name here

Checked rather than assumed: a control file calling
`supabase.rpc('this_function_does_not_exist_anywhere')` produced **zero** type errors, so
the `Database` generic is not constraining `rpc()` on this client (it is cast loose because
`types.ts` lags migrations). Combined with the client swallowing RPC failures — deliberate,
since a role is not worth blocking a sign-in over — a typo would be silent both ways. A
test reads the name and parameter out of the source and matches them against the
migration, and fails against a one-character change.

## Known Issues

- **The migration is not applied and the flag is off.** Nothing about this is live.
- **No provider console is configured**, so nobody has completed a real OAuth round trip.
  Everything here is proven at the SQL layer and by unit tests, not end to end.
- **Facebook and Google review both need a public privacy-policy URL**, which the site
  gate would break — it allowlists only `/robots.txt` and `/favicon.ico`, so `/privacy`
  answers 401. The same conflict already blocks TikTok and X.
- **Apple's client secret is a JWT that expires every six months.** When it lapses, Apple
  sign-in fails for everyone at once with no warning.
- **Native social login does not exist** — see above.

## See Also

- [[Onboarding Wizard & Depth]] — slices 3 and 4, which named social login as blocked on
  exactly the migration this shipped.
- [[Account Completeness Engine]] — the registry whose `AccountRole` this reuses.
- [[Internal-Only Users]] — the other `handle_new_user` branch, and why it returns early.
- [[Anon Key Is Not Authorization]] — same shape: a check that looks like a gate but is not.
