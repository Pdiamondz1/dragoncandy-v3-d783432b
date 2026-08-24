# Session: social login

Date: 2026-08-24
Branch: `feat/social-login`

## What was asked

"build the social login" — authorising the `handle_new_user` migration I had flagged as
needing confirmation at the end of the onboarding slices.

## What prod said before any code was written

Two queries changed the design.

`select count(*), count(*) filter (where email_confirmed_at is not null) from auth.users`
-> 45 of 45 confirmed, every one on the `email` provider. Then the gap between
`created_at` and `email_confirmed_at`: **44 of 45 within one second, minimum 6ms**.

That is GoTrue stamping the column during signup, not a person clicking a link — Supabase's
own confirmation is disabled, and the app runs its own verification email instead. So the
one-line fix everyone reaches for (mirror `email_confirmed_at` into `email_verified`) would
have auto-verified every password signup and switched the app's email gate off for
everybody.

Verification is granted from the **provider** instead.

## Three objects, each for a case a trigger cannot see

`handle_new_user` covers accounts OAuth creates. `claim_initial_role` applies the role
chosen before the redirect. `sync_oauth_email_verification` covers accounts OAuth *links
to* — a password account that never verified whose owner later signs in with Google, which
the INSERT trigger never sees.

The third one only exists because review found the blind spot in the second.

## The review loop — seven rounds, seven findings, all real

Every finding was about a case the design had not considered, and two of them were the
same shape one level apart:

1. An existing incomplete account could be converted — "nothing completed and no org"
   describes an abandoned signup as well as a new one.
2. A failed OAuth start left the role in storage for the next sign-in to consume.
3. The native shell loses the role across an origin boundary — and, worse, ejects the user
   into Safari entirely.
4. A cancelled signup left its role for a later role-less login.
5. A linked password account stayed unverified (the third object above).
6. The age window was read as a consent-screen deadline — refuted, since `created_at` is
   stamped after the callback, but the silent failure next to it was real and is now
   logged.
7. The guarded route was lost across the redirect.

## Method notes

**Everything was proven on prod inside a rolled-back transaction, and every assertion was
paired with a control that could fail.** The controls did real work twice: removing the two
account-age/provider guards reproduced "an existing account was converted", and widening
the identity allowlist to `IS NOT NULL` made a password-only account verify itself. Neither
would have been visible from reading the code.

**The rollback itself was proven first** — create a table, roll back, confirm
`to_regclass` is null — because a proof that runs inside a transaction nobody verified is
a write to production.

**TypeScript does not check RPC names on this client.** Verified with a control file
calling an invented function: zero type errors. The client is cast loose because
`types.ts` lags migrations. A test now matches the name and parameter against the
migration.

**One commit went in with a failing test** because `npm run test | tail -3` prints the
duration line and cuts the failure count off above it. The summary line needed was one
higher.
