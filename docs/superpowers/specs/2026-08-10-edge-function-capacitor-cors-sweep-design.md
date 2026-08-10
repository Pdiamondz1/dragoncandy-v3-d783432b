# Edge-function `capacitor://localhost` fleet sweep — design

**Date:** 2026-08-10
**Status:** approved, not yet executed
**Goal:** every edge function the iOS Capacitor shell calls accepts `Origin: capacitor://localhost`, so Wednesday's first physical-device build tests the *build* and not the backend.
**Project ref:** `zocahiffooqdybdhguqv` (prod)

---

## 1. Problem

`supabase/functions/_shared/origins.ts` exports `NATIVE_APP_ORIGINS = ['capacitor://localhost']`, and
`_shared/cors.ts` composes it into the `ALLOWED` set. That fix merged as **#425** on 2026-08-10.

`_shared/*` is bundled into each function **at deploy time**, not imported at runtime. A merged fix is
therefore inert until each consuming function is individually redeployed. 82 function files import
`cors.ts` or `origins.ts`.

Without the fix the native app reaches Supabase REST and Auth (which send their own permissive CORS)
but **no custom edge function** — every Donny call, campaign action, and upload path fails at the
preflight.

## 2. Enumeration method — and why it replaces reading the deployed source

`corsHeaders(req)` echoes the request origin **verbatim** when it is allow-listed, and falls back to
`DEFAULT_ORIGIN` otherwise. So an unauthenticated `OPTIONS` request discriminates perfectly:

```bash
curl -s -o /dev/null -w "%{http_code}|%header{Access-Control-Allow-Origin}" \
  -X OPTIONS "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/<slug>" \
  -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: POST"
```

| `Access-Control-Allow-Origin` | Meaning |
|---|---|
| `capacitor://localhost` | bundle carries the fix **— or the function reflects any origin (see below)** |
| `https://dragoncandy.io` | stale — predates **both** the fix and the Phase-2 `DEFAULT_ORIGIN` flip |
| `https://dragoncandy.com` | has Phase 2, lacks the fix |

**Load-bearing premise:** `verify_jwt` does **not** gate `OPTIONS`. Verified directly — `match-creators`
(`verify_jwt = true`) answers an unauthenticated `OPTIONS` with **200** while an unauthenticated `POST`
returns 401. This is what lets one probe cover all 45 regardless of their auth setting.

**The probe is stronger than grep on *effect*, and weaker on *provenance*.** That asymmetry is the whole
reason it is the primary instrument, and the reason it is not the only one:

- **Stronger on effect.** `corsHeaders()` runs **inside the handler**. A computed, per-bundle `ACAO` is
  only possible if the module graph loaded and our code ran — a boot failure returns 5xx, never a 200
  with a correct origin echo. So the probe proves *boot* **and** *effective behaviour* in one call, which
  reading stored bytes cannot do. The gateway is not answering these itself: we observed genuine
  per-bundle variance across the fleet (some `.io`, some `capacitor`), only possible if the function's
  own code produced the header. It needs no API key and no auth.
- **Weaker on provenance.** A function that *reflects* the request origin unconditionally answers
  `capacitor://localhost` whether or not it carries the fix. There is no case where the probe passes on a
  broken function, but there is a case where it passes **for the wrong reason**. Two such classes exist
  in this fleet and both are excluded in §7: the two `ACAO: *` proxies, and `verify-on-password-reset`,
  which sets `"Access-Control-Allow-Origin": origin` with no allow-list at all.

So the probe cannot, by itself, distinguish "carries the fix" from "reflects anything". It does not need
to: every function it is applied to in this sweep is a confirmed `_shared/cors.ts` consumer, established
by import, not by probe result. `get_edge_function` remains the instrument for *provenance* and is
reserved for the canary and for anomalies.

> Baseline caveat: a full-fleet probe was captured before any deploy. Regressions are judged against that
> real "before", not against expectation.

## 3. Measured state (2026-08-10, all 98 deployed functions probed)

| Bucket | Count |
|---|---|
| Already carries the fix | 22 |
| **Stale** (`ACAO: https://dragoncandy.io`) | **60** |
| Do not use the shared CORS helper | 16 |

22 + 60 + 16 = 98, the full deployed fleet.

The `.com`-fallback-but-no-capacitor bucket is **empty** — the two fixes travel together, so this sweep
also finishes the domain migration inside the deployed fleet at zero marginal cost.

**Already carries the fix (22)** — the regression set for §8:
`boost-payment`, `create-billing-portal-session`, `create-campaign-escrow`, `create-checkout-session`,
`create-creator-connect-account`, `create-notification`, `create-restaurant-connect-account`,
`create-sponsorship-checkout`, `donny-campaign-generate`, `donny-chat`, `donny-oauth-authorize`,
`donny-orchestrator`, `dragonshare-notify`, `get-watermarked-preview`, `invite-member`,
`manage-internal-users`, `send-campaign-invitation`, `send-campaign-publish-notifications`,
`send-notification-email`, `send-promotion-notification`, `send-verification-email`, `send-welcome-email`

> `verify-on-password-reset` probes as `capacitor://localhost` but is **not** in this bucket. It imports
> no shared module and reflects the request origin unconditionally (§7). Counting it as "fixed" would be
> the §2 provenance trap in action.

The 60 stale functions split three ways:

**Bucket A — browser-reachable, non-money (18).** The Wednesday gate.
`bulk-download-campaign-content`, `capture-lead`, `confirm-posting-schedule`, `content-posting-plan`,
`content-strategy-recommend`, `donny-apply-pitch`, `donny-campaign-preview`, `extend-review`,
`fire-campaign-social-hook`, `generate-campaign-analysis`, `landing-clips`, `match-creators`,
`reject-content`, `social-caption`, `suggest-package`, `toast-oauth-start`, `verify-email`,
`wiki-merge-pr`

**Bucket B — cron / internal / AIOS, non-money (27).** The **Capacitor** origin is irrelevant to these
— not CORS itself. **Three are genuinely browser-invoked from `/internal`** and depend on the shared
helper today: `google-workspace-proxy` (`src/hooks/internal/useGoogleWorkspace.ts:18`), `wiki-commit-pr`
(`src/hooks/internal/useCorrections.ts:108`), and `donny-schedule`. Whoever triages a preflight failure
in T2/T3 needs to know that. They all carry the same stale `_shared` module and stale `DEFAULT_ORIGIN`.
`aios-playbook-run`, `aios-report-ingest`, `chat-assistant`, `donny-analytics-alerts`,
`donny-cost-rollup`, `donny-creator-match`, `donny-knowledge-sync`, `donny-nudge-frame`,
`donny-oauth-token`, `donny-oauth-userinfo`, `donny-schedule`, `donny-toast-context`,
`dre-award-engine`, `expire-social-hooks`, `fire-dragonshare-social-hook`, `fire-promotion-social-hook`,
`generate-anonymous-brief`, `generate-embedding`, `google-workspace-proxy`, `notify-package-order`,
`resolve-dispute`, `sync-seat-count`, `toast-discount-push`, `validate-upload`, `wiki-commit-pr`,
`wiki-import-doc`, `wiki-save-answer`

**Bucket C — money (15). Excluded.** See §7.

**Scope of this sweep: buckets A + B = 45 functions.**

> **The A/B split is a lower bound, not an exact partition.** It was derived by grepping `src/` for both
> `functions.invoke('<slug>')` and `` `${…}/functions/v1/<slug>` ``. Neither pattern resolves a
> **variable slug** — e.g. `supabase.functions.invoke(config.createFn)` in
> `src/components/settings/StripeConnectSetup.tsx:119` and `` invoke(`${statusFn}${params}`) `` in
> `src/hooks/useTransactionReadiness.ts:35`. Every such call site found resolves to a bucket-C money
> function, so it does not move this sweep's scope — but a future reader must not read bucket B as
> "provably not browser-reachable". The split governs **deploy order only**; both buckets ship.

**Why bucket B is in scope rather than deferred.** It is fair to ask, since bucket B delivers nothing
for the *device build* specifically, and §7 refuses a ride-along on exactly that principle. Three reasons
it is not the same shape: at least three of the 27 **are** browser-invoked from `/internal` today and the
grep that says so is a lower bound, so "deploy only what iOS touches" does not cleanly identify a safe
remainder; the marginal risk is near zero, because bucket B ships the identical two-file delta already
being proven on the canary and 17 bucket-A functions before it; and leaving 27 functions on a stale
shared module guarantees a third sweep. Bucket C is different on all three counts — it is money code,
it ships to a different risk tolerance, and its one live defect wants individual verification. Deploy
order (A before B) preserves the option to stop after T1 if anything looks wrong.

## 4. What actually ships

Exactly one delta, **byte-identical across all 45**:

- `_shared/cors.ts` — 2 lines composing `NATIVE_APP_ORIGINS` into `ALLOWED`
- `_shared/origins.ts` — the `NATIVE_APP_ORIGINS` const, plus `DEFAULT_ORIGIN` moving `.io` → `.com`

Nothing else rides along. The claim is **"for each of the 45, every file in its dependency closure that
changed after *that function's own* deploy timestamp is one of `cors.ts` / `origins.ts`."** Established as
follows — the method matters, because a first attempt that only followed `_shared/` imports missed a
real cross-function dependency and had to be redone:

1. **Enumerate the changed set.** One `git log --since=@<earliest-deploy> --name-only` pass over
   `supabase/functions/` yields **35** non-test `.ts` files changed since the earliest deploy in the
   sweep (`capture-lead`, epoch 1786314500). Of those, 12 are in `_shared`. This enumeration is what
   licenses "nothing else ships"; without it the claim is unfalsifiable.
2. **Compute each function's real closure**, following `../_shared/*.ts`, `./*.ts` **and cross-function
   `../<other-fn>/*.ts`** imports transitively. That third form is not hypothetical:
   `content-strategy-recommend/index.ts:12` imports `../donny-orchestrator/rag.ts` — neither its own
   directory nor `_shared`. It is the only bucket-A/B function that does this, and `rag.ts` last changed
   in `caa7ca97` (epoch 1786314035), before that function's deploy (epoch 1786317758), so it is already
   bundled.
3. **Intersect closure × changed set, per function, against that function's own deploy epoch.** Only two
   `_shared` files changed after *every* deploy in the sweep: `cors.ts` (1786345100) and `origins.ts`
   (1786369434). The #416 group (`outstand-*`, `social-draft`, `social-signal`, `mcp-payload`,
   `strip-account-ids`, epoch 1786315093) predates all 45 deploys except `capture-lead`'s — and
   `capture-lead` imports only `cors.ts` and `htmlEscape.ts`, neither of which is in that group. The two
   remaining post-deploy modules reach nothing in scope: `social-analytics.ts` (1786335860) is imported
   by no function in the sweep, and `test-mode-connect.ts` (1786352575) only by
   `create-creator-connect-account` / `create-restaurant-connect-account`, both already-fixed money
   functions outside it.

This is a mechanical sweep, not 45 code changes. It also means **a canary failure is a fleet failure**,
which is what makes the tranche plan in §5 cheap.

## 5. Sequencing

**Canary: `match-creators`.** It is the proven-stale reference case, browser-reachable, non-money, and
`verify_jwt = true` with **no** `config.toml` block — so it empirically confirms the
no-block-stays-`true` finding on the function where being wrong is cheapest.

Then tranches, bucket A before bucket B, with a probe sweep after each:

| Step | Contents | n |
|---|---|---|
| Canary | `match-creators` | 1 |
| T1 | remainder of bucket A, alphabetical | 17 |
| T2 | bucket B, alphabetical, `aios-playbook-run` … `expire-social-hooks` | 14 |
| T3 | bucket B, alphabetical, `fire-dragonshare-social-hook` … `wiki-save-answer` | 13 |

Both bucket-B halves are the §3 list in alphabetical order; the split point is stated above so two
implementers cannot disagree about it.

Deploy command, one slug at a time — **never a bare `supabase functions deploy`**, which is a blind
fleet deploy:

```bash
supabase functions deploy <slug> --project-ref zocahiffooqdybdhguqv
```

**Alternatives considered.** One-at-a-time verification costs 45 rounds and adds no safety over
tranches, because the delta is identical. A single 44-function batch is fastest but lets a systemic
failure hit everything before anyone looks. Tranches keep four checkpoints, which is enough to catch
the only residual risk — a per-function surprise where a function's own source fails to compile under
the new closure.

## 6. Guardrails

Three of the brief's guardrails were verified **already satisfied** and are retired for this sweep:

| Guardrail | Finding | Instrument |
|---|---|---|
| `verify_jwt` drift | **Zero risk.** All 58 live-`false` functions have an explicit `[functions.<slug>]` block; every function *without* a block is already `true`. Nothing can flip. The brief's at-risk list (`stripe-webhook`, `outstand-webhook`, `zernio-webhook`, `toast-redemption-webhook`, `auto-approve-content`, `reconcile-pending-flushes`, `capture-lead`, `donny-knowledge-sync`, `expire-social-hooks`, `content-performance-capture`) all have blocks. | `comm` diff of the 58 `verify_jwt = false` slugs from `list_edge_functions` against the 59 `^\[functions\.` blocks in `supabase/config.toml`; the difference set is empty |
| `esm.sh` boot failure | **Non-issue.** Zero `esm.sh/@supabase` imports. All 33 `esm.sh` uses are `stripe@18.5.0` plus one `jose@5.9.6`, both established safe by #415. | `grep -rl 'esm\.sh/@supabase' supabase/functions/` → 0 files; package histogram over `esm.sh/…` matches |
| Own-source drift | **Zero**, per §4. | closure × changed-set intersection, per §4 |
| Deploy-from-stale-tree | **Not applicable.** Local `main` is identical to `origin/main`. | `git rev-parse HEAD` == `git rev-parse origin/main` after `git fetch`; `git rev-list --count` both directions = 0 |

> **`verify_jwt` is retired as a *per-function preflight*, and retained as a *per-tranche assertion*
> (§8.3).** This is not a contradiction: there is no need to inspect `config.toml` before each deploy,
> because the diff above proves no slug can flip — but the post-deploy assertion is what would *catch*
> that proof being wrong.

Two remain live and are pre-flight gates:

- **`deno check` by hand** against a `main` baseline on the changed `_shared` files and the canary. CI
  type-checks none of these — both importers are on `.typecheck-ignore`.
- **`edge-function-reviewer` subagent** before the first deploy (CLAUDE.md mandate).

Local `main` is confirmed identical to `origin/main`, so the tree is clean to deploy from.

## 7. Deliberate exclusions

**Bucket C — 15 money functions.** `check-creator-payout-status`, `check-restaurant-payout-status`,
`create-package-order-escrow`, `disconnect-stripe-account`, `get-stripe-dashboard-link`,
`invoice-rush-surcharges`, `refund-campaign-escrow`, `refund-package-order`, `release-creator-payout`,
`release-package-payout`, `release-sponsorship-payout`, `verify-campaign-escrow`,
`verify-package-order-escrow`, `verify-sponsorship-payment`, `withdraw-pending-balance`.

The payment paths a TestFlight tester could actually reach are **already fixed** — `boost-payment`,
`create-checkout-session`, `create-billing-portal-session`, `create-campaign-escrow`,
`create-sponsorship-checkout`, and both `create-*-connect-account`. What remains stale is the
payout/refund/verify side, which no smoke test touches.

> **Open defect carried forward.** `create-package-order-escrow` mints real user-facing URLs from
> `DEFAULT_ORIGIN` when `PUBLIC_SITE_URL` is unset, so it is currently emitting `.io` links. This is a
> live defect. It is *not* iOS-blocking and must not be smuggled into a 45-function sweep — it wants its
> own deliberate single deploy with its own verification. Filed here so it is not lost.

**The 16 functions that do not use the shared CORS helper.** No `OPTIONS` handler → 405
(`account-metrics-capture`, `content-performance-capture`, `google-chat-donny`, `outstand-webhook`,
`reconcile-social-posts`, `stripe-webhook`, `toast-redemption-webhook`, `zernio-webhook`); auth-gated
ingest → 401 (`auto-approve-content`, `reconcile-pending-flushes`); 403 (`donny-auto-pilot`); empty
`ACAO` (`toast-oauth-callback`, `toast-token-refresh`). `outstand-proxy` and `social-proxy` return
`ACAO: *` and therefore **already accept** the Capacitor origin by wildcard. The 16th is
`verify-on-password-reset` — see below.

> **Second open defect carried forward.** `verify-on-password-reset` imports no shared module and
> defines its own helper returning `"Access-Control-Allow-Origin": origin` — the raw request origin,
> with **no allow-list** (`supabase/functions/verify-on-password-reset/index.ts:3-10`). It therefore
> reflects *any* origin, which is why it probes as `capacitor://localhost` despite never having received
> the fix. Consequence for this sweep is benign — it already accepts the native origin — but an
> unconditional origin reflector on a password-reset endpoint is worth a deliberate look. Out of scope
> to fix here; in scope to record, because this sweep is the thing that looked at it.

## 8. Acceptance

Per function, after deploy:

1. **Preflight — the load-bearing check, and the only one that proves boot.** `OPTIONS` with
   `Origin: capacitor://localhost` → **200** with `Access-Control-Allow-Origin: capacitor://localhost`
   echoed back. Use the exact command in §2. A bundle can store successfully and still fail at module
   load, so "the deploy succeeded" is not evidence. **This step catches a non-booting function
   regardless of which 5xx code the platform emits**, which is why the rest of §8 does not need to
   enumerate them.

2. **POST assertion, differentiated by `verify_jwt`.** The brief's blanket "a 401 proves the worker
   booted AND auth still applies" is **wrong on the first half**, and the difference matters:

   ```bash
   # NOTE: deliberately NO apikey and NO Authorization header.
   # The anon key IS a valid JWT and ships in the frontend bundle — sending it would
   # sail past the gateway and invert the expected result on all 23 verify_jwt=true functions.
   curl -s -w '\n%{http_code}\n' -X POST \
     "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/<slug>" \
     -H "Origin: capacitor://localhost" -H "Content-Type: application/json" -d '{}'
   ```

   - **`verify_jwt = true` (23 of the 45)** → **401**, body
     `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`. Verified on
     `match-creators` and `landing-clips`: that error shape is the **platform gateway**, emitted
     *before the worker runs*. It is therefore **not boot evidence** — step 1 already established boot
     for these. Treat it purely as a *config-drift* assertion, redundant with §8.3 and cheap to keep.
   - **`verify_jwt = false` (22 of the 45)** → the request reaches the handler and its own guard decides
     the status, so the assertion is **"not 5xx"**. Broader than "not 500" on purpose: Supabase surfaces
     boot and resource failures as 503 and 546 as well as `WORKER_ERROR`/500.

   Send `-d '{}'` rather than an empty body — several functions in the sweep parse the request body, and
   the two choices yield different statuses.

3. **No config drift.** Re-run `list_edge_functions` after each tranche and assert every `verify_jwt`
   matches the pre-sweep baseline.

`get_edge_function` → grep the spilled `tool-results/*.txt` for `capacitor://localhost` is run for the
**canary and any anomaly only**. When it is run, grep the whole spilled file set rather than `index.ts`
alone — shared modules are bundled in, and grepping only the entrypoint returns 0 for the wrong reason.

**Done means:** the stale bucket drops **60 → 15** (exactly bucket C), the **22 enumerated in §3** still
probe as `capacitor://localhost`, and no `verify_jwt` moved anywhere in the fleet. All three are checked
by re-running the full 98-function probe and diffing against the pre-sweep baseline.

## 9. Rollback

The delta is two files. If the canary regresses, stop — nothing else has moved. If a later tranche
regresses, restore `_shared/cors.ts` and `_shared/origins.ts` at **`caa7ca97`** and redeploy the affected
slugs individually.

**Why that anchor, and what it does to `DEFAULT_ORIGIN`.** `caa7ca97` (#415, the `esm.sh` → `npm:` sweep,
epoch 1786314035) is the last commit touching these two files *before* every deploy in the sweep — so it
is by construction the state those 45 functions are running right now. It sits **before** Phase 2 (#427),
which means restoring it also reverts `DEFAULT_ORIGIN` from `.com` back to `.io`. That is correct for a
rollback — it returns the function to exactly its pre-sweep behaviour, not to some third state — but it
must be a conscious choice, because it re-opens the stale-`.io` fallback this sweep was also closing. Do
not reach for a newer anchor hoping to keep the `.com` half; the two changes are in the same two files
and were never separable.

Because the change is additive to an allow-list, the realistic failure mode is a boot failure — caught by
§8 step 1 as a non-200 preflight, whatever the 5xx code — not a silent behavioural change.

## 10. Report

On completion, report: functions swept (by bucket), functions deliberately skipped and why, any
`verify_jwt` value that changed, the final stale count, and the status of the two defects this design
carries forward without fixing — `create-package-order-escrow`'s stale `.io` URL minting (§7) and
`verify-on-password-reset`'s unconditional origin reflection (§7).

## See also

- `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md` — the iOS shell work (#425)
- `docs/wiki/concepts/domain-migration-io-to-com.md` — the `DEFAULT_ORIGIN` half of this delta
- `docs/wiki/concepts/anon-key-is-not-authorization.md` — why `verify_jwt` is not authorization
