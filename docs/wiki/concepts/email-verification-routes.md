---
title: Email Verification Routes
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-email-verification-by-code.md]
tags: [auth, onboarding, security, edge-functions, rate-limiting]
---
# Email Verification Routes

DragonCandy proves inbox control two ways from one email: a **link** carrying a UUID token,
and a **six-digit code** typed on the page the user is already standing on. They share one
row, one expiry, and one purpose — and they need completely different protection, which is
the reason this page exists.

## Why there are two routes

Signup used to end in `supabase.auth.signOut()`. The tab that had just done the work was
discarded, and the only path forward was a mail client, a link, a third page and a second
login. On a phone, where mail is a different app, that is a round trip many people never
finish. The code deletes the round trip. The link survives because it is the only thing that
works when the tab is gone, when the mail is read on another device, or when the code's
attempt budget is spent.

The signup tab polls `profiles.email_verified` every four seconds, so a link opened on a
phone advances the tab that is still sitting open on a laptop. Nothing else can tell it:
the write happens in another browser, against a row this page holds no subscription to.

## The security argument, which is entirely about entropy

| credential | entropy | safe without a session? |
|---|---|---|
| UUID token (the link) | ~122 bits | **yes** — and it must be; the link arrives from a mail client |
| six-digit code | ~20 bits | **no** |

`verify-email` runs at **`verify_jwt = false` because of the link**. The gateway therefore
authenticates nobody, so the code path's protection lives in the function body:

1. **It requires the caller's own JWT** and resolves the code against `caller.id`. This is
   not defence in depth — it is the only thing standing there. Without it, six digits are
   brute-forceable anonymously against every account on the platform.
2. **An attempt cap**, which stops the attack the JWT does not: sign up as somebody else's
   address, never open the inbox, and guess. Email verification exists to prove inbox
   control, so guessing past it defeats the whole feature.

The code is accepted from the **POST body only, never a query string** — a URL is written to
server logs, browser history and outbound `Referer` headers. The token has no choice; the
code does.

## The cap is per USER, and enforced in SQL

Two properties, each closing a hole the other leaves open.

**In SQL, not TypeScript.** Reading the count in the edge function and then acting on it is
check-then-act: concurrent guesses all read the same pre-cap value and all proceed, so a cap
of ten buys ten-times-concurrency guesses. This project shipped that exact bug once in the
phone-verification throttle, where it was a Codex P1 and moved into
`reserve_phone_verification_send`. `consume_email_verification_code` is the same remedy —
SECURITY DEFINER, service-role only, one `pg_advisory_xact_lock` per user around the whole
check-and-spend.

**Per user, not per code.** A per-code budget refills on demand, because "resend" mints a
fresh row with `attempts = 0`. Summing across every LIVE code the user holds means the
budget can only be waited out. Proven on prod in a rolled-back transaction: two wrong
guesses, a resend, a third wrong guess — `remaining` went 2 → 1 → 0, and the **correct** code
was then refused. Control in the other direction: the same call without the `service_role`
claim raises `forbidden: service role required`.

**A strict cap is affordable only because the link is unaffected.** Nobody is locked out of
verifying; they are moved from one route to the other. Design the fallback before tightening
the budget.

## Spending a credential and recording what it bought

`consume_email_verification_code` marks the token row spent and sets `profiles.email_verified`
in **one transaction**. The token path beside it does the two as separate statements, so a
failure between them burns the credential without recording what it bought — recoverable only
because a resend mints a fresh token. That asymmetry is deliberate and was left in place: the
branch's claim was "add a code route, keep the link working", and a reviewer cannot separate a
behaviour change from a feature if the token path moves in the same diff.

## What replaced signOut()

Keeping the session loosens nothing. `ProtectedRoute` gates every authenticated route on
`email_verified`, and `AuthPage.checkProfileCompletion` refuses to route an unverified user
onward. **Signing out was never the control — it was a side effect standing in for one.**

The shared derivation (`src/lib/emailVerificationGate.ts`) uses
`profile?.email_verified ?? !!user?.email_confirmed_at`, and `??` rather than `||` is
load-bearing: Supabase's own confirmation is **disabled** on this project (45 of 45 users
carry `email_confirmed_at`, 44 within one second of creation), so `||` would auto-verify
every password signup and switch the gate off for everyone. Same trap [[Social Login]]
documents from the other direction.

Internal-only accounts are exempt — they have no `profiles` row by design, and judging them
on `email_verified` would bar the team from the app on a column nothing ever sets. See
[[Internal-Only AIOS Users]].

## The hole the UX change would have activated

`email_verification_tokens` carried a client SELECT policy and 14 grants to
`anon`/`authenticated`. Harmless while nothing in `src/` read the table — and this change
gave it something worth reading. Closed at TABLE level (a column-level `REVOKE` is a
documented no-op against Supabase's ambient grant, the lesson
[[Identity & Address Verification]] records four instances of). Verified by object: policies
1 → 0, client grants 14 → 0, `service_role` keeps its 7.

**A dormant permission is not a safe one — it is one feature away from being live.**

## Known Issues

- **No real signup has exercised the code flow end to end on prod.** Deployed, boot-verified
  and proven at the SQL layer is not the same as exercised — the same *recorded is not actual*
  distinction [[Updated-At Trigger Drift]] records three cases of.
- The frontend polls `profiles.email_verified`, and the tests mock that read. The grant was
  checked separately against prod; a future narrowing of the `profiles` column grants would
  break the poll **silently**, exactly like the `useProfileNames` 42703 this repo swallowed.
- `src/lib/verificationCode.ts` is a hand-kept mirror of the edge module (Deno and Vite
  cannot import across the boundary — the house pattern). It is pinned to its original by
  test and is a **strict subset**: no generator, no attempt cap. A cap in the bundle would
  look like a control and enforce nothing.
- The token path's two-statement write is a known asymmetry, not an oversight. See above.

## See Also

- [[Onboarding Resume & Post-Login Routing]] — where the user goes once verification passes
- [[Identity & Address Verification]] — the phone/address/Stripe half, and the atomic-throttle
  precedent this borrowed
- [[Account Completeness Engine]] — what "ready" means once the account exists
- [[Social Login]] — the other consumer of `email_verified`, and why the provider allowlist
  exists
- [[Updated-At Trigger Drift]] — *recorded ≠ actual*: why every claim here is checked against
  the object, with a control that could have failed
