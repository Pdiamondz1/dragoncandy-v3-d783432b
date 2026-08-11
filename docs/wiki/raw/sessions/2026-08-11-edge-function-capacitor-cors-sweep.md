# Session: the capacitor CORS sweep — 48 edge functions redeployed

Date: 2026-08-10 → 2026-08-11
Branch: `docs/capacitor-cors-sweep-spec`
Spec: `docs/superpowers/specs/2026-08-10-edge-function-capacitor-cors-sweep-design.md`
Plan: `docs/superpowers/plans/2026-08-10-edge-function-capacitor-cors-sweep.md`

## What shipped

**48 edge functions redeployed to prod.** No application code was written — the deliverable is
production state. The branch carries only the spec, the plan, probe artifacts, and a reusable
probe harness.

- **45** — the CORS sweep proper: 1 canary (`match-creators`) + 24 bucket A + 10 + 10 bucket B.
- **2** — `create-notification`, `send-notification-email`, shipping PR **#442** (email CTA link
  injection), which had been merged and never deployed.
- **1** — `donny-orchestrator`, shipping PR **#444**'s new `/dashboard/creator/overview` route,
  which merged *during* the sweep and was likewise merged-not-deployed.

**Driving deadline:** the founder's first physical-device iOS build (2026-08-12). Bucket A is the
tranche that actually gates it, and it completed first.

## The problem

`supabase/functions/_shared/origins.ts` gained `'capacitor://localhost'` in PR #425. Because
`_shared/*` is bundled into each function **at deploy time**, that merged fix was inert in every
function not redeployed since. The iOS app (Capacitor, origin `capacitor://localhost`) would have
been rejected by ~60 functions.

Final fleet state, from a full 98-function probe:

| bucket | before | after |
|---|---|---|
| echoes `capacitor://localhost` | 23 | **68** |
| stale (`.io` fallback) | 60 | **15** |
| no shared CORS helper | — | 4 |
| refuses `OPTIONS` by design | — | 11 |

The residual 15 stale are **exactly** the 15 deliberately-excluded money functions — proven by set
comparison, not by count. Zero `verify_jwt` drift across all 98. Zero regressions.

**Side effect, intended:** every stale bundle was also minting `.io` URLs. All 45 now emit
`.com`, so the sweep advanced the domain migration for those functions.

## Verification method — the part worth reusing

An **unauthenticated `OPTIONS` preflight** turned out to be both cheaper and stronger than reading
deployed source, and became the sweep's sole boot criterion.

- `corsHeaders()` runs *inside* the handler, so a computed per-bundle `Access-Control-Allow-Origin`
  proves the module graph loaded **and** our code ran. A boot failure returns 5xx, never a 200 with
  a correct echo.
- **Send no `Authorization` and no `apikey`.** The anon key is a valid JWT and ships in the frontend
  bundle, so sending it sails past the gateway and inverts the result on `verify_jwt=true` functions.
- `verify_jwt` does not gate `OPTIONS`, so one probe works for every function regardless.

**The control that matters:** probe with a *hostile* origin too. A function that reflects any origin
passes the capacitor check for entirely the wrong reason — `verify-on-password-reset` does exactly
this. Our canary returned `https://dragoncandy.com` for `https://evil.example.com`, proving real
allow-list matching rather than reflection. Probing an *unswept* function (still `.io`) proved the
probe discriminates rather than reporting success everywhere.

**The 401 is not boot evidence.** An unauthenticated POST to a `verify_jwt=true` function returns
`{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` from the *platform gateway*, before the worker runs. It is
a config-drift assertion only. The differentiated case proves the mechanism: `send-notification-email`
(`verify_jwt=false`) returned its **own** `{"error":"Unauthorized"}` because the worker actually ran.

## Gotchas and defects found

### A gate must be about the same thing as the claim it licenses

The plan predicted "not 5xx" from an unauthenticated POST for the 22 `verify_jwt=false` functions.
That encoded an **unverified assumption about application error handling**. `suggest-package`
throws `"Not authenticated"` into a catch-all that returns 500, so it tripped the tranche's STOP.
The pre-flight gate had validated `verify_jwt` *values* (42/42), not response *codes* — a different
claim entirely. Ruled a plan defect; the function's own source was untouched by the branch and its
`OPTIONS` was a clean 200.

### A sweep must instrument its own coverage

A scan of `.typecheck-ignore` for latent compile errors reported "0 hits". It had actually checked
**zero** functions — the file has mixed CRLF/LF endings, so every entry carried a trailing `\r` and
resolved to a non-existent path, and the loop skipped them all silently. Re-run with explicit
`checked`/`skipped` counters: `checked=32, skipped=0, hits=1`. **A check that examines nothing
reports clean.** The same CRLF trap produced a phantom "all 98 differ" in a `verify_jwt` diff.

### `.typecheck-ignore` is where latent compile errors hide

`donny-oauth-token` declares `function oauthError()` at **module scope** but references
`corsHeaders(req)` inside it — `req` belongs to the `serve()` callback. Every one of its ~15 call
sites throws `ReferenceError`, including the catch block's own error response, so the throw escapes
and the runtime returns a bare `Internal Server Error`. `deno check` names it exactly: **TS2304
"Cannot find name 'req'"**. It survived three months because the function is line 27 of
`supabase/functions/.typecheck-ignore`, which CI skips by design.

**It predates the sweep.** PR #18 (2026-05-06) replaced a plain
`corsHeaders = {"Access-Control-Allow-Origin": "*"}` object with the imported `corsHeaders(req)`
function — that is what created the scope error. The pre-sweep baseline recorded
`donny-oauth-token|200|https://dragoncandy.io`, an origin-*validated* fallback only post-#18 code
can produce, so the deployed bundle already carried it.

### A local tooling limit is not a code defect

Three functions failed `deno check` with `Could not find a matching package for 'npm:...'`. That is
the local `node_modules` being unpopulated for Deno; the Supabase bundler resolves `npm:` specifiers
itself. Only **name-resolution** errors (TS2304/TS2552) correspond to real runtime failures — Deno
strips types, so TS7006 (implicit `any`) and TS18046 (`unknown`) are harmless at runtime.

### A redeploy ships everything merged since that function's last deploy

Not just the change you intended. This is the same mechanism as "merged ≠ deployed", seen from the
other side, and it is why #444 mattered: `donny-orchestrator` had a route merged that morning and
undeployed. Before redeploying a function, know what else has accumulated in its source.

### The probe script could have reported a clean fleet it never reached

The original classified on the origin value alone and ignored the HTTP code, so a curl timeout
(`slug|000|`) landed silently in "other" and the run still exited 0. Hardened to separate three
outcomes: 200 (the origin value is the verdict), 4xx/5xx (answered but refuses `OPTIONS` —
legitimate for webhooks), 000 (unreachable — loud, exit 1). A first attempt over-corrected by
treating every non-200 as failure, which flagged 11 by-design webhook 405s as breakage.

## Carried-forward defects (recorded, not fixed)

1. `create-package-order-escrow` mints `.io` URLs — excluded money function.
2. `verify-on-password-reset` reflects any origin unconditionally. **Bounded:** it sets no
   `Access-Control-Allow-Credentials` and requires an explicit `Authorization` header, so this is
   hygiene, not a credential-leak vector.
3. `suggest-package` answers an auth failure with 500 rather than 401, so monitoring cannot
   distinguish "caller not logged in" from "server broke".
4. `donny-oauth-token`'s `oauthError` must take `req` as a parameter or move inside the `serve()`
   closure. Until then every OAuth error path returns a bare 500.

## Known residual risk for the device test

The spec claimed the excluded functions were ones "no smoke test touches". That was an assumption
about tester behaviour, not a property — **14 of the 15 have `src/` call sites.** Concretely,
`create-campaign-escrow` is fixed while `verify-campaign-escrow` is stale, so on device a campaign
checkout will *start* fine and fail at the verify leg, later and less legibly than if both were
stale. Excluding money functions from the sweep was still the right call; the risk wording was wrong.

**And the premise itself is untested:** whether WKWebView enforces CORS on these calls at all has
never been verified on a device. Wednesday is its first real test.

## Process notes

- Executed subagent-driven, one tranche per dispatch, with a task review after each and an
  independent whole-branch review at the end (verdict: APPROVED).
- The final reviewer verified scope discipline from **prod metadata** rather than our own record:
  exactly 47 functions had `updated_at` in the session window and **zero** were money functions.
  That is the right shape of check — it cannot be satisfied by a correct-looking log.
- One implementer returned BLOCKED correctly and was overruled on the merits (`suggest-package`);
  another's causal inference was wrong and was corrected (`donny-oauth-token`). Subagent output is
  a lead, not a verdict.
