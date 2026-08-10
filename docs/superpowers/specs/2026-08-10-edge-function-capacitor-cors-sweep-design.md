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
| `capacitor://localhost` | bundle carries the fix |
| `https://dragoncandy.io` | stale — predates **both** the fix and the Phase-2 `DEFAULT_ORIGIN` flip |
| `https://dragoncandy.com` | has Phase 2, lacks the fix |

**This probe is strictly stronger evidence than grepping the stored bundle**, and that is the reason
it is the primary instrument rather than a supplement:

- `corsHeaders()` runs **inside the handler**. A computed, per-bundle `ACAO` is only possible if the
  module graph loaded and our code ran. A `WORKER_ERROR` returns 500 — never a 200 with a correct
  origin echo. So the probe proves *boot* **and** *fix present* in one call.
- The gateway is not answering these itself: we observed genuine per-bundle variance across the fleet
  (some `.io`, some `capacitor`), which is only possible if the function's own code produced the header.
- It needs no API key and no auth.

`get_edge_function` adds no independent fact. Its unique value is *diagnosing* a probe that fails, which
is a per-anomaly need, not a per-function one. It is therefore reserved for the canary and for anomalies.

> Baseline caveat: a full-fleet probe was captured before any deploy. Regressions are judged against that
> real "before", not against expectation.

## 3. Measured state (2026-08-10, all 98 deployed functions probed)

| Bucket | Count |
|---|---|
| Already carries the fix | 23 |
| **Stale** (`ACAO: https://dragoncandy.io`) | **60** |
| Do not use the shared CORS helper | 15 |

The `.com`-fallback-but-no-capacitor bucket is **empty** — the two fixes travel together, so this sweep
also finishes the domain migration inside the deployed fleet at zero marginal cost.

The 60 stale functions split three ways:

**Bucket A — browser-reachable, non-money (18).** The Wednesday gate.
`bulk-download-campaign-content`, `capture-lead`, `confirm-posting-schedule`, `content-posting-plan`,
`content-strategy-recommend`, `donny-apply-pitch`, `donny-campaign-preview`, `extend-review`,
`fire-campaign-social-hook`, `generate-campaign-analysis`, `landing-clips`, `match-creators`,
`reject-content`, `social-caption`, `suggest-package`, `toast-oauth-start`, `verify-email`,
`wiki-merge-pr`

**Bucket B — cron / internal / AIOS, non-money (27).** CORS is irrelevant to these, but they carry the
same stale `_shared` module and the stale `DEFAULT_ORIGIN`.
`aios-playbook-run`, `aios-report-ingest`, `chat-assistant`, `donny-analytics-alerts`,
`donny-cost-rollup`, `donny-creator-match`, `donny-knowledge-sync`, `donny-nudge-frame`,
`donny-oauth-token`, `donny-oauth-userinfo`, `donny-schedule`, `donny-toast-context`,
`dre-award-engine`, `expire-social-hooks`, `fire-dragonshare-social-hook`, `fire-promotion-social-hook`,
`generate-anonymous-brief`, `generate-embedding`, `google-workspace-proxy`, `notify-package-order`,
`resolve-dispute`, `sync-seat-count`, `toast-discount-push`, `validate-upload`, `wiki-commit-pr`,
`wiki-import-doc`, `wiki-save-answer`

**Bucket C — money (15). Excluded.** See §7.

**Scope of this sweep: buckets A + B = 45 functions.**

## 4. What actually ships

Exactly one delta, **byte-identical across all 45**:

- `_shared/cors.ts` — 2 lines composing `NATIVE_APP_ORIGINS` into `ALLOWED`
- `_shared/origins.ts` — the `NATIVE_APP_ORIGINS` const, plus `DEFAULT_ORIGIN` moving `.io` → `.com`

Nothing else rides along. Verified three ways rather than assumed:

1. **Zero own-source drift.** Every commit touching any of the 45 functions' own directories predates
   that function's deploy. The latest such commit is `d5cb594b` (epoch 1786315093); the earliest deploy
   in the stale set is `capture-lead` (epoch 1786314500), and `d5cb594b` does not touch it. The
   2026-08-09 22:45–23:22 UTC batch already contains #415, #416, #414 and #409.
2. **`_shared` is bundled per dependency closure**, not wholesale. The eight new modules from #416
   (`outstand-*`, `social-*`, `mcp-payload`, `strip-account-ids`) only enter functions that import them.
   44 of 45 pull **only** `cors.ts` + `origins.ts` from the changed set.
3. **The one exception is not an exception.** `content-strategy-recommend` also closes over
   `social-signal.ts`, but that module last changed in `d5cb594b` (epoch 1786315093), before that
   function's deploy (epoch 1786317758) — so it is already in the deployed bundle.

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
| T1 | remainder of bucket A | 17 |
| T2 | bucket B, first half | 14 |
| T3 | bucket B, second half | 13 |

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

| Guardrail | Finding |
|---|---|
| `verify_jwt` drift | **Zero risk.** All 58 live-`false` functions have an explicit `[functions.<slug>]` block in `config.toml`; every function *without* a block is already `true`. Nothing can flip. The at-risk list from the brief (`stripe-webhook`, `outstand-webhook`, `zernio-webhook`, `toast-redemption-webhook`, `auto-approve-content`, `reconcile-pending-flushes`, `capture-lead`, `donny-knowledge-sync`, `expire-social-hooks`, `content-performance-capture`) all have blocks. |
| `esm.sh` boot failure | **Non-issue.** Zero `esm.sh/@supabase` imports in the tree. All 33 `esm.sh` uses are `stripe@18.5.0` plus one `jose@5.9.6`, both established safe by #415. |
| Own-source drift | **Zero**, per §4. |

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

**The 15 functions that do not use the shared CORS helper.** No `OPTIONS` handler → 405
(`account-metrics-capture`, `content-performance-capture`, `google-chat-donny`, `outstand-webhook`,
`reconcile-social-posts`, `stripe-webhook`, `toast-redemption-webhook`, `zernio-webhook`); auth-gated
ingest → 401 (`auto-approve-content`, `reconcile-pending-flushes`); 403 (`donny-auto-pilot`); empty
`ACAO` (`toast-oauth-callback`, `toast-token-refresh`). `outstand-proxy` and `social-proxy` return
`ACAO: *` and therefore **already accept** the Capacitor origin by wildcard.

## 8. Acceptance

Per function, after deploy:

1. **Preflight.** `OPTIONS` with `Origin: capacitor://localhost` → **200**, and
   `Access-Control-Allow-Origin: capacitor://localhost` echoed back. This is the load-bearing check: a
   bundle can store successfully and still fail at module load, so "the deploy succeeded" is not evidence.
2. **Boot + auth assertion, differentiated by `verify_jwt`.** The brief's blanket "expect 401 on an
   unauthenticated POST" holds for only half this set:
   - `verify_jwt = true` (**23** of the 45) → unauthenticated POST must return **401**.
   - `verify_jwt = false` (**22** of the 45) → the request reaches the handler and its own guard decides,
     so the assertion is **"not 500"**. A `WORKER_ERROR` is the thing being ruled out.
3. **No config drift.** Re-run `list_edge_functions` after each tranche and assert every `verify_jwt`
   matches the pre-sweep baseline.

`get_edge_function` → grep the spilled `tool-results/*.txt` for `capacitor://localhost` is run for the
**canary and any anomaly only**. When it is run, grep the whole spilled file set rather than `index.ts`
alone — shared modules are bundled in, and grepping only the entrypoint returns 0 for the wrong reason.

**Done means:** the stale bucket drops **60 → 15** (exactly bucket C), the previously-fixed 23 are
unchanged, and no `verify_jwt` moved anywhere in the fleet.

## 9. Rollback

The delta is two files. If the canary regresses, stop — nothing else has moved. If a later tranche
regresses, restore `_shared/cors.ts` and `_shared/origins.ts` at `caa7ca97` and redeploy the affected
slugs individually. Because the change is additive to an allow-list, the realistic failure mode is a
boot failure (caught by the probe as a 500), not a silent behavioural change.

## 10. Report

On completion, report: functions swept (by bucket), functions deliberately skipped and why, any
`verify_jwt` value that changed, and the final stale count.

## See also

- `docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md` — the iOS shell work (#425)
- `docs/wiki/concepts/domain-migration-io-to-com.md` — the `DEFAULT_ORIGIN` half of this delta
- `docs/wiki/concepts/anon-key-is-not-authorization.md` — why `verify_jwt` is not authorization
