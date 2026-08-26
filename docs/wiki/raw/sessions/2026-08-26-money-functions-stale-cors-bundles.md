# The 12 money edge functions answering `.io` were stale bundles, not a bug

**Date:** 2026-08-26
**Type:** session extract (deploy only — no code change, no migration, no PR for the fix itself)

## What was wrong

A CORS preflight from `Origin: capacitor://localhost` — the origin every fetch
carries inside the iOS Capacitor shell — was answered
`Access-Control-Allow-Origin: https://dragoncandy.io` by 12 deployed edge
functions. The browser then blocks the response, and in `WKWebView` that
surfaces as a generic fetch error, not as anything naming CORS.

The 12 were **exactly the money surface**: `release-creator-payout`,
`release-package-payout`, `release-sponsorship-payout`,
`withdraw-pending-balance`, `refund-campaign-escrow`, `refund-package-order`,
`create-package-order-escrow`, `verify-campaign-escrow`,
`verify-package-order-escrow`, `verify-sponsorship-payment`,
`invoice-rush-surcharges`, `get-stripe-dashboard-link`.

## The diagnosis, and the control that produced it

The repo's `_shared/cors.ts` composes `NATIVE_APP_ORIGINS` into its allow-set
and falls back to `DEFAULT_ORIGIN = 'https://dragoncandy.com'`. **Current source
cannot emit `.io` for any origin.** So the defect could only be a stale
deployed bundle — nothing to fix in the repo, only something to ship.

The control sharpened that further rather than merely confirming it. Preflighting
each function **twice**, once from `capacitor://localhost` and once from
`https://dragoncandy.com`, showed the `.com` origin echoed back correctly while
the native one fell to `.io`. So the deployed bundle *did* know `.com` — it was
from the window **after** the domain migration added `.com` to `APP_ORIGINS` but
**before** `DEFAULT_ORIGIN` was flipped and `NATIVE_APP_ORIGINS` existed. Two
separate changes, one bundle stranded between them.

**Without the paired control, "everything answers `.com`" would have been
indistinguishable from "the function ignores `Origin` entirely."** A single-origin
probe cannot tell a per-origin header from a constant.

## The risk that was actually worth pre-flighting: `verify_jwt`

The hazard in redeploying an edge function here is not the code — it is that
`supabase functions deploy` reads `supabase/config.toml` **relative to the
working directory**, and applies the platform default `verify_jwt = true` to any
function the file does not mention. Ten of the 12 are declared `false`; **two —
`invoice-rush-surcharges` and `refund-campaign-escrow` — are absent from the file
entirely.**

An absent entry is the dangerous case, because it is silent. So live posture was
**measured before deploying**, with no credential, by POSTing unauthenticated and
reading *which body came back*: the platform's `UNAUTHORIZED_NO_AUTH_HEADER`
means the gateway rejected the call before our code ran (`verify_jwt = true`);
our own JSON means our code ran and rejected it (`false`). An invented function
name returns 404, which distinguishes "registered and rejecting" from "absent".

Result: the live posture matched `config.toml` on all 12 — including the two
absent ones, which are live `true`, exactly what the default would re-apply. So a
deploy **from this worktree** preserved every posture. That was established, not
assumed, and it is the whole reason the deploy was safe to run.

## One thing that had to be checked because it was not about CORS at all

`create-package-order-escrow` is one of three functions that mint **real
user-facing URLs** from `DEFAULT_ORIGIN` when their env var is unset. Moving that
constant therefore moves more than a header. Checked by **digest, not by value**:
`supabase secrets list` returns each secret's SHA-256, and `APP_URL`,
`DRAGONCANDY_APP_URL` and `PUBLIC_SITE_URL` all hash to
`52bf7482988b5542d44a4e5342d718cb060127ba05729d6d59bf5c006294fffc`, which is the
digest of `https://dragoncandy.com`. All three are set, so the fallback is
unreachable and no minted URL changed.

## What was done

Fast-forwarded to `origin/main` first — it had moved two commits (#532, #535)
since pre-flight, neither touching `supabase/functions/` or `config.toml`, so no
collision. Then 12 individual deploys (one per invocation, so a failure names its
own function), `--use-api` to avoid Docker, run from the worktree root.

Every upload log listed `_shared/origins.ts` and `_shared/cors.ts` among its
assets — which is the evidence the fix actually shipped. A deploy that fails to
bundle silently keeps serving the old version, so "Deployed Functions." alone
proves nothing.

## Verification

Both checks re-run after the deploy:

- **CORS**: all 12 now echo `capacitor://localhost`, with the `.com` control
  still echoing `.com` — so the header still varies by origin and the pass is not
  a constant.
- **`verify_jwt`**: byte-identical to the pre-deploy table. The same two
  functions are still gateway-rejected; the other ten still run their own auth.

Then a **full sweep of all 125 deployed functions**, which is a stronger check
than re-testing only the 12 that were touched — it would also catch a regression
elsewhere, or a function the original count missed. Result: **stale = 0**, ok =
105 (93 + the 12), nocors = 18 unchanged.

The 18 answer no preflight at all. That is deliberately kept as its own bucket:
they are cron and webhook endpoints with no browser caller, and folding "no
header" into "wrong header" would have inflated the defect count and hidden the
real one.

## Left open, deliberately

- **`outstand-proxy` and `social-proxy` answer `Access-Control-Allow-Origin: *`.**
  This is in the **repo source**, not a stale bundle, so it is a code change and
  out of scope for a redeploy. Neither sets `Access-Control-Allow-Credentials`,
  so a cross-origin page still cannot read a response without holding the user's
  JWT — a real deviation from the shared `corsHeaders` helper, not a live hole.
  Needs its own branch.
- **Five of the 12 answer 500 rather than 401 unauthenticated** —
  `release-creator-payout`, `release-sponsorship-payout`, `verify-campaign-escrow`,
  `verify-sponsorship-payment`, `withdraw-pending-balance`. `PROJECT_CONTEXT`
  records this class as two functions; it is five. Pre-existing, and deliberately
  not folded in: mixing a behaviour change into a redeploy makes any failure
  impossible to attribute to one or the other.
- **Four validate the request body before checking auth**, answering an
  unauthenticated caller with e.g. `Missing required field: packageId`. Minor
  information disclosure; same reasoning for leaving it.

## The durable lesson

**A deployed bundle is not the repo, and reading the repo cannot tell you what is
running.** Both halves of this were true at once here: the source was already
correct (so a code review would have found nothing) and the behaviour was still
wrong (so a probe found it immediately). The class of bug is invisible to every
check that reads files.

The corollary is that **the fix has to be verified the same way it was found** —
by probing the deployment. `npm run build` passing, the diff being empty, and the
CLI printing "Deployed Functions." are all compatible with nothing having
changed.
