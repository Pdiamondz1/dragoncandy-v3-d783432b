# Email verification by code — the signup tab stops being thrown away

Date: 2026-08-26
PRs: #528 (route gate), #530 (the code path)
Migrations: `20260826220000_email_verification_code`, `20260826250000_consume_email_verification_code`
Edge functions deployed: `verify-email`, `send-verification-email`

## The complaint

Signing up ended with `supabase.auth.signOut()`. The tab that had just done the work was
discarded, and the only way forward was: open a mail client, click a link, land on a third
page, log in again. On a phone, where mail is a different app, that is a round trip many
people never finish. Logging in while unverified did the same thing by a different route —
`AuthForm` read the profile, signed the user out, and reported a dead-end string.

The founder's report was blunter: "it still strands the signup tab".

## What shipped

The session survives signup. The email now carries a six-digit **code** the user types on
the page they are already standing on. The **link is unchanged and still works** — it is
the only thing that does if the tab is closed, if the code is mistyped past its budget, or
if the mail is read on another device. The panel polls `profiles.email_verified` every four
seconds so a link clicked on a phone advances the signup tab by itself.

## Why a six-digit code is safe when a UUID token is, and what it rests on

The emailed token is a UUID: 122 bits, unguessable, safe to accept with **no session at
all** — which it must be, since the link arrives from a mail client that has never seen our
origin. A six-digit code is about twenty bits. That difference is the whole design.

**`verify-email` runs at `verify_jwt = false` BECAUSE of that link.** So the gateway
authenticates nobody, and the function body must. It resolves the code against
`caller.id` from the request's own JWT and refuses without one. This is not defence in
depth — it is the only thing standing there. Without it, six digits would be brute-forceable
anonymously against every account on the platform.

**The attempt cap stops the attack the JWT does not**: sign up as `victim@example.com`,
never open the inbox, and guess. Email verification exists to prove inbox control, so
guessing past it defeats the feature entirely.

## Three design decisions worth carrying

### 1. The cap is enforced in SQL, not TypeScript

Counting attempts in the edge function and then acting on the count is check-then-act:
concurrent guesses all read the same pre-cap value and all proceed, so a cap of ten buys
ten-times-concurrency guesses. **This project shipped exactly that bug once already** — the
phone-verification throttle — where it was raised as a Codex P1 and moved into
`reserve_phone_verification_send`. Same shape, same remedy:
`consume_email_verification_code`, SECURITY DEFINER, service-role only, one
`pg_advisory_xact_lock` per user around the whole check-and-spend.

### 2. The budget is per USER, not per code — because resend is the back door

A per-code cap resets on demand: "resend" mints a fresh row with `attempts = 0`. Summing
attempts across every LIVE code the user holds closes it — the budget cannot be refilled,
only waited out.

Proven on prod in a rolled-back transaction:

| step | result |
|---|---|
| wrong guess | `remaining: 2` |
| wrong guess | `remaining: 1` |
| **resend, then wrong guess** | **`remaining: 0`** — the fresh row did not refill |
| the **correct** code | `too_many_attempts` — the cap actually holds |
| profile after exhaustion | still unverified |
| correct code with budget | `verified`, profile flips true |
| double submit | `already_verified` — idempotent, not an error |

Control in the other direction: the same call without the `service_role` claim raises
`forbidden: service role required`.

A strict cap is affordable **only because the link is unaffected**. Nobody is ever locked
out of verifying; they are moved from one route to the other.

### 3. Spending the code and verifying the profile are ONE transaction

The token path beside it does them as two statements in the edge function, so a failure
between them burns the credential without recording what it bought. Recoverable there only
because a resend mints a fresh token. The code path needs no such escape hatch.
Deliberately NOT fixed in this branch: the claim was "add a code route, keep the link
working", and a reviewer cannot tell a behaviour change from a feature if the token path
moves in the same diff.

## What removing signOut() rests on

Nothing is loosened by keeping the session. #528 had already made `ProtectedRoute` gate
every authenticated route on `email_verified`, and `AuthPage.checkProfileCompletion`
refuses to route an unverified user onward. **Signing out was never the control — it was a
side effect standing in for one.** Codex independently read `ProtectedRoute.tsx` and
`AuthContext.tsx`, which is exactly the question the removal turns on.

`#528` itself carries a subtlety: `deriveEmailGate` uses
`profile?.email_verified ?? !!user?.email_confirmed_at`, and `??` rather than `||` is
load-bearing. Supabase's own confirmation is **disabled** on this project — 45 of 45 users
have `email_confirmed_at` set, 44 within one second of creation — so an `||` would
auto-verify every password signup and switch the gate off for everyone.

## A latent hole the UX change would have activated

`email_verification_tokens` carried a client SELECT policy ("Users can view own verification
tokens") plus 14 grants to `anon`/`authenticated`. Harmless while nothing in `src/` read the
table — and this change gave it something worth reading. Migration `20260826220000` drops
the policy and revokes the grants at TABLE level; `service_role` retains its 7.

Verified by object: policies 1 → 0, client grants 14 → 0, both new columns present, the
partial index present, and an invented column name returning 0 as the control.

## Forced controls — and two that failed to fail

Every claim that matters was checked by breaking the code and confirming the test went red:

- removing rejection sampling from the code generator → 2 tests fail
- removing the poll → both emailed-link tests fail
- taking `p_user_id` from the request body → the JWT pin fails
- dropping the bearer-token refusal → that pin fails
- reading the code from a query string → that pin fails
- putting a `signOut` back on the signup path → the session pin fails

**Two controls first failed to fail**, and the tests were fixed rather than the claim
softened:

1. The "keeps polling across parent re-renders" test passed a **stable** `vi.fn()`, so the
   callback identity never changed and an effect naming it as a dependency would never
   restart. The test would have passed against the exact bug it exists to catch.
2. After fixing that, it still passed — because the loop stopped re-rendering after three
   seconds, so the final restarted interval survived long enough to fire. The re-renders
   have to keep **outpacing** the interval for the assertion to mean anything.

## Deploy ordering

Schema → functions → frontend. The gap that leaves is the benign one: emails carry a code
the page does not yet ask for, while the link keeps working. Frontend-first would have shown
a code box nothing could satisfy — the ordering mistake this project made twice in two days
with the Instagram and Facebook connectors.

Boot-verified after deploy:

| probe | result |
|---|---|
| code path, no `Authorization` | **401**, our JSON body |
| control: invented function name | **404**, the *gateway's* body |
| code path with the public anon key | **401** — a valid JWT naming no user is not authorization |
| link path, bogus token by GET | **302**, unchanged |

## Process notes

**A migration version was taken twice by a parallel session.** `20260826210000` was
recorded on prod as `store_tiktok_connection_stats`, and `230000`/`240000` as the TikTok
bigint pair. `supabase/migrations.test.ts` compares versions across the **repo tree** and
structurally cannot see a file that lives only on another branch. `db:apply`'s
already-recorded refusal caught both. **The ledger is the other half of the namespace.**

**Python edits silently converted CRLF → LF** on both edge functions, inflating the diff
from ~123 real lines to 513. A reviewer's attention would have been spread across ~390 lines
of pure line-ending churn. Restored before review — and the restore has to be **amended into
the commit**, since `git diff origin/main...HEAD` compares commits, not the working tree.

**`deno check --node-modules-dir=auto` rewrites `node_modules`.** It replaced the vite/vitest
entries with symlinks into a `.deno` tree and broke the test runner outright. Recovered with
`rm -rf node_modules/.deno deno.lock && npm install`. Do not pass that flag in this repo.

**A probe was wrong before the deploy verification was right.** The first check for the panel
on prod grepped only the scripts named in the root HTML — but `AuthPage` is a lazy chunk that
is never listed there, so it could not have been found. The negative control returned 0 the
same way, which is the tell: resolve the chunk name out of the root bundle first, then probe
it with a control that SHOULD be found.

**The frontend polls `profiles.email_verified`, and the tests mock that read.** Verified
separately against prod grants that `authenticated` can still SELECT it after
`20260824140000` narrowed the table to 15 columns — the same query showing `email` and
`phone` absent, which is its own control. This is the shape of the `useProfileNames` bug in
this repo: a swallowed 42703 on columns that do not exist.

## Twilio, checked the same day

The founder forwarded a "Twilio Business Profile Approved" email. Two corrections came out
of reading the console rather than the email:

- The compliance page rendered **Pending review** until reloaded. The email alone would have
  been a claim about a claim.
- **21608 was never the compliance profile's doing.** It is the *trial-account* restriction,
  lifted by upgrading; the compliance profile gates A2P 10DLC and toll-free registration.
- The green **Active** badge is NOT evidence of an upgraded account — that is account
  *status* (not suspended), which trial accounts show too. The real evidence is billing type:
  **Pay-as-you-go with auto-recharge enabled**, which a trial account cannot be.
- Twilio's Debugger is empty across 30 days, and that is **not** evidence: 21608 returns
  synchronously from the API rather than as a logged event. Our own
  `phone_verification_attempts` table held the real sequence.

Still unproven: a send to a number that has never been on the Verified Caller ID list.

## Left undone

- No real signup has exercised the code flow end to end on prod.
- `dame+onboardtest@dragoncandy.com` is a live prod account counted in the investor-facing
  user figure.
- A distinct wizard-completion signal to replace `is_completed` as the routing gate (a
  rejected Codex P1 from the previous session, recorded in code, needs a migration plus
  backfill).
