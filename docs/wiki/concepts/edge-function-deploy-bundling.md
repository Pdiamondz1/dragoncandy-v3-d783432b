---
title: Edge-Function Deploy & Bundling
type: concept
created: 2026-08-09
updated: 2026-08-09
sources: [2026-08-09-dotcom-phase1-and-esm-sh-bundler-outage.md]
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

**Verify with the anon key, not an unauthenticated probe.** For a `verify_jwt=true` function
the gateway rejects an unauthenticated `OPTIONS` at **401 before the worker boots**, so it
cannot distinguish "healthy" from "never booted". Sending the public anon key (a valid JWT,
already in the frontend bundle) gets past the gateway so the worker actually starts. The
signal being hunted is a 500 with `WORKER_ERROR`.

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

## Known Issues

- **Docker is not installed on the founder's machine**, so the local bundler — the more robust
  path — is unavailable and every deploy goes through the server-side bundler.
- **`donny-auto-pilot` is running pre-#416 code** (v47, deployed before that merge). Flagged to
  the owning session rather than deployed here.
- The `esm.sh` failure was never explained by Supabase; it was routed around, not root-caused.
  If it resolves upstream, nothing needs reverting — `npm:` is the better specifier regardless.

## See Also

- [[verify_jwt Is Not Authorization]] — the other merged-but-not-deployed gap
- [[Domain Migration (.io → .com)]] — the migration this incident interrupted
- [[Service-Role Data Exposure]] — orphaned endpoints as attack surface
