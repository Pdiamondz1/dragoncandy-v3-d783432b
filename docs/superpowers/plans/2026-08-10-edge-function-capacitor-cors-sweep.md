# Edge-Function `capacitor://localhost` Fleet Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redeploy 45 Supabase edge functions to prod so every function the iOS Capacitor shell calls accepts `Origin: capacitor://localhost`, before the founder's first physical-device build on Wednesday 2026-08-12.

**Architecture:** No application code is authored. This is an ordered sequence of single-slug `supabase functions deploy` invocations against prod, separated by blocking gates. All 45 ship one byte-identical delta (`_shared/cors.ts` + `_shared/origins.ts`), which is why a canary failure is a fleet failure and why the plan halts rather than continues on any regression. Verification runs off an unauthenticated `OPTIONS` preflight, which is the only check that proves the worker actually booted.

**Tech Stack:** Supabase CLI (`supabase functions deploy`), Supabase MCP (`list_edge_functions`, `get_edge_function`), `curl`, `deno check`, bash.

**Spec:** `docs/superpowers/specs/2026-08-10-edge-function-capacitor-cors-sweep-design.md` (approved, HEAD `99ab7015`)

## Global Constraints

Every task's requirements implicitly include this section.

- **Project ref is `zocahiffooqdybdhguqv`** (prod). Every deploy command carries `--project-ref zocahiffooqdybdhguqv`.
- **NEVER run `supabase functions deploy` without a slug.** A bare invocation is a blind fleet deploy.
- **NEVER deploy any of the 15 bucket-C money functions** (listed in Task 6). They are out of scope: `check-creator-payout-status`, `check-restaurant-payout-status`, `create-package-order-escrow`, `disconnect-stripe-account`, `get-stripe-dashboard-link`, `invoice-rush-surcharges`, `refund-campaign-escrow`, `refund-package-order`, `release-creator-payout`, `release-package-payout`, `release-sponsorship-payout`, `verify-campaign-escrow`, `verify-package-order-escrow`, `verify-sponsorship-payment`, `withdraw-pending-balance`.
- **Probes send NO `Authorization` and NO `apikey` header.** The anon key IS a valid JWT and ships in the frontend bundle; sending it would sail past the gateway and invert the expected result on all 23 `verify_jwt=true` functions.
- **`ACAO` is the abbreviation used throughout for the `Access-Control-Allow-Origin` response header.**
- **Any gate failure HALTS the sweep.** Do not proceed to the next task. Go to Task 7 (rollback) and report.
- **Deploy only from a tree whose `supabase/functions/` matches `origin/main`.** Asserted in Task 1.
- The two carried-forward defects are **not fixed here**: `create-package-order-escrow` minting `.io` URLs, and `verify-on-password-reset` reflecting any origin unconditionally.

---

## File Structure

| File | Responsibility |
|---|---|
| Create: `scripts/ops/capacitor-cors-probe.sh` | The single probe harness. Every verification step in every task calls this, so "what was checked" is identical and auditable across all six checkpoints. Committed rather than kept in `/tmp` because this class of `_shared` sweep recurs — bucket C is deferred, not cancelled. |
| Create: `docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt` | The pre-sweep 98-function probe. Every later assertion diffs against this real "before", not against expectation. |
| Create: `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt` | Pre-sweep `slug verify_jwt` for all 98. The per-tranche config-drift assertion diffs against it. |
| Create: `docs/superpowers/plans/artifacts/2026-08-10-denocheck-baseline.txt` | `deno check` results on `main` before deploying. Only a **delta** against this is signal — the 18 `.typecheck-ignore` functions already fail. |
| Modify: none | No application code changes. `_shared/cors.ts` and `_shared/origins.ts` are already correct on `main` (#425). |

---

## Task 1: Build the probe harness and capture all three baselines

Nothing is deployed in this task. It produces the evidence every later task is judged against.

**Files:**
- Create: `scripts/ops/capacitor-cors-probe.sh`
- Create: `docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt`
- Create: `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`

**Interfaces:**
- Consumes: nothing.
- Produces: `scripts/ops/capacitor-cors-probe.sh`, invoked as `bash scripts/ops/capacitor-cors-probe.sh <outfile> [slug...]`. With no slugs it probes every directory under `supabase/functions/` except `_shared`. Output format is one line per function: `<slug>|<http_code>|<acao>`. Later tasks call it and diff its output.

- [ ] **Step 1: Assert the deploy tree matches `origin/main`**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b"
git fetch origin
echo "local functions tree:  $(git rev-parse HEAD:supabase/functions)"
echo "origin/main functions: $(git rev-parse origin/main:supabase/functions)"
```

Expected: the two hashes are **identical**. The spec branch carries only `docs/` commits on top of `main`, so `supabase/functions/` must be byte-identical to `origin/main`.

**STOP if they differ.** Deploying from a tree that does not match `origin/main` ships unreviewed code. Resolve before continuing.

- [ ] **Step 2: Assert the delta is actually present in the tree**

```bash
grep -n "capacitor://localhost" supabase/functions/_shared/origins.ts
grep -n "NATIVE_APP_ORIGINS" supabase/functions/_shared/cors.ts
```

Expected: `origins.ts` shows `'capacitor://localhost',` inside `NATIVE_APP_ORIGINS`; `cors.ts` shows both the import and the spread into `ALLOWED`.

**STOP if either is missing** — there would be nothing to deploy.

- [ ] **Step 3: Write the probe harness**

```bash
mkdir -p scripts/ops docs/superpowers/plans/artifacts
cat > scripts/ops/capacitor-cors-probe.sh <<'SCRIPT'
#!/usr/bin/env bash
# Probe edge functions for Capacitor-origin CORS acceptance.
#
# corsHeaders() runs INSIDE the handler, so a computed per-bundle
# Access-Control-Allow-Origin proves the module graph loaded AND our code ran.
# A boot failure returns 5xx, never a 200 with a correct origin echo. This is
# therefore the only check in the sweep that proves a worker booted.
#
# Deliberately sends NO auth header: the anon key is a valid JWT and would
# sail past the gateway, inverting the expected result on verify_jwt=true
# functions. verify_jwt does not gate OPTIONS, so this works for all of them.
#
# Usage: bash scripts/ops/capacitor-cors-probe.sh <outfile> [slug...]
#        no slugs => probe every function directory
set -uo pipefail
PROJECT_REF="zocahiffooqdybdhguqv"
BASE="https://${PROJECT_REF}.supabase.co/functions/v1"
OUT="${1:?usage: capacitor-cors-probe.sh <outfile> [slug...]}"; shift

if [ "$#" -gt 0 ]; then
  SLUGS="$*"
else
  SLUGS=$(ls -d supabase/functions/*/ | sed 's|supabase/functions/||;s|/$||' \
          | grep -v '^_shared$' | sort)
fi

: > "$OUT"
for fn in $SLUGS; do
  r=$(curl -s -o /dev/null -w "%{http_code}|%header{Access-Control-Allow-Origin}" \
        -X OPTIONS "$BASE/$fn" \
        -H "Origin: capacitor://localhost" \
        -H "Access-Control-Request-Method: POST" \
        --max-time 20)
  echo "$fn|$r" >> "$OUT"
done

echo "probed $(wc -l < "$OUT") functions -> $OUT"
echo "  fixed  (echoes capacitor): $(awk -F'|' '$3=="capacitor://localhost"' "$OUT" | wc -l)"
echo "  stale  (.io fallback):     $(awk -F'|' '$3=="https://dragoncandy.io"' "$OUT" | wc -l)"
echo "  stale  (.com fallback):    $(awk -F'|' '$3=="https://dragoncandy.com"' "$OUT" | wc -l)"
echo "  other  (no shared helper): $(awk -F'|' '$3!="capacitor://localhost" && $3!="https://dragoncandy.io" && $3!="https://dragoncandy.com"' "$OUT" | wc -l)"
SCRIPT
chmod +x scripts/ops/capacitor-cors-probe.sh
```

- [ ] **Step 4: Run it to capture the pre-sweep baseline — this is the "before" every later step diffs against**

```bash
bash scripts/ops/capacitor-cors-probe.sh docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt
```

Expected, exactly:
```
probed 98 functions -> docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt
  fixed  (echoes capacitor): 23
  stale  (.io fallback):     60
  stale  (.com fallback):    0
  other  (no shared helper): 15
```

Note `fixed` reads **23**, not 22. That is expected: `verify-on-password-reset` reflects any origin unconditionally and so echoes `capacitor://localhost` without carrying the fix. The spec counts it under "no shared helper" (16) because that is what it is; the probe cannot tell the difference, which is precisely the §2 provenance limitation. Do not "correct" this number.

**STOP if `stale (.io fallback)` is not 60.** The sweep set was computed against 60; a different number means the fleet moved since the spec was written and the buckets must be recut.

- [ ] **Step 5: Capture the `verify_jwt` baseline**

Call the Supabase MCP tool `list_edge_functions` with `project_id: zocahiffooqdybdhguqv`, then write one `slug verify_jwt` line per function, sorted, to:

`docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`

Expected: 98 lines. 58 with `false`, 40 with `true`.

Verify the count before continuing:

```bash
wc -l < docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt   # 98
grep -c ' false$' docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt  # 58
```

- [ ] **Step 6: Commit the harness and baselines**

```bash
git add scripts/ops/capacitor-cors-probe.sh docs/superpowers/plans/artifacts/
git commit -m "ops(cors-sweep): probe harness + pre-sweep baselines

98 functions probed before any deploy: 23 echo capacitor, 60 stale on the .io
fallback, 15 do not use the shared helper. The 23 includes
verify-on-password-reset, which reflects any origin rather than carrying the
fix - the probe cannot distinguish those, which is why the spec's provenance
gate exists separately."
```

---

## Task 2: Run the three blocking pre-flight gates

Nothing is deployed in this task either. Every gate here can abort the sweep.

**Files:**
- Create: `docs/superpowers/plans/artifacts/2026-08-10-denocheck-baseline.txt`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a go/no-go decision. If all three gates pass, Task 3 may deploy.

- [ ] **Step 1: GATE 1 — provenance. Prove the fleet was deployed from `main`.**

This is the single empirical test of the assumption the entire byte-identical-delta argument rests on: that the 2026-08-09 fleet pass deployed from `main` rather than from a worktree branch. If it deployed from a branch, every timestamp comparison in the spec is void.

Call the Supabase MCP tool `get_edge_function` with `project_id: zocahiffooqdybdhguqv`, `function_slug: content-strategy-recommend`. It spills to a `tool-results/*.txt` file — **grep that file, never read it into context.**

```bash
# substitute the actual spilled path reported by the tool
SPILL="<path reported by get_edge_function>"
grep -c "aggregateCreatorPerformance" "$SPILL"   # from brief.ts   (#416)
grep -c "social-signal\|socialSignal"  "$SPILL"  # from social-signal.ts (#416)
```

Expected: **both greps return a non-zero count.** Those two files were added by #416 (epoch 1786315093) and `content-strategy-recommend` deployed at epoch 1786317758 — *after* — so a bundle built from `main` must contain them.

**STOP THE ENTIRE SWEEP if either returns 0.** It means the fleet pass was not from `main`, the timestamp argument is void, and each of the 45 needs individual source comparison before it moves. Report this and do not deploy anything.

Why this function and not the canary: a branch cut from `main` differs only in files that branch changed, so the check only discriminates if the closure holds a changed-but-not-delta file. `match-creators`' entire closure is `index.ts` + `cors.ts` + `geo.ts` — `geo.ts` unchanged, the other two *are* the delta. Running this on the canary would pass unconditionally while testing nothing.

- [ ] **Step 2: GATE 2 — capture the `deno check` baseline on `main`**

CI type-checks 27 of the 45 already. The remaining **18** are on `supabase/functions/.typecheck-ignore`, which is an *exclusion* list — its header states "The CI gate checks everything NOT listed." Every name on it is there because `deno check` currently **fails** on it, so only a **delta** against this baseline is signal. Expecting zero errors would produce a false alarm on the first run.

```bash
cd "C:/GIT/dragoncandy-v3-d783432b"
OUT=docs/superpowers/plans/artifacts/2026-08-10-denocheck-baseline.txt
: > $OUT
for fn in bulk-download-campaign-content chat-assistant confirm-posting-schedule \
          content-posting-plan donny-campaign-preview donny-oauth-token donny-schedule \
          dre-award-engine expire-social-hooks extend-review fire-dragonshare-social-hook \
          fire-promotion-social-hook generate-campaign-analysis google-workspace-proxy \
          match-creators reject-content resolve-dispute social-caption; do
  n=$(deno check "supabase/functions/$fn/index.ts" 2>&1 | grep -c "error" || true)
  echo "$fn $n" >> $OUT
done
cat $OUT
```

Expected: 18 lines. Record whatever the numbers are — this is a baseline, not a pass/fail.

- [ ] **Step 3: GATE 2 (cont.) — confirm the delta does not make anything worse**

```bash
deno check supabase/functions/_shared/cors.ts supabase/functions/_shared/origins.ts
```

Expected: **no errors.** These two files are the entire payload; they are small and neither is on the ignore list's rationale.

**STOP if this errors.** The delta itself does not type-check and must not be deployed.

- [ ] **Step 4: GATE 3 — run the `edge-function-reviewer` subagent (CLAUDE.md mandate)**

Dispatch the `edge-function-reviewer` subagent with this prompt:

> Review the pending prod redeploy of 45 Supabase edge functions in `C:/GIT/dragoncandy-v3-d783432b`. No function source changes; the only delta is `supabase/functions/_shared/cors.ts` (composing `NATIVE_APP_ORIGINS` into `ALLOWED`) and `supabase/functions/_shared/origins.ts` (adding `NATIVE_APP_ORIGINS = ['capacitor://localhost']` and moving `DEFAULT_ORIGIN` from `.io` to `.com`). Canary is `match-creators`. Judge against the documented deploy hazards: `verify_jwt` drift, `_shared` bundling including the template-literal backtick break, auth-model mismatch, CORS preflight correctness, and deploy ordering. The spec at `docs/superpowers/specs/2026-08-10-edge-function-capacitor-cors-sweep-design.md` records that `verify_jwt` cannot drift (every live-`false` function has an explicit `config.toml` block) and that `esm.sh` is absent from the `@supabase` closure — verify both rather than accepting them. Return PASS or ISSUES.

Expected: **PASS.**

**STOP on ISSUES.** Resolve every finding before deploying. Treat each finding as a lead to verify, not a verdict to accept — but do not proceed while any is unresolved.

- [ ] **Step 5: Commit the baseline**

```bash
git add docs/superpowers/plans/artifacts/2026-08-10-denocheck-baseline.txt
git commit -m "ops(cors-sweep): deno check baseline for the 18 CI-uncovered functions

.typecheck-ignore is an exclusion list - CI checks everything NOT on it, so 27
of the 45 are already covered and only these 18 need a hand-run. Every name
here already fails deno check, so only a DELTA against this file is signal."
```

---

## Task 3: Deploy the canary (`match-creators`) and take full acceptance

One function. Because the delta is byte-identical across all 45, a canary failure is a fleet failure — this task carries almost all the information in the sweep.

**Files:** none created or modified. Prod state changes.

**Interfaces:**
- Consumes: `scripts/ops/capacitor-cors-probe.sh` and both baselines from Task 1; the three passed gates from Task 2.
- Produces: a proven-good delta. Task 4 may not start until this task's Step 6 passes.

- [ ] **Step 1: Confirm the canary is currently stale (the "before")**

```bash
grep '^match-creators|' docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt
```

Expected: `match-creators|200|https://dragoncandy.io`

This is the failing state the deploy must change. If it already reads `capacitor://localhost`, something deployed out of band — stop and re-baseline.

- [ ] **Step 2: Deploy the canary**

```bash
supabase functions deploy match-creators --project-ref zocahiffooqdybdhguqv
```

Expected: the CLI reports a successful deploy. **Note that this is not evidence of anything.** A bundle can store successfully and still fail at module load. Steps 3–5 are the evidence.

- [ ] **Step 3: ACCEPTANCE 1 — preflight. The only check that proves the worker booted.**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/canary.txt match-creators
cat /tmp/canary.txt
```

Expected: `match-creators|200|capacitor://localhost`

**STOP on anything else.** A 5xx means the worker did not boot. A 200 still showing `https://dragoncandy.io` means the bundle did not pick up the delta. Either way, go to Task 7.

- [ ] **Step 4: ACCEPTANCE 2 — POST assertion. `match-creators` is `verify_jwt=true`, so expect 401.**

```bash
curl -s -w '\n%{http_code}\n' -X POST \
  "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/match-creators" \
  -H "Origin: capacitor://localhost" -H "Content-Type: application/json" -d '{}'
```

Expected: HTTP **401**, body `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}`

That error shape is the **platform gateway**, emitted before the worker runs. It is therefore a config-drift assertion, **not** boot evidence — Step 3 already established boot. Send no `Authorization` and no `apikey` header; the anon key is a valid JWT and would invert this.

**STOP if this returns 200** — `verify_jwt` flipped to `false`, which the spec proved impossible. Something is wrong with the premise.

- [ ] **Step 5: ACCEPTANCE 3 — source grep, canary only**

Call `get_edge_function` for `match-creators`, then grep the spilled file:

```bash
grep -c "capacitor://localhost" "<spilled path>"
```

Expected: non-zero. Grep the whole spilled file set, not just `index.ts` — `cors.ts` is bundled in, and grepping only the entrypoint returns 0 for the wrong reason.

This is a different read from Task 2's provenance gate: different function, different target string. Passing one is not passing the other.

- [ ] **Step 6: ACCEPTANCE 4 — no config drift**

Call `list_edge_functions` for `zocahiffooqdybdhguqv` and compare every `slug verify_jwt` pair to `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`.

Expected: **zero differences across all 98.**

**STOP on any difference.** Report which slug moved and in which direction.

- [ ] **Step 7: Record the canary result**

```bash
git commit --allow-empty -m "ops(cors-sweep): canary match-creators deployed and verified

OPTIONS 200 echoing capacitor://localhost (worker booted and the delta took
effect), POST 401 from the gateway (verify_jwt intact), capacitor://localhost
present in the deployed bundle, and zero verify_jwt drift across all 98.
The delta is byte-identical across all 45, so this result generalises."
```

---

## Task 4: Deploy T1 — the remaining 24 of bucket A

This completes every browser-reachable function and is the part that actually gates Wednesday's device build. **T1 is a safe stopping point:** if anything looks wrong afterwards, the sweep can end here with the iOS goal met.

**Files:** none. Prod state changes.

**Interfaces:**
- Consumes: a passed Task 3.
- Produces: bucket A fully swept. Task 5 is optional relative to the Wednesday deadline; this task is not.

- [ ] **Step 1: Deploy all 24, one slug at a time**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b"
for fn in aios-playbook-run bulk-download-campaign-content capture-lead \
          confirm-posting-schedule content-posting-plan content-strategy-recommend \
          donny-apply-pitch donny-campaign-preview donny-schedule extend-review \
          fire-campaign-social-hook generate-anonymous-brief generate-campaign-analysis \
          google-workspace-proxy landing-clips reject-content social-caption \
          suggest-package toast-oauth-start verify-email wiki-commit-pr \
          wiki-import-doc wiki-merge-pr wiki-save-answer; do
  echo "=== deploying $fn ==="
  supabase functions deploy "$fn" --project-ref zocahiffooqdybdhguqv || echo "DEPLOY FAILED: $fn"
done
```

Every slug is explicit. There is no bare `deploy` here and there must never be.

- [ ] **Step 2: Probe all 24**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/t1.txt \
  aios-playbook-run bulk-download-campaign-content capture-lead \
  confirm-posting-schedule content-posting-plan content-strategy-recommend \
  donny-apply-pitch donny-campaign-preview donny-schedule extend-review \
  fire-campaign-social-hook generate-anonymous-brief generate-campaign-analysis \
  google-workspace-proxy landing-clips reject-content social-caption \
  suggest-package toast-oauth-start verify-email wiki-commit-pr \
  wiki-import-doc wiki-merge-pr wiki-save-answer
awk -F'|' '$3!="capacitor://localhost"{print "  NOT FIXED: "$0}' /tmp/t1.txt
echo "fixed: $(awk -F'|' '$3=="capacitor://localhost"' /tmp/t1.txt | wc -l) / 24"
```

Expected: `fixed: 24 / 24`, and no `NOT FIXED` lines.

**STOP on any `NOT FIXED` line.** Go to Task 7.

- [ ] **Step 3: POST assertion across all 24, using each function's own expected value**

The expected status differs by `verify_jwt`. These are the real values — do not guess them:

```bash
cd "C:/GIT/dragoncandy-v3-d783432b"
# slug:expected  (401 = verify_jwt true; 5xx = must NOT be 5xx)
for pair in \
  aios-playbook-run:not5xx bulk-download-campaign-content:401 capture-lead:not5xx \
  confirm-posting-schedule:401 content-posting-plan:401 content-strategy-recommend:not5xx \
  donny-apply-pitch:401 donny-campaign-preview:not5xx donny-schedule:not5xx \
  extend-review:401 fire-campaign-social-hook:401 generate-anonymous-brief:401 \
  generate-campaign-analysis:401 google-workspace-proxy:not5xx landing-clips:401 \
  reject-content:401 social-caption:401 suggest-package:not5xx toast-oauth-start:401 \
  verify-email:not5xx wiki-commit-pr:not5xx wiki-import-doc:not5xx \
  wiki-merge-pr:not5xx wiki-save-answer:not5xx; do
  fn=${pair%%:*}; exp=${pair##*:}
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/$fn" \
    -H "Origin: capacitor://localhost" -H "Content-Type: application/json" \
    -d '{}' --max-time 20)
  if [ "$exp" = "401" ]; then
    [ "$code" = "401" ] && r=OK || r="*** FAIL (want 401) ***"
  else
    case "$code" in 5*) r="*** FAIL (5xx = did not boot) ***";; *) r=OK;; esac
  fi
  printf "  %-34s %s  %s\n" "$fn" "$code" "$r"
done
```

Expected: every line `OK`.

Note `-d '{}'` rather than an empty body — several of these parse the request body, and the two choices yield different statuses. Note again: no auth header.

**STOP on any FAIL.** A 5xx means that function did not boot.

- [ ] **Step 4: Config-drift assertion**

Call `list_edge_functions` and diff every `slug verify_jwt` against `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`.

Expected: zero differences across all 98.

**STOP on any difference.**

- [ ] **Step 5: Record the T1 result**

```bash
git commit --allow-empty -m "ops(cors-sweep): T1 deployed - all 25 of bucket A now accept the Capacitor origin

Every browser-reachable non-money function is swept, so the Wednesday device
build is unblocked. This is a safe stopping point: bucket B delivers nothing
for the device build specifically."
```

---

## Task 5: Deploy T2 — bucket B, first alphabetical half (10)

Bucket B is cron / webhook / internal. The Capacitor origin is irrelevant to these, but they carry the same stale `_shared` module and the same stale `DEFAULT_ORIGIN`.

**Files:** none. Prod state changes.

**Interfaces:**
- Consumes: a passed Task 4.
- Produces: half of bucket B swept.

- [ ] **Step 1: Deploy all 10, one slug at a time**

```bash
for fn in aios-report-ingest chat-assistant donny-analytics-alerts donny-cost-rollup \
          donny-creator-match donny-knowledge-sync donny-nudge-frame donny-oauth-token \
          donny-oauth-userinfo donny-toast-context; do
  echo "=== deploying $fn ==="
  supabase functions deploy "$fn" --project-ref zocahiffooqdybdhguqv || echo "DEPLOY FAILED: $fn"
done
```

- [ ] **Step 2: Probe all 10**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/t2.txt \
  aios-report-ingest chat-assistant donny-analytics-alerts donny-cost-rollup \
  donny-creator-match donny-knowledge-sync donny-nudge-frame donny-oauth-token \
  donny-oauth-userinfo donny-toast-context
awk -F'|' '$3!="capacitor://localhost"{print "  NOT FIXED: "$0}' /tmp/t2.txt
echo "fixed: $(awk -F'|' '$3=="capacitor://localhost"' /tmp/t2.txt | wc -l) / 10"
```

Expected: `fixed: 10 / 10`, no `NOT FIXED` lines. **STOP otherwise.**

- [ ] **Step 3: POST assertion across all 10**

```bash
for pair in \
  aios-report-ingest:not5xx chat-assistant:not5xx donny-analytics-alerts:not5xx \
  donny-cost-rollup:401 donny-creator-match:not5xx donny-knowledge-sync:not5xx \
  donny-nudge-frame:401 donny-oauth-token:not5xx donny-oauth-userinfo:not5xx \
  donny-toast-context:401; do
  fn=${pair%%:*}; exp=${pair##*:}
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/$fn" \
    -H "Origin: capacitor://localhost" -H "Content-Type: application/json" \
    -d '{}' --max-time 20)
  if [ "$exp" = "401" ]; then
    [ "$code" = "401" ] && r=OK || r="*** FAIL (want 401) ***"
  else
    case "$code" in 5*) r="*** FAIL (5xx = did not boot) ***";; *) r=OK;; esac
  fi
  printf "  %-34s %s  %s\n" "$fn" "$code" "$r"
done
```

Expected: every line `OK`. **STOP on any FAIL.**

- [ ] **Step 4: Config-drift assertion**

Call `list_edge_functions` and diff against `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`. Expected: zero differences. **STOP on any difference.**

- [ ] **Step 5: Record**

```bash
git commit --allow-empty -m "ops(cors-sweep): T2 deployed - bucket B first half (10)"
```

---

## Task 6: Deploy T3 — bucket B, second alphabetical half (10), then final verification

**Files:** none. Prod state changes.

**Interfaces:**
- Consumes: a passed Task 5.
- Produces: the completed sweep and the final report.

- [ ] **Step 1: Deploy all 10, one slug at a time**

```bash
for fn in dre-award-engine expire-social-hooks fire-dragonshare-social-hook \
          fire-promotion-social-hook generate-embedding notify-package-order \
          resolve-dispute sync-seat-count toast-discount-push validate-upload; do
  echo "=== deploying $fn ==="
  supabase functions deploy "$fn" --project-ref zocahiffooqdybdhguqv || echo "DEPLOY FAILED: $fn"
done
```

- [ ] **Step 2: Probe all 10**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/t3.txt \
  dre-award-engine expire-social-hooks fire-dragonshare-social-hook \
  fire-promotion-social-hook generate-embedding notify-package-order \
  resolve-dispute sync-seat-count toast-discount-push validate-upload
awk -F'|' '$3!="capacitor://localhost"{print "  NOT FIXED: "$0}' /tmp/t3.txt
echo "fixed: $(awk -F'|' '$3=="capacitor://localhost"' /tmp/t3.txt | wc -l) / 10"
```

Expected: `fixed: 10 / 10`, no `NOT FIXED` lines. **STOP otherwise.**

- [ ] **Step 3: POST assertion across all 10**

```bash
for pair in \
  dre-award-engine:not5xx expire-social-hooks:not5xx fire-dragonshare-social-hook:401 \
  fire-promotion-social-hook:401 generate-embedding:401 notify-package-order:not5xx \
  resolve-dispute:401 sync-seat-count:401 toast-discount-push:401 validate-upload:401; do
  fn=${pair%%:*}; exp=${pair##*:}
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/$fn" \
    -H "Origin: capacitor://localhost" -H "Content-Type: application/json" \
    -d '{}' --max-time 20)
  if [ "$exp" = "401" ]; then
    [ "$code" = "401" ] && r=OK || r="*** FAIL (want 401) ***"
  else
    case "$code" in 5*) r="*** FAIL (5xx = did not boot) ***";; *) r=OK;; esac
  fi
  printf "  %-34s %s  %s\n" "$fn" "$code" "$r"
done
```

Expected: every line `OK`. **STOP on any FAIL.**

- [ ] **Step 4: FINAL — re-probe the whole fleet and diff against the baseline**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/final.txt
```

Expected, exactly:
```
probed 98 functions -> /tmp/final.txt
  fixed  (echoes capacitor): 68
  stale  (.io fallback):     15
  stale  (.com fallback):    0
  other  (no shared helper): 15
```

23 previously-fixed + 45 swept = 68. Stale drops 60 → **15**, which must be exactly bucket C:

```bash
awk -F'|' '$3=="https://dragoncandy.io"{print $1}' /tmp/final.txt | sort > /tmp/final_stale.txt
cat > /tmp/bucketC.txt <<'EOF'
check-creator-payout-status
check-restaurant-payout-status
create-package-order-escrow
disconnect-stripe-account
get-stripe-dashboard-link
invoice-rush-surcharges
refund-campaign-escrow
refund-package-order
release-creator-payout
release-package-payout
release-sponsorship-payout
verify-campaign-escrow
verify-package-order-escrow
verify-sponsorship-payment
withdraw-pending-balance
EOF
sort -u /tmp/bucketC.txt > /tmp/bc.txt
diff /tmp/final_stale.txt /tmp/bc.txt && echo "  OK: residual stale == bucket C exactly"
```

Expected: `OK: residual stale == bucket C exactly`.

- [ ] **Step 5: FINAL — assert no regression in the previously-fixed set**

```bash
# every function that echoed capacitor BEFORE must still echo it now
awk -F'|' '$3=="capacitor://localhost"{print $1}' \
  docs/superpowers/plans/artifacts/2026-08-10-probe-baseline.txt | sort > /tmp/was_fixed.txt
awk -F'|' '$3=="capacitor://localhost"{print $1}' /tmp/final.txt | sort > /tmp/now_fixed.txt
echo "regressions (were fixed, now are not):"
comm -23 /tmp/was_fixed.txt /tmp/now_fixed.txt | sed 's/^/  *** REGRESSION: /'
echo "  [no lines above = clean]"
```

Expected: no regression lines.

**STOP on any regression.** Go to Task 7.

- [ ] **Step 6: FINAL — config-drift assertion across the whole fleet**

Call `list_edge_functions` and diff every `slug verify_jwt` against `docs/superpowers/plans/artifacts/2026-08-10-verify-jwt-baseline.txt`.

Expected: zero differences across all 98.

- [ ] **Step 7: Commit the final artifact and report**

```bash
cp /tmp/final.txt docs/superpowers/plans/artifacts/2026-08-10-probe-final.txt
git add docs/superpowers/plans/artifacts/2026-08-10-probe-final.txt
git commit -m "ops(cors-sweep): sweep complete - 45 functions, stale 60 -> 15

Residual stale is exactly bucket C (money, deliberately excluded). No
regression in the previously-fixed set and no verify_jwt drift across all 98."
```

Then report, per spec §10:
- functions swept, by bucket (bucket A 25, bucket B 20)
- functions deliberately skipped and why (bucket C: 15 money functions; 16 non-helper functions that never used `_shared/cors.ts`)
- any `verify_jwt` value that changed (expected: none)
- final stale count (expected: 15)
- status of the two carried-forward defects, both still **open**: `create-package-order-escrow` minting `.io` URLs, and `verify-on-password-reset` reflecting any origin unconditionally

---

## Task 7: Rollback (only if a gate failed)

Do not run this task on a successful sweep.

**Files:**
- Modify (temporarily): `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/origins.ts`

- [ ] **Step 1: Identify exactly which slugs need reverting**

Only functions deployed since the sweep began. A function that never deployed is already in its pre-sweep state and must be left alone.

- [ ] **Step 2: Restore the two files to their pre-sweep state**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b"
git checkout caa7ca97 -- supabase/functions/_shared/cors.ts supabase/functions/_shared/origins.ts
grep -n "DEFAULT_ORIGIN" supabase/functions/_shared/origins.ts
```

**Read this before proceeding.** `caa7ca97` is the last commit touching these two files before every deploy in the sweep, so it is by construction the state those 45 functions were running. It sits **before** Phase 2 (#427), so restoring it also reverts `DEFAULT_ORIGIN` from `.com` back to `.io`. That is correct for a rollback — it returns each function to exactly its pre-sweep behaviour rather than to some third state — but it must be a conscious choice, because it re-opens the stale `.io` fallback. Do not reach for a newer anchor hoping to keep the `.com` half; both changes live in these two files and were never separable.

- [ ] **Step 3: Redeploy each affected slug individually**

```bash
for fn in <the slugs identified in Step 1>; do
  supabase functions deploy "$fn" --project-ref zocahiffooqdybdhguqv
done
```

- [ ] **Step 4: Verify the rollback landed**

```bash
bash scripts/ops/capacitor-cors-probe.sh /tmp/rollback.txt <the same slugs>
cat /tmp/rollback.txt
```

Expected: each shows `200|https://dragoncandy.io` — matching the pre-sweep baseline for those slugs.

- [ ] **Step 5: Restore the working tree**

```bash
git checkout HEAD -- supabase/functions/_shared/cors.ts supabase/functions/_shared/origins.ts
git status --short supabase/functions/_shared/
```

Expected: clean. The repo must not be left carrying a reverted `_shared`, or the next deploy from this tree silently ships the rollback.

- [ ] **Step 6: Report the failure**

State which gate failed, what the observed value was versus expected, which slugs were rolled back, and which were never deployed.

---

## Self-Review

**1. Spec coverage.**

| Spec section | Covered by |
|---|---|
| §2 enumeration method (probe, no auth, `ACAO` echo) | Task 1 Step 3 (harness), used in every task |
| §3 measured state / bucket membership | Task 1 Step 4 (baseline must reproduce 23/60/15) |
| §4 byte-identical delta + provenance assumption | Task 2 Step 1 (blocking provenance gate) |
| §5 sequencing (canary, T1 24, T2 10, T3 10) | Tasks 3, 4, 5, 6 |
| §6 gate 1 provenance | Task 2 Step 1 |
| §6 gate 2 `deno check` delta-only on the 18 | Task 2 Steps 2–3 |
| §6 gate 3 `edge-function-reviewer` | Task 2 Step 4 |
| §7 exclusions (bucket C, 16 non-helper) | Global Constraints; Task 6 Steps 4 and 7 |
| §8 acceptance 1 preflight | Tasks 3/4/5/6, probe steps |
| §8 acceptance 2 differentiated POST | Tasks 3/4/5/6, POST steps, per-slug expected values |
| §8 acceptance 3 config drift | Tasks 3/4/5/6, `list_edge_functions` steps |
| §8 canary source grep | Task 3 Step 5 |
| §8 done criteria (60→15, 22 unchanged, no drift) | Task 6 Steps 4–6 |
| §9 rollback incl. `DEFAULT_ORIGIN` consequence | Task 7 Step 2 |
| §10 report | Task 6 Step 7 |

No gaps.

**2. Placeholder scan.** Every command is literal and runnable. Every expected value is a real measured number. Two intentional substitution points exist and are marked inline: the `get_edge_function` spilled-file path (Task 2 Step 1, Task 3 Step 5), which the tool reports at call time and cannot be known in advance, and the affected-slug list in Task 7 (rollback), which depends on how far the sweep got.

**3. Consistency.** Slug counts reconcile: canary 1 + T1 24 = bucket A 25; T2 10 + T3 10 = bucket B 20; 25 + 20 = 45. Baseline `fixed` is 23 while the spec's already-fixed set is 22 — the discrepancy is `verify-on-password-reset` and is called out explicitly in Task 1 Step 4 so nobody "corrects" it. Final `fixed` 68 = 23 + 45. Residual stale 15 = bucket C. The per-slug 401/not-5xx values in Tasks 4/5/6 were generated from the live `verify_jwt` values, and their totals (23 / 22) match the spec.
