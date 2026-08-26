# The two proxies answered every origin with `*`, because copying was easier than sharing

**Date:** 2026-08-26
**Type:** session extract (code change + deploy; PR #539, merged `8bd8b3c0`)

## What was wrong

`outstand-proxy` and `social-proxy` were the only 2 of 125 deployed functions
answering `Access-Control-Allow-Origin: *`. Measured on prod before the change:
both echoed `*` to **every** origin tried, `https://evil.example` included.

**Not a live hole, and the record should say so plainly.** Neither sets
`Access-Control-Allow-Credentials`, so a cross-origin page still could not read a
response without already holding the user's JWT — which lives in localStorage on
our own origin. This was consistency and defence in depth, not an incident. It
was found during the `.io` sweep and deliberately kept out of that deploy,
because it is repo source rather than a stale bundle.

## Why they diverged, which is the durable part

Both need a **wider** `Allow-Headers` than `_shared/cors.ts` provides (`accept`,
`x-org-unit-id`, and outstand's two delegation headers), and `outstand-proxy`
serves five verbs where the shared helper allows POST. So calling `corsHeaders`
would have broken them, and copying the block was the path of least resistance.

**A copied block is where a wildcard survives.** The fix therefore shares the
*origin decision* without forcing the header lists to match: `_shared/cors.ts`
exports `resolveAllowedOrigin(req)`, and `corsHeaders` is refactored onto it with
no behaviour change.

## Why the origin is stamped at the boundary

Both build most responses in module-level `jsonResponse` helpers with no `req` in
scope — **28 and 41 call sites**, most of them outside the request handler. Two
tempting approaches were both worse:

- **Threading `req` through** touches 55+ sites and a dozen signatures. One miss
  ships a response with the wrong origin, and nothing catches it until a browser
  blocks it.
- **Caching the origin in module state is a cross-request bug.** Deno serves
  concurrent requests in one isolate, so request A's origin can be read by
  request B. This is written into the helper's doc comment because it is the
  answer that makes the smallest, most attractive diff.

So: `serve(req => withAllowedOrigin(req, await handleRequest(req)))`. Every
response leaves through it, so it cannot miss a path. The module-level fallback
became `DEFAULT_ORIGIN`, never `*`, so no path can emit a wildcard even if the
stamp were somehow bypassed.

`Vary: Origin` added to both. Once a header varies by origin, its absence lets a
shared cache hand one origin's ACAO to another. Neither had it, because a
constant `*` does not need one. **The platform already sets `Vary:
Accept-Encoding`**, so the helper appends rather than overwrites — verified on
prod afterwards as `Vary: Accept-Encoding, Origin`.

## The guard, and forcing it red

The test walks the real function tree rather than checking the two files just
fixed, so a **new** function copying the same block fails too — a guard that
watches only the pair you already repaired cannot see the third.

Three controls, because a grep-based guard that stops matching passes forever:
it asserts it found 100+ sources (a bad glob would otherwise pass over zero);
that its pattern matches a real declaration in both quote styles; and that it
does **not** match prose about the wildcard, which both proxies now carry in an
explanatory comment. **A guard that matched its own documentation would break the
moment the fix was documented** — the lesson already recorded against the iOS
launch-image generator.

Proven red by planting a wildcard in a throwaway function: the guard failed and
named it. Cleanup ran in a `finally` so the plant could not survive a crash.

## Two Codex findings declined, both on measurement rather than preference

**Vercel preview origins (P2).** `*.vercel.app` is a **shared domain** — any
Vercel user can deploy there, so allow-listing the suffix would make an arbitrary
third party's page an allowed origin. That is strictly worse than the wildcard
being removed, which at least carried no credentials. The premise also does not
hold: previews point at the **staging** Supabase project, `tests/` greps clean
for social/Outstand coverage, and 123 of 125 functions already refuse preview
origins.

**`http://127.0.0.1:8080`, the `npm run dev` origin (P1).** The regression is
real and narrower than it reads. Probed against prod with a `.com` control on
each function:

| function | localhost origin gets |
|---|---|
| `donny-orchestrator` | `https://dragoncandy.com` |
| `create-notification` | `https://dragoncandy.com` |
| `release-creator-payout` | `https://dragoncandy.com` |
| `outstand-proxy` | `*` |
| `social-proxy` | `*` |

A browser at `127.0.0.1:8080` was **already** blocked from Donny, notifications
and the entire money surface. `npm run dev` against prod has never been able to
call them; these two were the last exception, not a working baseline.

Not fixed inline for **blast radius, not preference**: adding localhost to
`ALLOWED` widens CORS on all 125 functions including payouts and escrow, which is
a fleet-wide decision for an owner. Adding it to only these two would rebuild the
per-function divergence the change exists to remove. The measurement lives in the
doc comment so it can be reversed deliberately, in one place.

**The accepted cost, stated rather than buried: developing social features
locally now fails.** The founder chose to ship as-is.

## Verification

Before and after used the identical probe script, so any difference is
attributable.

| probe | before | after |
|---|---|---|
| apex `.com` | `*` | `https://dragoncandy.com` |
| `capacitor://localhost` | `*` | `capacitor://localhost` |
| `http://127.0.0.1:8080` | `*` | `https://dragoncandy.com` (blocked, by decision) |
| `https://evil.example` | `*` | `https://dragoncandy.com` (blocked — the fix) |
| `Vary` | `Accept-Encoding` | `Accept-Encoding, Origin` |
| unauth POST | gateway 401 | gateway 401 (unchanged) |

**The check that mattered most** was that `Allow-Headers` still carries all eight
values including both delegation headers, and `Allow-Methods` still carries all
five verbs — narrowing either was the real way this change could have broken
working features, and neither moved.

Both upload logs listed `_shared/cors.ts` and `_shared/origins.ts` among their
assets, which is the evidence the fix shipped rather than the deploy reusing an
old bundle.

Full fleet sweep afterwards: **ok = 107, stale = 0, nocors = 18, wildcard = 0 —
125 exactly.** The `.io` fix from earlier the same day still holds.

`verify_jwt` checked before deploying: `social-proxy` is declared `true` in
`config.toml`; **`outstand-proxy` has no entry at all**, where the platform
default `true` matches its live posture — and the config file's own comment
already recorded that expectation. Unchanged after.

## The durable lesson

**A shared helper only gets used if it fits.** These two did not copy the block
out of carelessness; they copied it because `corsHeaders` would have broken them,
and nothing offered the origin decision separately from the header list. The fix
was to make the shared thing decomposable, not to demand the callers conform.
Where a helper is nearly-but-not-quite right, expect copies — and expect the
copies to drift in whatever direction is easiest to write.
