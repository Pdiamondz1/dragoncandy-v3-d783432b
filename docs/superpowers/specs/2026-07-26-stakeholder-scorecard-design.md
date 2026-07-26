# Plain-Language Stakeholder Scorecard (`/internal/scorecard`)

**Date:** 2026-07-26
**Branch:** `feat/internal-stakeholder-scorecard` (fresh off `origin/main`)
**Status:** Design — approved, pending spec review
**Author:** Claude (brainstormed with Dame)

## Context

**Sub-project 4 of 4** in a founder ask to make the `/internal` (AIOS) dashboard show the
true weight/cost of the app and how it scales. Sub-projects 1 (synthetic metric parity —
shipped, PR #346), 2 (live infra telemetry + scaling headroom), and 3 (cost model + DAU
forecast) are separate; **2 and 3 are not built yet**, so this v1 tells its story from data
that exists today and is designed to enrich as they land.

**The need (founder's words):** the existing metrics are technical — "all of them don't know
what any of the metrics mean, only I truly do." The team (co-founders Joe & Juwan, board
members, advisors) needs to **grasp how the app is performing and speak to it confidently** to
investors. So this is a **plain-language translation layer** over the raw metrics. The audience
is the internal team + board (some have AIOS stakeholder-invite accounts); investors are the
downstream audience *they* speak to.

**Stage reality that shapes the story:** DragonCandy is **pre-revenue by design** (~40 real
users, $0 paying, ~$390/mo burn, Stripe test mode). A naive "how are we doing" could read as
failure; the honest, investor-grade narrative for this stage is **traction + capital efficiency
+ scale readiness + honest revenue framing**, not revenue.

## Goal

A new internal page **`/internal/scorecard`** — "How DragonCandy is doing" — that presents four
plain-language "stories," each with a headline number, a one-line *what it means / why it
matters*, and an auto status signal; under a **founder-set narrative headline**. Plus an
**"Export snapshot"** button producing a shareable, print-optimized one-pager.

## Non-goals (YAGNI)

- **No LLM-generated phrasing.** All wording is deterministic/templated from the numbers — a
  stakeholder-facing figure must be exact, reproducible, and free (no `donny_cost_ledger` hit,
  no hallucination risk).
- **Minimal new backend.** Stories compose existing real-only sources; the only additions are the
  founder-headline KV row and **one small internal-gated `aios_stakeholder_burn()` RPC** that
  returns the *aggregate* net-burn number (see §2 Issue-A resolution) — deliberately no
  per-line-item or per-model cost exposure.
- **No auto-computed overall "health score."** Pre-revenue makes the §3 kill-switch guardrails
  N/A; an algorithm must not flash a scary verdict before a board meeting. The headline is
  founder-set; only per-story signals are auto (with gentle, stage-appropriate rules).
- **No Google-Doc export in v1.** The AIOS Google-Doc rails (`ExportToDocButton`) depend on
  Workspace go-live (still founder-gated). The v1 export is a print-optimized snapshot — works
  today, no login. (Google-Doc export can be a later option.)
- **Not sub-projects 2/3.** No live RAM/CPU/latency telemetry, no DAU forecast here — but the
  model leaves seams for both.
- **Real-only, always.** Never show synthetic-inclusive numbers on this surface.

## Design

### 1. Surfaces

- **Page** `/internal/scorecard`, in the AIOS shell **Monitor** nav group, dark ops-deck theme
  like the other `/internal` pages. Live; stakeholder-invite accounts can view it.
- **Export snapshot** (admin-only button) → renders a **print-optimized, self-contained,
  light-theme** one-pager (`ScorecardSnapshot`) and calls `window.print()` so the founder saves
  a PDF / screenshot to hand to investors. No backend, no login, portable.

### 2. Data — reuse existing real-only sources (no new metrics backend)

| Story | Sources (all existing) |
|---|---|
| Traction & growth | `aios_platform_stats` (real counts) + `platform_weight` daily snapshots for the ~30-day trend (`users_total_real` over time) |
| Capital efficiency | **Admins:** `useOperatingExpenses` (opex) + `aios_cost_stats` (MTD AI spend) − `aios_revenue_stats` (MTD fee) = net burn (the Expenses page's exact math). **Stakeholders (non-admin):** the new `aios_stakeholder_burn()` RPC returning the same aggregate figure — see Issue-A resolution below. |
| Scale headroom | `usePlatformWeight` latest `db_bytes` (physical) + `DISK_LIMIT_BYTES`/`COMPUTE_TIERS` from `weightThresholds` |
| Revenue readiness | static framing + `aios_revenue_stats` MTD + the §8 take-rate ladder (static facts) |

**Issue-A resolution — stakeholder burn visibility.** `operating_expenses` and `aios_cost_stats`
are **admin-only** (verified: `operating_expenses_admin_all` RLS; `useCostStats` is `enabled: isAdmin`
and its RPC raises for non-admins), but the page's audience includes non-admin stakeholder-invite
accounts, and burn is the strongest efficiency story. So add a small **`aios_stakeholder_burn()`**
SECURITY-DEFINER RPC (STABLE, `search_path=public`, `auth.uid()` + `is_internal_user()` guard,
`REVOKE` anon/public + `GRANT authenticated`) returning the **aggregate** `{ monthly_opex_cents,
mtd_ai_spend_usd, mtd_revenue_cents, net_burn_cents }` — the same math the Expenses page does, but as
a single aggregate with **no line items and no per-model breakdown**. `useScorecardBurn` calls it for
everyone; the story renders identically for admin and stakeholder. Internal stakeholders (co-founders,
board) are exactly who *should* see aggregate runway. The `burnCeiling` KV stays as the signal
threshold.

**Founder headline storage:** `aios_dashboard_settings` is a **key/value** table with an
existing `aios_dashboard_settings_admin_update` RLS policy (`has_role('admin')`) and
internal-`SELECT`. So the headline is a **`scorecard_headline` KV row** — a small migration
**seeds** the row (the admin-UPDATE policy only permits UPDATE, so the row must pre-exist), and
the frontend reads it (a `useScorecardSettings` hook mirroring `useCurrentTierIndex`) and writes
it with a direct `.update()` (allowed by the existing policy). **No new RPC, no new table** — one
additive seed migration, founder-gated apply.

### 3. Translation layer — `src/lib/internal/scorecardModel.ts` (pure)

`buildScorecard(inputs): ScorecardStory[]` where each story is
`{ key, title, headline, meaning, signal: 'green' | 'amber' | 'info', detail? }`. Deterministic
templating from the numbers. The four stories:

- **Traction** — headline `"{realUsers} real people are building on DragonCandy"` + detail
  `"+{delta30d} in the last 30 days"` when the `platform_weight` history supports it (omit if no
  history). meaning: real creators + businesses using the marketplace end to end (not test
  data). **signal:** `green` if `delta30d >= 0` (flat/pre-launch is not failure), `amber` only if
  real users declined.
- **Capital efficiency** — headline `"We run the whole platform for ~${monthlyBurn}/month"`.
  meaning: total operating cost (infra + AI + tools) minus revenue; lean by design. **signal:**
  `green` if `netBurn <= burnCeiling` **and** AI spend is under the 15% cap (`aiCapStatus`),
  else `amber`. `burnCeiling` is a KV setting (`scorecard_burn_ceiling`, default from the ~$400
  plan) so it's tunable without a deploy.
- **Scale headroom** — headline `"Room to grow ~{multiple}× before infrastructure costs rise"`,
  `multiple = clampFriendly(DISK_LIMIT_BYTES / latest.db_bytes)` (78 MB vs 8 GB → ~100×), derived
  honestly from the snapshot — never a hardcoded "100×". meaning: current usage is a tiny
  fraction of the current plan. **signal:** `green` if `db_bytes < 70% of cap`, else `amber`
  (the existing `weightThresholds` ratio). **Note (Issue-B):** `db_bytes` is *physical*
  (synthetic-inclusive — there is no `db_bytes_real`), which is the **correct** basis for the
  infra "when do we hit the next tier" question. Because ~4,000 synthetic profiles + content
  currently sit on disk, this figure is **conservative** (real-only usage is far smaller, so real
  headroom is even larger). This card is labeled **infrastructure capacity**, and the "real users
  only" stamp (§4) does NOT cover it — see the framing fix there.
- **Revenue readiness** — headline `"Pre-revenue by design — the money switch is built, not
  flipped"`. meaning: payment rails (Stripe Connect, the Free 10%→…→2% take-rate ladder,
  DragonShare 80/20) are live in test mode; turning on paid campaigns is a switch, not a build.
  **signal:** `info` always (framing, not a verdict).

A pure `growthLast30Days(snapshots)` helper derives the traction delta from `platform_weight`'s
`users_total_real`. **Two required correctnesses:** (1) `users_total_real` is NULL on pre-2026-07-23
snapshots (only ~days of real history exist), so the helper must **skip NULL snapshots**, never coerce
them to 0 — else a NULL→real transition renders a false traction spike; return "no delta" (omit the
detail) when <2 non-NULL snapshots span the window. (2) `usePlatformWeight`'s `PlatformWeightRow`
interface currently types only `row_counts_real?` — the implementer must add
`users_total_real?: number | null` to it (and `WeightSnapshot`) since the select already fetches it.

### 4. Honesty guardrails (non-negotiable on this surface)

- **User/traction & revenue metrics are real-only, synthetic-excluded** (reuse the
  `is_synthetic`-excluding RPCs — the point of the sub-project-1 real-vs-total work; a stakeholder
  must never see bot-inflated *user* counts). The **scale-headroom** card is the one intentional
  exception: it reports **physical infrastructure capacity** (synthetic-inclusive `db_bytes`),
  which is the right basis for a tier-scaling question and is conservative (Issue-B). It is
  labeled as such so it can't be read as a real-user figure.
- **Deterministic phrasing** (no LLM) → exact, reproducible.
- Stamp: **"as of {date} · real users only"** on the user/traction/revenue cards; the headroom
  card carries its own **"physical usage incl. test data"** note instead.
- Founder controls the headline message; signals stay data-driven.

### 5. Page structure (`InternalScorecard.tsx`)

```
PageHeader "How DragonCandy is doing"        [ Export snapshot ⬇ ] (admin)
Founder headline (editable inline for admin; read-only for stakeholder viewers)
"as of {date} · real users only"

<ScorecardStoryCard> × 4   (Traction · Efficiency · Headroom · Revenue readiness)
  each: signal dot · title · big plain headline number · what-it-means line · optional detail
  each: a muted "details on Overview / Weight / Expenses" link for the technical founder
```

Loading/error: the page composes several hooks; each story card degrades independently (a
failing source shows a "—" for that story, never blanks the page). Reuses the internal
primitives (`PageContainer`, `PageHeader`, `AppCard`-style card in the dark ops-deck styling).

### 6. Export (`ScorecardSnapshot.tsx`)

A light-theme, print-CSS, self-contained rendering of the same `buildScorecard` output +
headline + date stamp. The button renders it (modal or dedicated print view) and calls
`window.print()`. Aggregate figures only (no PII), so it is safe for the founder to share.

## Files

| File | Change |
|---|---|
| `supabase/migrations/<ts>_scorecard_settings.sql` | **New** — seed `scorecard_headline` + `scorecard_burn_ceiling` KV rows **and** create the `aios_stakeholder_burn()` SECURITY-DEFINER RPC (internal-gated; aggregate only) (founder-gated apply) |
| `src/hooks/internal/useScorecardSettings.ts` | **New** — read headline/ceiling; admin mutation via `.update()` |
| `src/hooks/internal/useScorecardBurn.ts` | **New** — calls `aios_stakeholder_burn()` (works for admin + stakeholder) |
| `src/lib/internal/scorecardModel.ts` (+ `.test.ts`) | **New** — `buildScorecard` + `growthLast30Days` + signal rules (pure) |
| `src/components/internal/ScorecardStoryCard.tsx` | **New** — one story card |
| `src/components/internal/ScorecardSnapshot.tsx` | **New** — print-optimized one-pager |
| `src/pages/internal/InternalScorecard.tsx` (+ component test) | **New** — the page |
| internal shell nav config + `App.tsx` route | Add the `/internal/scorecard` route + Monitor-group nav item |

Reused (unchanged): `usePlatformStats`, `usePlatformWeight`, `useCostStats`, `useRevenueStats`,
`useOperatingExpenses`, `aiCapStatus`, `weightThresholds`.

## Testing

- **Unit** (`scorecardModel.test.ts`): the four stories' headlines/meanings from a fixture;
  every signal rule (traction flat=green / declining=amber; efficiency within/over ceiling +
  cap; headroom </≥ 70%; revenue always info); `growthLast30Days` (delta; **NULL snapshots skipped,
  not zero-coerced — no false spike on a NULL→real transition**; <2 non-NULL in window → omit);
  `multiple` derivation (78 MB/8 GB → ~100×), clamping.
- **Component** (`InternalScorecard.test.tsx`, jsdom per-file pragma): renders **all 4 cards**
  (burn card populated for both admin and stakeholder, since it reads the aggregate RPC); the
  headline is editable + the export button shown **only for admin**, read-only for a non-admin
  viewer; a failing data source degrades that one card, not the page.
- Build + lint; then the mandatory Codex second review.

## Rollout / deploy

Frontend + one additive **seed** migration. Ship order: merge the branch; **apply the seed
migration at the careful gate** (seeds the two KV rows; the admin-UPDATE policy already exists);
`verify-prod` on `/internal/scorecard` (desktop + mobile, console clean); `knowledge-sync`.

## Risks

- **`platform_weight` history too short for a 30-day delta** → traction detail is omitted (not
  faked); signal defaults to green (present users). Documented, not a bug.
- **Headline row not seeded** → hook falls back to a sensible default string; page still renders.
- **Print fidelity varies by browser** → the snapshot is plain, print-CSS'd, and aggregate; "Save
  as PDF" is the supported path.

## Resolved decisions

- Form: **both** — live page + print-optimized export (not Google-Doc for v1).
- Stories: **all four** (traction, capital efficiency, scale headroom, revenue readiness).
- Status: **founder-set headline + auto per-story signals** (no auto overall-health verdict).
- Phrasing: **deterministic/templated, never LLM.**
- Metrics: **user/traction & revenue are real-only**; the headroom card is physical infra
  capacity (conservative), labeled as such (Issue-B).
- Burn visibility: **a small internal-gated `aios_stakeholder_burn()` aggregate RPC** so
  non-admin stakeholders see all four stories live — no line items / no per-model breakdown (Issue-A).
