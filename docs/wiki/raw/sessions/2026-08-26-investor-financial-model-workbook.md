# Session — the multi-metro investor financial model, and the band it restated

Date: 2026-08-26 · Branch: `worktree-DC-pitchdeck-3` · Spec:
`docs/superpowers/specs/2026-08-26-investor-financial-model-workbook-design.md`

## What was asked for

Build the spreadsheet Adrian's multi-state model implies, for DragonCandy, forecast to 2028, with
every number explained and sourced — **"We cannot make up numbers"** — and put it in Google Drive.
Later, explicitly: *"can we make the spreadsheet with formulas so if we need to change a number in
the sheet it will add up correctly?"* That last sentence became the hardest requirement in the
session and was not met until a Codex review said so.

## What shipped

A committed model (`src/pitch/model/`) that derives the whole forecast from US Census venue counts
per metro, a stated penetration, and the app's own live pricing. A generated `.xlsx` with live
formulas, a public and a confidential build, and a Drive uploader. A deck slide rebuilt on the same
model. The three-year band in `PROJECT_CONTEXT.md` §3 restated from it, and every live document
carrying the old band brought into line.

Four metros: Hoboken (ZIP 07030), Manhattan (county 36061), Palm Beach County (12099), and
**Montauk + the Hamptons** — a 14-ZIP *set*, which needed a new `zipset` geography kind because a
real market is not always one ZIP or one county.

## The finding that matters most

The bottom-up model and the top-down plan disagree — and **not about reach**.

| Year | Metros (plan → model) | Customers EOY | Exit ARR | Booked |
|---|---|---|---|---|
| 2026 | 2–3 → 2 | 30 | $99,918 | $35,804 |
| 2027 | 8–12 → 10 | 264 | $879,278 | $517,631 |
| 2028 | 20+ → 21 | 1,423 | $4,739,444 | $3,341,424 |

Every metro count lands inside the plan's own band. Y3 customers (1,423) sit just under the planned
1,500–3,000. **The gap is price.** Blended ARPU is $277.55, flat, against the plan's $400–500 — and
it is low *by construction*: `project.ts` books two of the four revenue streams. Donny credit
overages and DragonDash rush surcharges are live in the product and have **never been charged to
anyone**, so they are valued at $0. At the plan's own $400, the model's own customer count reaches
$6.83M — 97.6% of the old $7M low end.

So the superseded band is **not refuted; it is unproven**, and what would settle it is billing
history on those two streams. That distinction was the difference between "we cut the target" and
"here is the floor we can evidence".

## Three quantities were all being called "revenue"

The single most expensive confusion in the session. Booked revenue (what a calendar year invoices,
summed monthly while customers ramp), exit ARR (year-end run rate), and steady-state annualised
revenue at N businesses are three different things. §3's column had always meant ARR; the model's
`revenue` field meant booked. Comparing them made the plan look wrong by 3x when the real ratio was
half that. `exitArr` became a first-class field and the cross-check compares like with like.

Separating them surfaced a live ambiguity nobody had noticed: the **$400K revenue-per-employee
kill-switch never said which revenue it measures.** Exit ARR clears ($431–474K); booked does not
($304–334K). Both numerators exclude two of four streams. The KPI scorecard already held the answer
to whether the floor itself is right — private-SaaS median is ~$130K/employee, ~$100K in the
$1–3M ARR band — so even the failing reading is ~3× the norm for this size. The gate is mis-scoped,
not failing. Left to the founder.

## Census suppression, and a false claim that shipped to investors

Suppressed cells (`"N"`) are UNKNOWN, never zero. A bucket is recoverable as the residual only when
exactly ONE of a row's nine is unknown.

Five surfaces — including the investor-facing Sources sheet — stated that Montauk's full-service
row had one suppressed bucket and was recovered, and Water Mill's had two and was not. **Measured
across all 67 rows: the minimum is TWO, the distribution runs 2–9, and ZERO rows have exactly one.**
Montauk's has six; Water Mill's seven. So `resolveSuppressed` recovers nothing on this vintage and
`bandFloorAcross` is byte-identical with and without it. The claim was true only under a different
reading of "bucket" (the three inside the addressable band, not the nine in the row).

The figures were all correct — 396 venues, ≥97 addressable, 44 suppressed cells all reproduce. What
was wrong was a **falsifiable claim on the one sheet whose purpose is to let a reader check us.**
The function and its ordering test were kept: the rule is right, it simply has no work to do here.

## The Assumptions sheet was inert

Codex filed a P1: `asm_` appeared exactly once in `workbook.ts` — at its definition. **No formula
referenced a named assumption cell.** Editing the Assumptions sheet changed nothing, against the
founder's explicit requirement.

It survived because the reason was legitimate: revenue fields are sums over a monthly ramp, so they
cannot be written as a product of year-end customers. But only **two** quantities per metro-year are
genuine integrals — `customerMonths` and `grossAdds`. Everything else is a product of those and the
registered assumptions. Emitting those two as cached values made the rest live: metro sheets went
24/60 → 51/63 formula cells, the cohort sheet 0/21 → 21/21, with **no number changed**.

**Penetration is only half-live, and that is disclosed rather than hidden.** Booked revenue is built
on customer-months, and a year-end share cannot reconstruct a twelve-month ramp — so editing a
penetration moves customers-at-year-end and Exit ARR but not booked revenue. Fixing it properly
would mean 36 monthly columns per metro on the sheet.

Two metro ids carry hyphens, which are illegal in Excel defined names — and the formula tokenizer
would have read `asm_palm-beach_…` as a subtraction. All names now go through one sanitiser.

## Two confidentiality leaks

**The public workbook was publishing the pre-seed budget.** `Total shared cost` (686,684 / 775,884 /
775,884) is the budget annualised; the per-metro allocation and consolidated EBITDA shipped with it.
Only the Financing sheet had ever been gated — gating one sheet by name does not gate the figure it
holds. It survived because `verify-public-bundle.ts` scans `dist/`, the web deck, and **nothing
scanned the generated `.xlsx` at all**; the generator runs in Node, so the vite alias that protects
the website does nothing for the spreadsheet.

**The deck gated the EBITDA number and printed its conclusion in English** — "The company's own line
stays negative through 2027" rendered unconditionally. A value scanner can never catch prose, and
the script now says so rather than implying coverage it does not have.

A correction worth recording: the obvious fix — move the sentence into `trajectory.confidential.tsx`
— **would not have worked.** `slides.tsx` imports that file unconditionally, so it is in the public
module graph, and with `build.sourcemap` on, its entire source ships inside the public `.map`.
Confirmed by finding the full source in `dist/assets/PitchDeck-*.js.map`. A `*.confidential.tsx`
filename does not make its text confidential, and nothing lints for that.

## Controls built, and why each exists

- `workbookProvenance.test.ts` — walks every cell for numbers without provenance. Formula cells were
  exempt until this session; it now allows only `0`, `2`, `12` as bare numerals, each with a reason.
- `formulaAgreement.test.ts` — every formula must evaluate to its cached value, in **both** builds
  (the public Totals sheet has a different row layout, so a formula can be right in one and point at
  the wrong row in the other).
- Toggle-response suite — the README advertises YES/NO toggles, so every consolidated row must move
  when one flips. Written because `Exit ARR` had silently become a plain value and **nothing
  failed**: the agreement test iterates cells with a formula, and a static cell agrees with its own
  cache trivially. *A test that only checks formulas cannot see a row that stopped being one.*
- `docConsistency.test.ts` — fails when a live doc quotes the superseded band without marking it
  superseded. Its **allowlist is the deliverable**: two ANALOGY sites where the old number is
  correct and a sweep "fixing" it would destroy the argument.
- Compile-time cohort classification — `Exclude<keyof MetroYear, …>` catches an unclassified field
  at `tsc`. Found `metroId` on its first run: a string, therefore invisible to a runtime check built
  from numeric entries.
- `verify-public-workbook.ts` — two-directional, like its bundle sibling: forbidden values absent
  from the public file AND present in the confidential one.

## The sweep that kept finding more

The restatement surface was measured three times and grew each time, because each instrument was
better than the last. A hand-written ledger list named **four** documents. A grep found **nine**. The
guard, on its first run, found **eleven** — including `DragonCandy_Investor_QA.md`, the crib sheet a
founder reads *from* in the room, whose slide-12 table described a slide shape that no longer
existed. Both missed files wrote the band in a notation the grep did not cover
(`$300K–$600K`, `$2–$4.5M`). **Match every notation the corpus contains, not the one people write.**

Two of the "documents" are **generated** (`DragonCandy_Investor_Model.md`, `DragonCandy_Investor_QA.md`)
and say so in their own first three lines. Hand-editing either survives exactly until the next
generator run. Check whether a doc is generated *before* editing it.

## Founder decisions, measured and reported, not decided

1. **Which revenue does the $400K/employee gate measure?** Exit ARR clears, booked fails.
2. **ARPU** — $277.55 modeled vs $350–500 planned across the archive and pricing docs.
3. **When does Year 1 start?** `year1StartMonth` is registered as January 2026, so the model books
   customers from February — while `payingCustomers` is a MEASURED 0 and launch is TBD. Two
   registered facts in one file disagreed. Year 1 honestly reads "the first twelve months of
   operation", not calendar 2026. Left at 1 deliberately; advancing it is a launch-date call.

## Files

`src/pitch/model/` (censusTam, metros, metroModel, project, rollup, consolidated, sharedCost,
workbook, formulaEval, assumptions, confidential) · `scripts/` (generate-financial-model-xlsx,
generate-investor-model, generate-investor-qa, fetch-census-tam, verify-public-workbook,
upload-model-to-drive, lib/public-workbook-guard, lib/drive-service-account) ·
`src/pitch/slides/` · eleven live documents restated.

No migrations. No edge functions. No schema change.
