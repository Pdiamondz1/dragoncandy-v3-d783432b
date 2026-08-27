---
title: Bottom-Up Financial Model
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-investor-financial-model-workbook.md]
tags: [fundraising, financial-model, census, tam, spreadsheet, provenance, confidentiality]
---
# Bottom-Up Financial Model

The forecast to 2028 that `docs/PROJECT_CONTEXT.md` §3 now states, and the workbook an investor
can edit. It lives in `src/pitch/model/` and derives everything from three inputs: **US Census
venue counts per metro**, a **stated penetration** of them, and the **app's own live pricing**.
The founder's constraint was *"we cannot make up numbers"*, and the second, harder one arrived
later — *"can we make the spreadsheet with formulas so if we need to change a number in the sheet
it will add up correctly?"* That sentence was not actually satisfied until a Codex review said it
wasn't. See [[Investor Pitch Deck & Capital Raise]] for the deck that reads from this.

Four metros: Hoboken (ZIP 07030), Manhattan (county 36061), Palm Beach County (12099), and
**Montauk + the Hamptons** — a 14-ZIP *set*, which needed a new `zipset` geography kind, because a
real market is not always one ZIP or one county.

## The finding: the plan and the model agree on reach and disagree on price

| Year | Metros (plan → model) | Customers EOY | Exit ARR | Booked |
|---|---|---|---|---|
| 2026 | 2–3 → 2 | 30 | $99,918 | $35,804 |
| 2027 | 8–12 → 10 | 264 | $879,278 | $517,631 |
| 2028 | 20+ → 21 | 1,423 | $4,739,444 | $3,341,424 |

Every metro count lands **inside the plan's own band**, and Y3 customers sit just under the planned
1,500–3,000. **The gap is price.** Blended ARPU is $277.55, flat, against the plan's $400–500 — and
it is low *by construction*: `project.ts` books **two of the four revenue streams** in
[[Pricing Architecture]]. Donny credit overages and DragonDash rush surcharges are live in the
product and have **never been charged to anyone**, so they are valued at $0. At the plan's own
$400, the model's own customer count reaches $6.83M — 97.6% of the superseded band's $7M low end.

So the superseded top-down band (**restated** in §3) is **not refuted; it is unproven**, and what
would settle it is billing history on those two streams. That distinction is the difference between
"we cut the target" and "here is the floor we can evidence" — and it is the sentence to reach for
when an investor asks why the number moved.

## Three quantities were all being called "revenue"

The single most expensive confusion in the work, and the one most likely to recur.

- **Booked revenue** — what a calendar year invoices, summed monthly while customers ramp.
- **Exit ARR** — the year-end run rate.
- **Steady-state annualised revenue at N businesses** — what N customers would bill for a full year.

§3's column had always meant ARR; the model's `revenue` field meant booked. Comparing them made the
plan look wrong by 3× when the real ratio was half that. `exitArr` is a first-class field now and
the cross-check compares like with like.

**Separating them surfaced a live ambiguity nobody had noticed:** the **$400K revenue-per-employee
kill-switch never said which revenue it measures.** Exit ARR clears ($431–474K); booked does not
($304–334K). Both numerators exclude two of four streams. [[North Star & KPI Scorecard]] already
held the answer to whether the floor itself is right — private-SaaS median is ~$130K/employee,
~$100K in the $1–3M ARR band — so even the failing reading is ~3× the norm for this size. **The
gate is mis-scoped, not failing.** Left to the founder; §3 records all four candidate resolutions.

## Census suppression: `"N"` is UNKNOWN, never zero

A suppressed cell is a bucket the Census will not disclose. A bucket is recoverable as the residual
**only when exactly ONE of a row's nine size buckets is unknown**.

Five surfaces — **including the investor-facing Sources sheet** — stated that Montauk's full-service
row had one suppressed bucket and was recovered, and Water Mill's had two and was not. **Measured
across all 67 rows: the minimum is TWO, the distribution runs 2–9, and ZERO rows have exactly one.**
Montauk's has six; Water Mill's seven. So `resolveSuppressed` recovers nothing on this vintage, and
`bandFloorAcross` is byte-identical with and without it. The claim was true only under a different
reading of "bucket" — the three inside the addressable band, not the nine in the row.

Every *figure* was correct: 396 venues, ≥97 addressable, 44 suppressed cells, all reproduce. What
was wrong was a **falsifiable claim on the one sheet whose entire purpose is to let a reader check
us.** The function and its ordering test were kept — the rule is right, it simply has no work to do
on this vintage — and that is worth stating rather than deleting, because the next vintage may
qualify.

## The Assumptions sheet was inert

Codex filed a P1: `asm_` appeared **exactly once** in `workbook.ts` — at its definition. **No
formula referenced a named assumption cell.** Editing the Assumptions sheet changed nothing, against
the founder's explicit requirement.

It survived because the reason was legitimate: revenue fields are sums over a monthly ramp, so they
cannot be written as a product of year-end customers. But only **two** quantities per metro-year are
genuine integrals — `customerMonths` and `grossAdds`. Everything else is a product of those and the
registered assumptions. Emitting those two as cached values made the rest live: metro sheets went
**24/60 → 51/63** formula cells, the cohort sheet **0/21 → 21/21**, with **no number changed**.

**Penetration is only half-live, and that is disclosed rather than hidden.** Booked revenue is built
on customer-months, and a year-end share cannot reconstruct a twelve-month ramp — so editing a
penetration moves customers-at-year-end and Exit ARR but not booked revenue. Fixing it properly
would mean 36 monthly columns per metro on the sheet.

Two metro ids carry hyphens, which are **illegal in Excel defined names** — and the formula
tokenizer would have read `asm_palm-beach_…` as a subtraction. All names go through one sanitiser.

## Two confidentiality leaks, both outside what the existing guard could see

See [[Build-Time Confidentiality]] for the mechanism; the durable half of both is scope.

1. **The public workbook was publishing the pre-seed budget.** `Total shared cost` (686,684 /
   775,884 / 775,884) is the budget annualised, and the per-metro allocation and consolidated EBITDA
   shipped with it. Only the Financing *sheet* had ever been gated — **gating one sheet by name does
   not gate the figure it holds.** It survived because `verify-public-bundle.ts` scans `dist/` and
   the web deck, and **nothing scanned the generated `.xlsx` at all**: the generator runs in Node,
   so the vite alias that protects the website does nothing for the spreadsheet.
2. **The deck gated the EBITDA number and printed its conclusion in English** — "The company's own
   line stays negative through 2027" rendered unconditionally. **A value scanner can never catch
   prose**, and the script now says so rather than implying coverage it does not have.

**A correction worth keeping: the obvious fix would not have worked.** Moving the sentence into
`trajectory.confidential.tsx` does nothing, because `slides.tsx` imports that file
**unconditionally** — it is in the public module graph, and with `build.sourcemap` on, its entire
source ships inside the public `.map`. Confirmed by finding the full source in
`dist/assets/PitchDeck-*.js.map`. **A `*.confidential.tsx` filename does not make its text
confidential, and nothing lints for that.**

## Controls, and why each exists

- **`workbookProvenance.test.ts`** — walks every cell for numbers without provenance. Formula cells
  were exempt until this work; it now allows only `0`, `2`, `12` as bare numerals, each with a
  reason.
- **`formulaAgreement.test.ts`** — every formula must evaluate to its cached value, in **both**
  builds. The public Totals sheet has a different row layout, so a formula can be right in one build
  and point at the wrong row in the other.
- **Toggle-response suite** (`workbookLiveness.test.ts`) — the README advertises YES/NO metro
  toggles, so every consolidated row must move when one flips. Written because `Exit ARR` had
  silently become a plain value and **nothing failed**: the agreement test iterates cells *with a
  formula*, and a static cell agrees with its own cache trivially. **A test that only checks
  formulas cannot see a row that stopped being one.**
- **`docConsistency.test.ts`** — fails when a live doc quotes the superseded band without marking it
  superseded. Its **allowlist is the deliverable**: two ANALOGY sites where the old number is
  correct and a sweep "fixing" it would destroy the argument.
- **Compile-time cohort classification** — `Exclude<keyof MetroYear, …>` catches an unclassified
  field at `tsc`. It found `metroId` on its first run: a string, therefore invisible to a runtime
  check built from numeric entries.
- **`verify-public-workbook.ts`** — two-directional like its bundle sibling: forbidden values absent
  from the public file **and present** in the confidential one. `scripts/lib/public-workbook-guard.ts`
  holds one list imported by both the generator and the verifier, because two hand-maintained lists
  diverge and the stale one is always the one doing the checking.

## The sweep that kept finding more

The restatement surface was measured three times and **grew each time, because each instrument was
better than the last**. A hand-written ledger list named **four** documents. A grep found **nine**.
The guard, on its first run, found **eleven** — including `DragonCandy_Investor_QA.md`, the crib
sheet a founder reads *from* in the room, whose slide-12 table described a slide shape that no
longer existed. Both files the grep missed wrote the superseded band in a notation it did not cover
(`$300K–$600K`, `$2–$4.5M`). **Match every notation the corpus contains, not the one people write.**

**Two of the "documents" are generated** — `docs/DragonCandy_Investor_Model.md` (`npm run
model:doc`) and `docs/DragonCandy_Investor_QA.md` (`npm run pitch:qa`) — and say so in their own
first three lines. Hand-editing either survives exactly until the next generator run. **Check
whether a doc is generated *before* editing it.**

## Founder decisions — measured and reported, not decided

1. **Which revenue does the $400K/employee gate measure?** Exit ARR clears, booked fails.
2. **ARPU** — $277.55 modeled against $350–500 planned across the archive and pricing docs.
3. **When does Year 1 start?** `year1StartMonth` is registered as January 2026, so the model books
   customers from February — while `payingCustomers` is a MEASURED 0 and launch is TBD. **Two
   registered facts in one file disagreed.** Year 1 honestly reads "the first twelve months of
   operation", not calendar 2026. Left at 1 deliberately; advancing it is a launch-date call.

## Commands

`npm run model:tam` (fetch Census) · `npm run model:doc` · `npm run model:xlsx` ·
`npm run pitch:verify-public-workbook` · `npm run model:upload` ([[Drive Artifact Delivery]]).

## See Also

- [[Investor Pitch Deck & Capital Raise]] · [[Build-Time Confidentiality]] · [[Drive Artifact Delivery]]
- [[Pricing Architecture]] · [[Take-Rate Ladder]] · [[North Star & KPI Scorecard]]
- [[Investor Financial Model Session]] — the session record this page synthesizes
