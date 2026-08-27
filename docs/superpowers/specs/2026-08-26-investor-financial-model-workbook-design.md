# Investor financial model workbook — design

**Date:** 2026-08-26
**Status:** design, awaiting approval
**Supersedes nothing.** Extends `2026-08-23-investor-deck-and-model-design.md`.

## 1. What this is

A multi-metro financial model for DragonCandy, built to the architecture of the model
Adrian Vella supplied (`~/Documents/multi state model Jan 2021 Adrian.xlsx`), delivered as
a live Excel workbook in the Confidential shared drive, and wired into the investor deck so
the slide and the workbook cannot quote different numbers.

Adrian sits on the board. He sent a model of his own rather than a request, which is a
request: he expects to open ours and poke at it. That is the design constraint that decides
almost everything below.

## 2. What Adrian's model actually does

Seventeen US states, one sheet each, every sheet the same skeleton:

1. **Market size** — total addressable turnover and gross gaming revenue for the state,
   grown year over year.
2. **Market share %** — a ramp, by year, of how much of that market the company takes.
3. **Company revenue** — market size × share. Everything downstream is a percentage of this.
4. **Bonus costs** — promotional give-back, as a declining % of revenue.
5. **Statutory taxes** — state gaming tax, federal excise.
6. **Variable cost stack** — payment processing, KYC/geolocation, content feeds, platform fees.
7. **Market access fees** — paid to the licence-holding casino, with a minimum revenue guarantee.
8. **Hosting and hardware.**
9. **Marketing** — as a % of revenue, ramping down hard (197% → 150% → 70% → 45% → 35% → 29% → 25%).
10. **Local EBITDA.**
11. **Allocated shared costs** — personnel, tech, office, capex, pulled from a consolidated
    tech-cost sheet.
12. **Final EBITDA.**
13. **Capex, financing, closing cash, free cash.**
14. **KPI block** — every cost line restated as a % of revenue.

Above the state sheets sit three roll-ups: a per-state `Output` summary for investors, a
`Totals` sheet that sums every state with a **`YES`/`NO` toggle per state**
(`IF($B15="NO",0,IF($B15="YES",CA_Model!C12))`), and consolidated shared-cost sheets.

The toggles are the point. The model is not a forecast, it is an instrument for asking
"what if we skip Texas" and getting an answer in one keystroke.

## 3. What DragonCandy already has

`src/pitch/model/` is a provenance-tagged assumption register. Every number carries:

- `MEASURED` — read off production, an invoice, or the codebase, with the ISO date and the
  **exact command** that re-reads it. `assumptions.test.ts` fails CI when one passes 90 days.
- `BENCHMARKED` — an external comparable, with a URL.
- `MODELED` — ours, with the driver named.

This is the discipline the request asks for ("each number needs an explanation of how that
number came to be"), already built and already enforced. The explanation sheet is therefore
**generated from the register**, not written by hand — which is what stops it drifting from
the numbers sheet.

The gap is structural, not cultural: the current model is one blended business projected on a
business count. There are no metros in it. Adrian's is per-market with a rollup, and our own
rollout plan already has that shape — Hoboken (months 0–6) → Manhattan (months 5–12) →
Palm Beach (months 11–18), each gated on density before the next.

## 4. The market-size row, and why it is now answerable

Adrian's model rests on a market-size row. Ours had no equivalent, and
`src/pitch/deck/pending.ts` carries `hobokenRestaurantCount` as an outstanding founder input:
*"How many restaurants operate in Hoboken IN TOTAL — the town-wide denominator, with its
source?"*

**That input is now answered from public data.** US Census County/ZIP Business Patterns,
2022 vintage, ZIP 07030 (Hoboken is a single ZIP, so this is genuinely town-wide and not a
proxy):

| NAICS | Category | Establishments |
|---|---|---|
| `722` | All food services and drinking places | **251** |
| `722511` | Full-service restaurants | 97 |
| `722513` | Limited-service | 67 |
| `722515` | Snack and non-alcoholic beverage | 43 |
| `722410` | Drinking places | 22 |
| `7223` | Special food services | 22 |

Employment-size distribution for the 251: 77 under 5 employees, 47 at 5–9, 62 at 10–19,
56 at 20–49, 8 at 50–99. The 5–49 band is ~186 venues — an operator large enough to have a
marketing budget and small enough to have no marketing department. That is the ICP, and it
becomes the **addressable** row rather than the raw count.

County-level comparators, same source, NAICS 722511: New York County (Manhattan) **3,998**;
Palm Beach County **1,340**; Hudson County **635**.

**Access:** the Census `api.census.gov` JSON endpoint now returns `Missing Key`. The bulk
dataset files require no key and were fetched successfully during design
(`https://www2.census.gov/programs-surveys/cbp/datasets/<year>/zbp<yy>detail.zip`,
`.../cbp<yy>co.zip`). A 2023 vintage exists (HTTP 200); the build uses the newest available
and records which one it used.

### 4.1 Geography is a modeling decision, and it is stated not assumed

Hoboken is a ZIP and resolves exactly. **Manhattan** is New York County and resolves exactly.
**Palm Beach** does not: the county (1,340 full-service venues) is not the town, and the
launch plan means the town. The metro registry therefore stores an explicit
`geography: { kind: 'zip' | 'county', code, label }` per metro, and Palm Beach is defined at
ZIP level (33480, Palm Beach proper) with the county figure carried beside it on the Sources
sheet as the upper bound. Where a geography choice materially changes the TAM, both numbers
appear.

### 4.2 The addressable band, pinned

"Addressable" is a modeling choice and must not be left to the reader's imagination. The
default, and the one the workbook ships with:

- **NAICS included:** `722511` (full-service), `722410` (drinking places), `722515` (snack and
  non-alcoholic beverage). **Excluded:** `722513` (limited-service — largely franchised fast
  food, where social marketing is set at corporate, not by the location) and `7223` (special
  food services — catering and food trucks, which have no fixed venue to market).
- **Employment-size buckets included:** 5–9, 10–19, 20–49. **Excluded:** under 5 (below the
  $149 entry tier's plausible budget) and 50+ (has, or is owned by someone who has, a
  marketing function).

Applied to Hoboken (ZBP 2022), this yields:

| NAICS | 5–9 | 10–19 | 20–49 | Addressable |
|---|---|---|---|---|
| `722511` full-service | 19 | 23 | 34 | 76 |
| `722410` drinking places | 5 | 8 | 6 | 19 |
| `722515` snack / beverage | 10 | 12 | 3 | 25 |
| **Total** | | | | **120** |

So Hoboken's addressable denominator is **120 venues** against a town-wide food-service count
of 251. Penetration percentages in the model are stated against the 120, never the 251, and
the sheet shows both so the ratio cannot be quietly swapped.

**Census suppression is a real hazard and the loader must handle it.** Cells are suppressed to
`"N"` to protect respondent confidentiality — Hoboken's `722410` under-5 bucket is suppressed,
recoverable only as the residual (22 − 5 − 8 − 6 = 3). The extractor treats `"N"` as unknown,
never as zero, and reconstructs a bucket from the establishment total when exactly one bucket
in a row is suppressed. Where more than one is suppressed it records the range and the
`Sources` sheet says so. Suppression bites harder in smaller metros than in Manhattan, so this
is load-bearing for exactly the markets we launch in first.

Both the
included set and the excluded set are written onto the `Sources` sheet with the reasoning
above, because an investor's first question about any TAM is what was left out. All six
inclusion flags are inputs on `Assumptions`, so the band can be widened in the sheet without
a rebuild.

## 5. Adrian's skeleton, translated

| Adrian (Tipico) | DragonCandy | Provenance |
|---|---|---|
| Interactive market GGR | Addressable venues × annual social-marketing spend per venue | Census + BENCHMARKED spend |
| Market share % ramp | Penetration % of addressable venues, ramped by year | MODELED |
| Tipico GGR | GMV through the platform | derived |
| Bonus costs | **omitted** | — |
| NGR | Net revenue = subscription + take-rate | derived |
| Statutory gaming tax | **omitted** | — |
| Payment processing | Stripe 2.9% + $0.30 | BENCHMARKED (stripe.com/pricing) |
| KYC / geolocation | Twilio Verify + Google Geocoding, per unit | BENCHMARKED (vendor pricing) |
| Platform and content fees | Outstand $249, Anthropic $200, Supabase $45, OpenAI $25, Lovable $50 | MEASURED (invoices) |
| Market access fee / min. revenue guarantee | **omitted** | — |
| Hosting and hardware | Supabase + Vercel | MEASURED |
| Marketing as declining % of revenue | CAC × new venues, restated as % of revenue, declining ramp | MODELED |
| Local EBITDA | Metro EBITDA | derived |
| Allocated shared costs | Team payroll, AI, shared infra, allocated by revenue share | MEASURED rates, MODELED roster |
| Final EBITDA | Final EBITDA | derived |
| Capex / financing / closing cash | Pre-seed raise, burn, runway (`confidential.ts`) | MODELED |
| KPI: cost lines as % of GGR | Same, plus LTV:CAC, CAC payback, churn | derived |

**Three of Adrian's blocks are omitted, deliberately.** Bonus costs, gaming tax and market
access fees have no DragonCandy analogue. Carrying an empty row shaped like his would be
decoration; carrying a filled one would be fabrication. The `Sources` sheet states which of
his rows we dropped and why, so a reader comparing the two workbooks side by side is not left
wondering whether we forgot.

## 6. Architecture

The workbook is **generated, never authored** — the same rule the PDF and
`docs/DragonCandy_Investor_Model.md` already follow. Editing the `.xlsx` by hand is pointless
because the next run overwrites it.

### 6.1 New model modules

**`src/pitch/model/censusTam.json`** — committed snapshot. Per metro: geography, NAICS
breakdown, establishment counts, employment-size distribution, the dataset vintage, the source
URL, and the ISO date fetched.

Committed rather than fetched at build time for three reasons: the build must be deterministic
and must work offline; the snapshot is the audit trail an investor can check; and a network
fetch inside a build is a build that fails for reasons unrelated to the code.

**`scripts/fetch-census-tam.ts`** (`npm run model:tam`) — downloads the newest CBP/ZBP vintage,
extracts the rows for every registered metro geography, and rewrites the snapshot. Prints a
diff against the previous snapshot so a vintage change is visible rather than silent.

**`src/pitch/model/metros.ts`** — the metro registry. Per metro: `id`, `label`, `geography`,
`launchMonth`, `enabled`, the addressable-band definition (which NAICS codes and which
employment-size buckets count), and the penetration ramp. Every numeric field is an
`Assumption<number>` from the existing register types, so metros are staleness-checked and
provenance-tagged like everything else.

**`src/pitch/model/metroModel.ts`** — one metro, one year: the row taxonomy in §5, computed.
Pure. No dates, no I/O.

**`src/pitch/model/rollup.ts`** — Totals across enabled metros, plus shared-cost allocation by
revenue share. Returns the 2026/2027/2028 consolidated view the deck slide reads.

### 6.2 Generators

**`scripts/generate-financial-model-xlsx.ts`** (`npm run model:xlsx`) — builds the workbook
with `exceljs@4.4.0` (new dev dependency; writes formulas, number formats, defined names).

**`scripts/upload-model-to-drive.ts`** (`npm run model:upload`) — reuses
`scripts/lib/drive-service-account.ts`. Destination is the deck's folder: team drive
`0AGQe4NGwWqV8Uk9PVA`, folder `1d0yb3VvRPVBF28s1UBHPfrubwkaOsRvM`
(`DragonCandy — Confidential › 11 · Finance`). MD5-verified after upload, because vendors
report success on writes that did not stick and this project has the scars.

## 7. Live formulas

The workbook is an instrument, not a report. Decided 2026-08-26.

**Rule: any cell a reader would want to change is an input; every cell downstream of an input
is a formula.** Concretely:

- The `Assumptions` sheet holds every input as a **named cell** (`exceljs` defined names, e.g.
  `hoboken_penetration_2027`). Nothing else in the workbook holds a raw number that an
  assumption could have supplied.
- Metro sheets reference those names. Change penetration on `Assumptions` and the metro
  EBITDA, the Totals rollup and every KPI ratio reflow.
- `Totals` uses Adrian's own toggle idiom: `IF($B7="NO",0,Hoboken_Model!D30)`, with the
  `YES`/`NO` cell carrying a data-validation dropdown so it cannot be mistyped into silently
  contributing zero.
- Every formula cell is written with a **cached `result`**, computed by our own TypeScript.
  Excel and Google Sheets recalculate on open; LibreOffice and quick-look previews render the
  cache. Writing a formula with no cached result shows a blank workbook to anyone who opens it
  in a previewer.

**The cached result is also the test surface.** Our TypeScript computes the number; the
formula is supposed to compute the same number. If they can disagree, the workbook is lying to
whoever recalculates it. See §9.

## 8. Sheets

| # | Sheet | Contents |
|---|---|---|
| 1 | `README` | What this is, the build command, what is measured vs modeled, and the three omitted Adrian rows |
| 2 | `Assumptions` | Every input: label, value, unit, provenance, source, note. Named cells. Generated from `REGISTER` + `metros.ts` |
| 3 | `Sources` | Citation list — Census vintage/URL/NAICS, Stripe pricing URL, each vendor invoice, each repo command with the date last run |
| 4 | `Hoboken_Model` | Full skeleton, 2026/2027/2028, plus monthly detail for 2026 (Hoboken launches mid-year, so an annual column hides the ramp) |
| 5 | `Manhattan_Model` | Full skeleton, annual |
| 6 | `PalmBeach_Model` | Full skeleton, annual |
| 7 | `Metros_4toN` | Y2–Y3 expansion as a **cohort**, not named sheets — see §8.1 |
| 8 | `Shared_Costs` | Payroll, AI, shared infra; allocation basis and the resulting per-metro split |
| 9 | `Totals` | `YES`/`NO` per metro → consolidated 2026/2027/2028, with the top-down cross-check row (§10) |
| 10 | `Unit_Economics` | CAC, LTV, LTV:CAC, payback, churn, liquidity thresholds — from `derive.ts` |
| 11 | `Financing` | Pre-seed budget, raise, use of funds, closing cash, months of runway — from `confidential.ts` |

### 8.1 Why the later metros are a cohort

PROJECT_CONTEXT §3 targets 2–3 metros in Y1, 8–12 in Y2, 20+ in Y3. **Those metros have not
been chosen.** Generating seventeen named sheets to match Adrian's shape would put invented
cities into an investor document. `Metros_4toN` instead models an *nth metro* — a single
parameterised sheet with a count driver — carrying the honest caveat that it assumes a metro
resembling the average of the three that are named. The count per year is an input on
`Assumptions`, so Adrian can flex it.

## 9. Testing

The controls, in order of how much they matter.

**`workbookProvenance.test.ts` — every number in the workbook traces to a register entry.**
Generate to a buffer, walk every cell, and assert each numeric literal is either (a) a value
sourced from `REGISTER` or `metros.ts`, or (b) a formula. No orphan literals. Without this,
"no made-up numbers" is a promise; with it, it is a failing build. This is the single most
important test in the change.

**`formulaAgreement.test.ts` — the formula and the cache agree.** For every formula cell,
evaluate the formula against the workbook's own named cells and assert it equals the cached
result our TypeScript computed. A workbook whose formulas disagree with its displayed numbers
is worse than a values-only workbook, because it looks live and lies when recalculated. Uses a
small formula evaluator over the subset of Excel functions we emit (`SUM`, `IF`, `+ - * /`,
cell and name references) — the subset is small precisely because we choose what to emit.

**`metros.test.ts`** — TAM matches the committed Census snapshot; penetration ramps are
monotonic and never exceed 100%; penetrated venues never exceed addressable venues; launch
months are ordered.

**`rollup.test.ts`** — Totals equals the sum of enabled metros; a metro toggled off contributes
exactly zero; shared-cost allocation sums to 100% of shared cost, with a forced control that
fails if the allocator silently normalises.

**`assumptions.test.ts`** — extended so the new metro assumptions are staleness-checked with
everything else.

## 10. The top-down / bottom-up divergence

The deck's `trajectory` slide currently renders `threeYearTrajectory()`, which reads the
`TRAJECTORY` register — the **top-down** bands asserted in PROJECT_CONTEXT §3
($300–600K / $2–4.5M / $7–12M revenue). This model produces a **bottom-up** forecast from
Census TAM × penetration × pricing.

**They will disagree, and the disagreement is the most useful output of this build.**

Three ways to handle it, and only one is honest:

- Tune the penetration ramp until bottom-up lands inside the top-down band. **Rejected** —
  that is fitting assumptions to a desired answer, which is the exact failure this model exists
  to prevent.
- Show only the top-down band. **Rejected** — it wastes the build.
- **Chosen:** the slide and the `Totals` sheet show the bottom-up build, and carry the
  top-down band beside it as a labelled cross-check row. `rollup.test.ts` computes the gap and
  **reports** it; it does not fail on it, because either number could be the wrong one and a
  test that forces agreement would just be the rejected option with extra steps.

If the gap is large, that is a finding to take to Adrian, not a bug to fix.

## 11. Deck integration

The `trajectory` slide is **upgraded, not added**: same `SlideId`, new data source
(`rollup()` instead of `threeYearTrajectory()`), gaining a metros-live row and the cross-check
band. Adding a sixteenth slide would mean two slides quoting different three-year numbers, and
would require coordinating the PDF exporter's slide-count guard, which reads its count from
`notes.ts`.

`threeYearTrajectory()` is retained — it is what supplies the cross-check band.

The slide's speaker note is rewritten to say where the number now comes from, because the
current note coaches Joe to defend a top-down band he would no longer be showing.

## 12. Confidentiality

**Confidential build only.** The workbook carries the raise, the budget, closing cash and
runway, matching Adrian's model, which carries the same rows.

The existing `pitch:verify-public` asserts confidential figures do not reach `dist/`. The
workbook is not in `dist/`, so that guard does not cover it. The equivalent guard here is on
the **generator**: it refuses to emit a workbook labelled public that contains the `Financing`
sheet, and the uploader derives the remote filename from a manifest recorded at generation
time rather than from a flag or an argument. That mirrors the lesson already recorded in
`scripts/upload-pitch-to-drive.ts` — the redacted deck once went to the Confidential drive
under a name promising the opposite, and a filename-based guard is defeated by a rename.

## 13. Out of scope

- SAFE terms (cap, discount, MFN) — a founder decision, not a derivation. Deliberately absent
  from `confidential.ts` today and staying absent.
- Corporate tax. Adrian's model has a `Corp tax?` annotation and does not model it either.
- The three omitted Adrian blocks (§5).
- Naming the Y2–Y3 metros (§8.1).
- Donny credit overages and DragonDash rush surcharges as revenue lines. They are live in the
  app but nothing has ever been charged; `project.ts` excludes them today for that reason and
  this model keeps the exclusion, so the forecast understates rather than overstates.

## 14. Sequence

1. `metros.ts` + `censusTam.json` + `fetch-census-tam.ts`, with `metros.test.ts`.
2. `metroModel.ts`, with tests.
3. `rollup.ts` + shared-cost allocation, with tests.
4. `generate-financial-model-xlsx.ts` — values only, all eleven sheets.
5. `workbookProvenance.test.ts` — the orphan-literal control, before formulas exist.
6. Convert to named cells and live formulas; `formulaAgreement.test.ts`.
7. Deck slide upgrade + speaker note.
8. `upload-model-to-drive.ts` + the public/confidential generator guard.
9. `npm run build`, full test run, Codex second review, PR.
10. `knowledge-sync` — wiki page, `SHIPPED_LOG.md`, PROJECT_CONTEXT §5 index line.

## 15. Open founder inputs this does NOT resolve

- **Annual social-marketing spend per venue.** The TAM's dollar multiplier. Census gives
  establishment counts and payroll, not marketing budgets. This will be `BENCHMARKED` to a
  published SMB marketing-spend study, cited on `Sources`, and it is the assumption most worth
  challenging — flagged as such on the sheet rather than buried.
- **SAFE terms** — §13.
- **Launch event budget** — already blocked as `launchEventPlan` in `deck/pending.ts`; the
  `Financing` sheet inherits that gap and labels it.

What this design *does* resolve: `hobokenRestaurantCount`, previously a blocking founder
input, now answered from a citable public source (§4).
