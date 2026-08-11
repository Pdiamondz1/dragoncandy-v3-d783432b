---
title: Edge-Function Deploy & Bundling
type: concept
created: 2026-08-09
updated: 2026-08-11
sources: [2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md, 2026-08-11-edge-function-capacitor-cors-sweep.md]
tags: [edge-functions, supabase, deploy, deno, bundling, incident]
---
# Edge-Function Deploy & Bundling

How a DragonCandy edge function actually reaches prod, and the failure modes that make a
deploy *look* successful while shipping something broken, stale, or nothing at all.

## The bundle is built at deploy time, per function

A `_shared/*` change takes effect **only in functions that are redeployed after it**. There is
no shared runtime library — each function carries its own copy of everything it imports,
frozen at its deploy. Two functions importing the same `_shared` module can be running
different versions of it indefinitely, and both work.

This is why "merged" is never "deployed" here, and why a 121-file `_shared` change means 82
individual redeploys.

## Incident 2026-08-09: esm.sh `supabase-js` produced an unbootable worker

Supabase's **server-side** bundler stopped being able to build a working worker from
`https://esm.sh/@supabase/supabase-js@*`. Any redeploy of any function carrying that specifier
returned HTTP 500 `{"code":"WORKER_ERROR"}` on **every** request — including `OPTIONS`, which
returns immediately, so the crash is at **boot**, before the handler runs.

Nothing about the code was wrong. `capture-lead` was redeployed unchanged-in-substance and
died, then died again through four progressively simpler rewrites, one of them a single
self-contained file with no imports beyond the two remote ones.

### Isolated by controlled experiment, not by reading

One throwaway function, seven versions, each differing **only** in its imports — and a
no-import **baseline first**, or the probe proves nothing:

| Import | Result |
|---|---|
| *(none)* | boots — proves the probe valid |
| `deno.land/std@0.190.0/http/server.ts` | boots — **innocent** |
| `esm.sh/@supabase/supabase-js@2.50.0` | **WORKER_ERROR** |
| `npm:@supabase/supabase-js@2` / `@2.50.0` / `@2.57.2` | all boot, client constructs |
| `esm.sh/stripe@18.5.0` + `esm.sh/jose@5.9.6` | boots |

**That last row is the load-bearing one.** esm.sh is *not* broken generally — only for
`supabase-js`. The 33 Stripe imports and 1 jose import were therefore left alone. Without that
test the "obvious" fix would have been to migrate every esm.sh import, i.e. unnecessary churn
on the money rail justified by an assumption.

**Fix:** literal prefix replace `https://esm.sh/@supabase/supabase-js@` →
`npm:@supabase/supabase-js@` across 121 files, preserving every pin (79× `@2`, 36× `@2.57.2`,
6× `@2.50.0`). Not a library upgrade. A naive `@2` replace would have flattened the `@2.5x`
pins — the prefix-only form is what makes it safe.

### Diagnostic facts worth keeping

- **The logs API returns request lines only — never the boot stack trace.** Four redeploys
  produced no diagnostic information at all.
- **What found it was comparing a broken function to a WORKING one** (`get_edge_function` on
  both). One call, after four failed guesses. When a deploy breaks and the code looks fine,
  diff against something that still serves.
- **The bundler DOES report syntax errors** with file and line. So a clean bundle that 500s at
  runtime means **module resolution/eval**, not syntax — that distinction eliminates half the
  hypothesis space immediately.
- **Without Docker, both the CLI and the MCP tool use the server-side bundler.** With Docker,
  `supabase functions deploy` bundles **locally** — the path that built every function that
  was still serving throughout the incident. Docker is the durable mitigation.

## Deploy discipline that this incident earned

**Canary one function before any fleet deploy.** `capture-lead` was deployed alone, ahead of
81 others. That single decision is why the blast radius was one landing-page contact form
(`leads` held 0 rows) instead of login, signup, payments and Donny.

**Verify with an unauthenticated `OPTIONS` probe.** ⚠️ **Corrected 2026-08-11 — this section
previously said the opposite, and was wrong.**

It used to read: *"For a `verify_jwt=true` function the gateway rejects an unauthenticated
`OPTIONS` at 401 before the worker boots… sending the public anon key gets past the gateway so
the worker actually starts."* **`verify_jwt` does not gate `OPTIONS`.**

Measured across all 98 functions on 2026-08-10/11: `match-creators`, `create-notification` and
`donny-orchestrator` are all `verify_jwt=true`, and an `OPTIONS` carrying **no `Authorization`
and no `apikey`** returned **200 with a handler-computed `Access-Control-Allow-Origin`** from
each. The same functions' unauthenticated **POST** returned the gateway's
`{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`. So the gateway guards POST and lets the preflight
through to the worker — which is exactly what makes the probe work.

The unauthenticated probe is the **stronger** check, because the origin value is *computed
inside the handler*: a 200 echoing the sent origin proves the module graph loaded and our code
ran. A boot failure returns 5xx, never a 200 with a correct echo.

**Do not send the anon key.** It is a valid JWT and ships in the frontend bundle, so it sails
past the gateway and makes an unauthenticated **POST** look authorized — inverting the auth
assertion you are usually running alongside the CORS one.

**Always include a hostile-origin control.** A function that reflects any origin back passes a
capacitor/`.com` check for entirely the wrong reason — `verify-on-password-reset` does exactly
that. Probe with `Origin: https://evil.example.com` as well and require the *fallback* origin in
reply. A second control on a function you have **not** yet deployed proves the probe
discriminates rather than reporting success everywhere.

**A 401 on POST is not boot evidence.** It is emitted by the platform gateway before the worker
runs, so it asserts config (`verify_jwt` intact), not health. The contrast is the tell: a
`verify_jwt=false` function answers with its *own* body (`{"error":"Unauthorized"}`) because the
worker genuinely ran.

**Deploy money functions last, in their own batch.** `stripe-webhook`, `release-creator-payout`
and the escrow set are where being wrong is most expensive.

**Don't redeploy what doesn't need it.** ~17 functions carried the same repo change but don't
import `cors.ts`, so they had no stake in the domain migration. Their deployed builds still use
esm.sh and work fine; the repo change means a *future* redeploy is safe. Redeploying them would
have been risk without benefit.

## `verify_jwt` drift: config.toml is the source of truth at deploy time

`supabase functions deploy` reads `verify_jwt` from `supabase/config.toml` and **defaults
undeclared functions to `true`**. A function running `verify_jwt=false` on prod but undeclared
in the repo is broken by its own redeploy — silently, since the gateway simply starts rejecting
callers that have no user JWT (webhooks, cron workers, logged-out visitors).

**Audit before any fleet deploy**: compare live `verify_jwt` for every function against the
declarations. On 2026-08-09 that check across all 99 functions returned exactly one hit
(`verify-recaptcha`, which has no source and cannot be deployed) and zero mismatches.
`donny-knowledge-sync` was declared as part of that work — the post-merge RAG sync calls it
with a bearer key, not a user JWT.

## The two directions of repo/prod divergence

Both were live on 2026-08-09, pointing opposite ways:

- **Merged ≠ deployed.** Frontend ships on merge; edge functions do not. See
  [[verify_jwt Is Not Authorization]], where security fixes sat merged-but-undeployed.
- **Deleted from the repo ≠ deleted from prod.** `verify-recaptcha` was deleted from the repo
  in April and kept serving until August — an endpoint with a live secret, no caller
  authorization, and no source anyone could review, invisible to every grep.

## A fleet deploy pins itself to one commit — and `origin/main` moves

On 2026-08-09 a parallel session merged and deployed a `donny-orchestrator` fix at 22:38 UTC.
A fleet redeploy running from `caa7ca97` (which predates it) redeployed the same function at
22:54 UTC and **silently reverted it**. Both deploys succeeded; both passed the boot probe.
Stale code boots perfectly well, so no health check can catch this.

It was caught only by a routine `git log HEAD..origin/main` run for an unrelated reason.

**Re-check `origin/main` immediately before a multi-function deploy, and again after.** A
concurrent merge plus a deploy from a stale tree is a silent revert. Repair by redeploying from
current `main` and verifying by **reading the deployed source for the other change's symbols**
— never by the version number, which increments either way.

## The 2026-08-10/11 capacitor sweep: 48 functions, and what a fleet deploy needs

PR #425 added `capacitor://localhost` to `_shared/origins.ts` so the iOS app could reach the
backend. Bundled at deploy time, it was inert in ~60 functions. The sweep redeployed **48**: 45
for CORS (1 canary + 24 + 10 + 10), 2 shipping #442's email link-injection fix, and
`donny-orchestrator` for #444's new route. Fleet went **23 → 68** accepting the origin, stale
**60 → 15**, and the residual 15 are exactly the deliberately-excluded money functions — proven
by **set comparison, not count**, since equal counts with different membership is a failure that
looks like a pass. Zero `verify_jwt` drift, zero regressions. Every stale bundle was also minting
`.io` URLs, so this advanced [[Domain Migration (.io → .com)]] for 45 functions.

### A gate must be about the same thing as the claim it licenses

The plan asserted "not 5xx" from an unauthenticated POST for the 22 `verify_jwt=false` functions.
That encoded an **unverified assumption about application error handling**, and `suggest-package`
— which throws `"Not authenticated"` into a catch-all returning 500 — tripped the STOP. The
pre-flight gate had validated `verify_jwt` **values** (42/42 correct), not response **codes**.
Passing one says nothing about the other.

### A sweep must instrument its own coverage

A scan of `.typecheck-ignore` for latent compile errors reported "0 hits" while checking **zero**
functions: the file has mixed CRLF/LF endings, so entries carried a trailing `\r`, resolved to
non-existent paths, and were skipped silently. Re-run with counters: `checked=32, skipped=0,
hits=1`. **A check that examines nothing reports clean.** The same trap produced a phantom "all 98
`verify_jwt` differ". On Windows, strip `\r` before believing any line-based comparison, and print
`checked`/`skipped` so a sweep cannot lie about its own reach.

### The ignore list is where latent compile errors hide

`donny-oauth-token` declares `function oauthError()` at **module scope** but calls
`corsHeaders(req)` inside it — `req` belongs to the `serve()` callback. All ~15 call sites throw
`ReferenceError`, including the catch block's own error response, so it escapes uncaught and the
runtime returns a bare `Internal Server Error`. `deno check` names it precisely: **TS2304 "Cannot
find name 'req'"**. It survived three months because the function is line 27 of
`supabase/functions/.typecheck-ignore`.

It **predates** the sweep: #18 (2026-05-06) replaced a plain `corsHeaders = {…"*"}` object with
the imported `corsHeaders(req)` function, and the pre-sweep baseline shows this function returning
an origin-*validated* `.io` fallback — which only post-#18 code produces.

**Only name-resolution errors matter at runtime.** Deno strips types, so TS7006 (implicit `any`)
and TS18046 (`unknown`) are harmless; TS2304/TS2552 are real `ReferenceError`s. And a
`Could not find a matching package for 'npm:…'` from a local `deno check` is an unpopulated
`node_modules`, **not** a defect — the Supabase bundler resolves `npm:` itself.

### A redeploy ships everything merged since *that function's* last deploy

Not only your change. This is "merged ≠ deployed" seen from the other side, and it is why #444
mattered mid-sweep. Before redeploying, know what else has accumulated in that function's source.

## Known Issues

- **Docker is not installed on the founder's machine**, so the local bundler — the more robust
  path — is unavailable and every deploy goes through the server-side bundler.
- **`donny-auto-pilot` is running pre-#416 code** (v47, deployed before that merge). Flagged to
  the owning session rather than deployed here.
- **`donny-oauth-token` returns a bare 500 on every error path** — module-scope `oauthError`
  referencing the request-scoped `req` (TS2304). Live since 2026-05-06. One-line fix: take `req`
  as a parameter, or move the helper inside the `serve()` closure.
- **`suggest-package` answers an auth failure with 500, not 401**, so monitoring cannot separate
  "caller not logged in" from "server broke".
- **`verify-on-password-reset` reflects any origin unconditionally** — it imports no shared
  helper. **Bounded:** it sets no `Access-Control-Allow-Credentials` and requires an explicit
  `Authorization` header, so this is hygiene, not a credential-leak vector. Note it therefore
  *passes* a capacitor probe for the wrong reason.
- **`create-package-order-escrow` still mints `.io` URLs** — an excluded money function, so the
  sweep deliberately left it stale.
- **The excluded money functions are not unreachable from the UI.** 14 of the 15 have `src/` call
  sites, so "no smoke test touches them" is an assumption, not a property. `create-campaign-escrow`
  is fixed while `verify-campaign-escrow` is stale, so a campaign checkout *starts* and fails at
  the verify leg.
- The `esm.sh` failure was never explained by Supabase; it was routed around, not root-caused.
  If it resolves upstream, nothing needs reverting — `npm:` is the better specifier regardless.

## See Also

- [[verify_jwt Is Not Authorization]] — the other merged-but-not-deployed gap
- [[Domain Migration (.io → .com)]] — the migration this incident interrupted
- [[Service-Role Data Exposure]] — orphaned endpoints as attack surface
