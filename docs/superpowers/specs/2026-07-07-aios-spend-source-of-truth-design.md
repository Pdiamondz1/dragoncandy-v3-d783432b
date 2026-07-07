# AIOS Spend Source-of-Truth — design (2026-07-07)

**Status:** designed (build pending founder go-ahead — involves a prod migration + edge-fn deploys).
**Gap 3 of a 3-gap AIOS agent-loop audit** prompted by the "Agent Loops Clearly Explained" video.
Siblings shipped this session: `make-validator` (PR #217), `/internal/loops` (PR #218).

## The ask & the decisions

Make the AI-cost kill-switch (**PROJECT_CONTEXT §8: AI spend ≤ 15% of revenue, $250/mo floor
pre-revenue**) actually enforce — it's the acknowledged dead control (`donny-cost-rollup` flaps
because `donny_cost_ledger` undercounts and the per-user `usage-tracker` overwrites the platform
stage). Founder decisions this session:

1. **Spend source = the internal ledger** (not provider usage APIs / not manual) — self-contained, zero external keys.
2. **Cap scope = app *runtime* AI spend** (Donny/Dezzy serving calls), NOT the total Anthropic+OpenAI
   invoice. Rationale (audit-driven, below): the invoice is dominated by **founder Claude Code dev
   usage**, which no app table can see and which degrading Donny cannot control. Dev spend stays
   tracked as opex (`operating_expenses`), separately.
3. **Enforcement = alert-only** — file a finding on breach; a human acts. Matches the AIOS invariant
   every prior feature held (agent reports, human acts). Auto-degrade deferred (it's the thing whose
   flapping caused the original bug).

## Audit findings (prod, 2026-07-07)

- `donny_cost_ledger` all-time logged spend ≈ **$4.35** (donny-chat $3.32, aios-playbook-run $0.54,
  donny-campaign-generate $0.36, social-caption+orchestrator pennies). Last row 2026-07-02.
- Only **5** edge functions have ever logged; **0 embedding rows** despite `donny-knowledge-sync`
  calling `logEmbeddingCost`.
- PROJECT_CONTEXT lists AI spend at **~$225/mo** (Anthropic $200 + OpenAI $25) — a ~50× gap. The gap
  is **dev vs runtime**, not just undercounting: runtime serving cost is genuinely tiny pre-revenue;
  the $200 is mostly Claude Code dev usage.

**Root cause of the 0 embedding rows:** `donny_cost_ledger.user_id` is `NOT NULL` with
`FOREIGN KEY → auth.users(id)`. `donny-knowledge-sync` runs as a cron/service context with no real
user, so the embedding-cost insert fails the FK/NOT-NULL and is swallowed by the best-effort catch.

## What already exists (do NOT rebuild)

- **`aios_cost_stats()` RPC** (admin-gated, SECURITY DEFINER) already returns MTD `donny_cost_ledger`
  spend — `mtd_spend_usd`, `mtd_by_function`, `mtd_by_model`, `daily_last_30`, `latest_alert`. This IS
  the runtime source-of-truth number; it just needs the ledger to be complete.
- **`aios_revenue_stats()` RPC** — payments + DragonShare revenue (MTD + all-time).
- **`ai-cost-vs-cap` Founder Playbook** (report-only, 0 runs) already "pulls MTD AI spend + revenue,
  reports the cap, headroom, and an over/under verdict".
- **`playbook-runner-agent`** cloud-routine template already turns a playbook into a scheduled loop
  that files a finding on breach/watch via `aios-report-ingest`.

The compute + report + alert *scaffolding is all present*. The gaps are narrow: the ledger number is
wrong, and nothing schedules the alert.

## Design — three slices

### Slice A — Ledger completeness (the real fix)
- **Migration (non-destructive):** make `donny_cost_ledger.user_id` **nullable** so platform/system AI
  calls (cron embeddings, any user-less runtime call) log with `user_id = NULL`. Keep the FK
  (`NULL` is allowed by an FK). No drop/rename.
- **Sweep runtime AI paths for missing `logCost`/`logEmbeddingCost`.** Confirm each runtime AI caller
  logs: donny-chat, donny-orchestrator, donny-campaign-generate/-preview, donny-creator-match,
  donny-auto-pilot, content-strategy-recommend, content-posting-plan, social-caption, donny-nudge-frame,
  **donny-knowledge-sync (embeddings)**, and **generate-anonymous-brief** (hardcoded Haiku — verify it
  logs). Add logging where missing. Pure token→USD math already in `_shared/cost-ledger.ts`.
- **Verify** on prod after deploy: trigger a knowledge-sync → an embedding row appears
  (`tier='embedding'`, `user_id` null); `aios_cost_stats().mtd_by_model` shows `text-embedding-3-small`.

### Slice B — The alert loop (report-only)
- Refine the **`ai-cost-vs-cap`** playbook (seed migration) to emit a clear **OK / WATCH / BREACH**
  verdict the `playbook-runner-agent` keys on (mirror `kill-switch-watch`: breach→critical finding,
  watch→medium; all-green files nothing). Confirm the cap math: `cap = max($250, 0.15 × MTD_revenue)`;
  `WATCH ≥ 80%` of cap, `BREACH > 100%`. Scope note in the playbook: **runtime** spend only; dev spend
  is opex, out of scope.
- **Founder go-live:** `/schedule` the `playbook-runner-agent` pinned to `slug='ai-cost-vs-cap'`
  (monthly or weekly) → a breach files a finding at `/internal/findings`. No new edge fn.

### Slice C (optional, low-risk) — At-a-glance visibility
- A small **"AI runtime spend MTD vs cap"** card on `/internal` (Overview) reading `aios_cost_stats`
  + `aios_revenue_stats` (both already admin-gated). Pure frontend; honest label ("app runtime AI —
  excludes dev/Claude-Code spend, tracked as opex"). Deferable.

## Invariants & risks
- **Report-only** — Donny never degrades itself; a human acts on the finding. (`donny-cost-rollup`'s
  stage-flipping is left as-is / untouched; we do not revive the flapping auto-degrade.)
- Migration is **additive/nullable** — never drops or rewrites the ledger; existing rows unaffected.
- Runtime-scope is explicit everywhere so no one later compares the ledger against the dev-inclusive
  invoice and "fixes" a phantom 50× breach.
- Deploys are **founder-gated** (Slice A edge-fns + migration). Preserve `verify_jwt` per fn; boot-check.

## Out of scope (deferred)
- Auto-degrade enforcement (flip a platform switch model-routing reads) — the deferred hard version.
- Provider usage APIs / total-invoice tracking — only if the founder later wants dev+runtime in one number.
- Reconciling the ~$200 dev figure into the app (it isn't app data).

## Founder go-live (after build + merge)
1. Apply the nullable-`user_id` migration (prod).
2. Deploy the edge fns that gained cost logging (CLI, `verify_jwt` preserved).
3. Apply the `ai-cost-vs-cap` seed refinement.
4. `/schedule` `playbook-runner-agent` pinned to `ai-cost-vs-cap`.
5. Verify: knowledge-sync produces an embedding ledger row; a forced-low cap files a BREACH finding.
