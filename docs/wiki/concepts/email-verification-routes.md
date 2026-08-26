---
title: Email Verification Routes
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-email-verification-by-code.md, 2026-08-26-email-verification-prod-exercise.md]
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

## Exercised against prod, 2026-08-26 — and exactly how far that goes

Both routes were driven against production on the founder-designated account
`dame+onboardtest@dragoncandy.com`. **Be precise about what that covered**, because the first
draft of this section said "end to end" and cleared a gap it had not closed:

| leg | covered? |
|---|---|
| function → Resend → real inbox, code matching the stored row | **yes** |
| emailed **link**, clicked by a person in a real mail client | **yes** — founder click on the THIRD token, consumed 21:26:02 |
| **code** submitted and accepted, attempt budget spent | yes, but **posted straight to the endpoint** |
| six-digit code typed into the signup panel | **no** |
| a fresh signup creating the account | **no** — the account pre-existed |
| the login form | **no** — the session came from an admin `generate_link` exchange |

**Three tokens were issued, and the order matters** — a reviewer reading this page without it
concluded the human click had failed, which is the opposite of what happened:

| token | created | consumed by |
|---|---|---|
| `29ece178` | 21:09:21 | the agent spending its **code** at 21:18:09 |
| `4779a877` | 21:10:53 | the agent's **link** probe at 21:12:31 |
| `7bd889aa` | **21:25:05** | the **founder's click** at 21:26:02 |

The founder first clicked the two *already-spent* tokens at 21:22 and both correctly refused with
`invalid_or_used` — a used verification link failing is the design working, and the agent had
burned both during testing without warning anyone. A third email was then sent specifically so a
human could click a live one, and left untouched by the agent. That is the click in the table.

So the link route has been walked by a human from mail client to a verified *account* — note the
endpoint stamps `verified_at` and `email_verified` and then redirects to
`/auth?mode=login&verified=1`. **It does not create a session**; the destination is a login prompt,
which is the whole reason the code route exists for the tab that is already signed in. The code route
is proven from send through delivery to acceptance, with the browser input still untested, and
neither route has been entered from a real signup. Raised by the Codex second review after this
page claimed otherwise.

**What the empty table did and did not prove.** `email_verification_tokens` held zero rows at
inspection, and the first draft of this section read that as "the feature had never run". It does
not: `cron.job` `expire-email-verification-tokens` deletes expired rows at 05:30 daily, and a
verification email demonstrably went out on 2026-08-24 — it is still in the mailbox — so a row
existed and was swept. *An empty result is ambiguous*, which is [[Verify Before Reporting]]'s own
lesson, applied late and only because the Codex second review pushed back.

What IS established comes from the ship date, not the table: `code`, `attempts` and the
code-bearing template all shipped in **#530 on 2026-08-26**, and the 2026-08-24 email carries the
old template with no code in it. So the **link** had been sent before; the **code** path could not
have run before that day, and had not.

**The whole test turned on one forced control.** `consume_email_verification_code` returns
`ok:true, reason:'already_verified'` *before* it looks at the code, so on an already-verified
account every submission succeeds. That is correct behaviour — a double submit, or a race
with the link being clicked on another device, must not raise an error about something that
already worked — but it means a verification test run against a verified account is a
guaranteed false pass. Demonstrated rather than reasoned about: the **wrong** code `999999`
returned **HTTP 200 success**, leaving `attempts = 0` and `verified_at` null. After
`email_verified` was set false, the identical request returned **HTTP 400 `mismatch`**.

| probe | before the flip | after |
|---|---|---|
| wrong code `999999` | **200 success** | **400 `mismatch`**, `remaining` 9 |
| wrong code `000000` | — | 400 `mismatch`, `remaining` **8** |
| real code from the email | — | 200, `email_verified` false → true |

`remaining` falling 9 → 8 across two *different* wrong codes is the per-user budget working:
a per-code budget would have answered 9 twice. Both attempts landed on the live row and left
the already-spent row at `attempts = 0`.

The link route: a valid token returned **302 `/auth?mode=login&verified=1`** and stamped
`verified_at`; replayed after use the same token on the same endpoint returned **302
`?status=error&reason=invalid_or_used`**. A query string carrying no `token=` at all returns
`missing_token`, distinct from both — so each answer discriminates.

Auth: no `Authorization` header → 401; **the anon key used as the bearer** → 401 (the
[[verify_jwt Is Not Authorization]] class, and the only thing rejecting it is this function's
own `getUser`); a malformed five-digit code → 400 with no attempt charged.

Delivery was real, not a provider success flag: both mails reached the **inbox, not spam**,
one second after the row was written, the emailed code matched the stored code exactly, the
link was built on `dragoncandy.com` from the honoured request `Origin`, and the footer's
visible label matched its own href — the derived-label anti-phishing fix holding in a real
message rather than in the template source.

**Sessions came from the admin API, never a password:** `generate_link` (type `magiclink`)
then `/auth/v1/verify` on the `hashed_token`. `supabase/scripts/staging-login.mjs` performs
the same exchange but deliberately refuses production, so it was left alone rather than
adapted.

## Known Issues

- **The UI has still never been exercised.** Nobody has typed a code into the six-digit input
  in a browser. Everything beneath it — send, delivery, code, link, attempt budget, auth — is
  proven on prod (above); the input itself needs a fresh signup, which is why this survived the
  2026-08-26 pass. *Proven below the UI is not proven*, the same distinction
  [[Updated-At Trigger Drift]] records three cases of.
- **Reading the delivered mail through the claude.ai Gmail connector corrupts it.** Every `=`
  followed by two hex digits is eaten as a quoted-printable escape, so `?token=29ece178` reads
  back as `?token)ece178` and the links look uniformly broken. They are not — an unrelated
  sender's mail shows the identical damage. Verify a link against the stored token, never
  against that reader. See [[Verify Before Reporting]].
- `_shared/verification-code.ts`'s doc comment says "against a five-attempt cap" while
  `MAX_CODE_ATTEMPTS` is **10**. Prose only — the constant is what reaches the RPC.
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
