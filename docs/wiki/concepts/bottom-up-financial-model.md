---
title: Bottom-Up Financial Model
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-investor-financial-model-workbook.md, 2026-08-26-preseed-roster-and-workbook-design.md]
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

## The budget funded two roles nobody is hiring (2026-08-26)

`src/pitch/model/confidential.ts` funded a **back-end engineer** and an **AI engineer**. Neither
appears in `docs/DragonCandy_Tech_Department_Scope.md` §4, and neither appears in the outreach
sent 2026-08-21. The plan actually being executed recruits four different people — a product
manager, a UX designer, a senior developer and a mid-level developer.

Funding a team nobody is recruiting is not a conservative assumption; it is a wrong one, and it
propagates, because **the raise is computed from the budget**. The number an investor was to be
asked for had been sized against a roster that does not exist.

The four lines now sit on the tech scope's own recommended US/Europe mix and reproduce its stated
band exactly: it says "about $415–445K in salary", and 195 + 90 + 60 + 70 = 415, 195 + 120 + 60 +
70 = 445, the spread being the PM's $90–120K range (midpoint $105K taken). US FTE figures are
loaded (~30%); Europe/contract figures are not, which is correct — a European contractor carries
no employer load for us. Software and AI are deliberately NOT folded in: the document's "$450–500K
with software and AI" is already carried by the separate `infra` and `agents` lines.

**Start months are inherited or sourced, never chosen.** Month 3 is carried over unchanged from
the `backend` line these replace. The PM is month 6 because the cost model's §5 states a month-6
PM hire ("Dame covers product early") — while the tech scope argues the PM should start FIRST,
since the audit is their job. That disagreement between two live documents is recorded, not
resolved by a code file.

### Three consequences, each stated rather than left to be discovered

**No dedicated AI engineer is funded across the 18-month horizon.** Donny work sits with the CTO
and the senior developer. The cost model's §5 roster keeps its AI developer, DevOps, part-time
security engineer and sales AE — with a note that it describes the fully-ramped seed-stage team
behind a **$3M priced round**, not the four hires a pre-seed pays for, and that where the two
disagree on a role the tech scope is current. The tech scope's own words for those roles are that
they "aren't cancelled. They're just later."

**The raise moved: $1,462,568 → $1,491,244.** Nothing was re-sized by hand. The margin matters
more than the figure: it now sits inside the intended $500K–$1.5M pre-seed band by **$8,756**,
where the old figure cleared it by $37K. Every prior write-up treated that band as comfortable.

**Y1 headcount became 7** — a count (2 founders + 4 hires + bookkeeper), not the estimate 5–6 —
**and that broke the year-over-year composition**, which is flagged rather than resolved: Year 2
is 7–8, so it adds at most one person while naming four roles; and Year 3 says "Add: Product
Manager (FTE)" for someone who is now a Year 1 hire. Re-deriving Y2/Y3 means deciding who is
hired in 2027–28, which is a founder call. See [[PART 1 — Engineering & AIOS Operations]], Part 3.
`PROJECT_CONTEXT.md` §3's claim that nothing in its own table derives from the Y1 cell still
holds — revenue per employee is computed against Y3 alone — so the contradiction is in the
**composition** of the years, not in any revenue figure.

### A needle aimed at a deleted line reports clean forever

`workbookProvenance.test.ts` asserts no confidential salary reaches the public workbook, and its
needle was the AI engineer's **$17,900** — a value the budget no longer emits. That is the same
failure `verify-public-bundle.ts` records in its own header: a probe whose subject went missing
passes for the wrong reason. It now uses the mid-level developer's **$5,833** (chosen over the
designer's round $5,000, for the same reason that file avoids round needles) **and carries a
control** — the same needle must be FOUND in the confidential spec. Without it, "absent from the
public build" is also what you get from a needle nothing emits.

## The workbook had two style rules, and one of them was hiding an order-of-magnitude trap

`npm run model:xlsx` shipped with column A at width 44 and row 1 bold. Twelve identical grey
sheets: no way to see where a section begins, no way to tell a subtotal from the rows above it,
and no way to tell the sheet you may edit from the sheet that is a Census extract. The
explanatory paragraphs are hand-wrapped one row per line, so they read as data until you notice
they are prose.

**The split is the design, and it is the reusable part.** The spec gains a `CellRole` — `title`,
`subtitle`, `header`, `section`, `note`, `input`, `total`, `headline`, `provenance` — which are
claims about the document's STRUCTURE, true in a PDF or in a renderer with no colours at all.
`scripts/lib/workbook-theme.ts` is the only file that decides a section is teal. Putting fills in
the spec would turn the model into a stylesheet, and `workbookProvenance.test.ts` walks every cell
in it asserting each number traces to a registered assumption — every colour added there is
another cell that walk has to learn to ignore.

**A role on the first cell of a row governs the row**, which is why tagging four metro sheets,
Totals, Financing, Unit_Economics, the cohort, Sources and the README cost about forty edits
rather than four hundred. Inferring structure in the writer from a row's SHAPE was rejected: a
prose row and a section heading are the same shape — one string in column A, nothing beside it —
and a rule that cannot tell them apart formats every explanatory paragraph as a heading.

**No row was added, moved or removed**, and that is a constraint rather than a coincidence.
`rowOf()` resolves cross-sheet formulas by LABEL and `totalsSheet` addresses metro sheets by row
NUMBER, so a presentation change that shifted a row would silently repoint a formula. The role
helpers keep `v` byte-identical, so both resolvers see what they always saw.

Colours are the `dc-*` tokens from `DESIGN_SYSTEM.md`, not picked to taste. The header fill is
`dc-teal-btn` **#0F766E**, the dark teal that system reserves for FILLS, for the same reason it is
used behind white text there: the bright brand teal #4DD9C0 is ~1.6:1 against white. The design
system records that trap as "dark-fill-as-text"; a spreadsheet header is the same mistake one
medium over.

### Two of these are not cosmetic

**The Assumptions value column had NO number format at all.** The one sheet a reader is told to
edit showed `0.029` for a 2.9% Stripe fee and `0.005` for a half-percent Manhattan penetration —
the two figures most likely to be mistyped by an order of magnitude, in the form that makes the
mistake invisible. Formats are now derived from the registered UNIT (`fraction` → `0.00%`, `USD*`
→ `$#,##0.00`, `calendar` → `0`, else `#,##0.###`), which also makes the edit natural: typing
`8%` into a percent-formatted cell stores 0.08, where typing it into a General cell stores text.
`calendar` is special-cased AHEAD of the numeric fallback, because 2026 is a year and `#,##0`
renders it `2,026`.

**The editable cells are now visibly editable.** The Assumptions values and the Totals YES/NO
toggles carry a boxed amber fill and nothing else does — pinned by a test asserting exactly two
sheets ever hold an `input` cell. The README promises two editable surfaces; a third would be a
promise nothing made.

### The control: presentation may not change a value

`scripts/lib/workbook-theme.test.ts` builds the spec, writes it the way the generator does,
applies the theme, then reads every cell back and compares to the spec — over a thousand cells,
with a floor asserted so it cannot pass on an empty workbook. It also pins that a number format's
POSITIVE section is byte-identical to the spec's, **because a format is presentation that is
fully capable of lying** (`0.029` shown as `3%`). `withNegativeStyle` therefore only appends a
negative section, only to `$` formats, and never to a format that already declares its own
sections — one that does has said what it wants, and overriding it would make the spec's
instruction silently inoperative.

**Found and not fixed:** a formula cell whose cached result is **zero** reads back from `exceljs`
with the result missing. It predates this work, and it is harmless in Excel and Sheets, which
recalculate on open. It matters only to something that trusts a cached value without
recalculating. The test records it rather than papering over it.

## Founder decisions — measured and reported, not decided

1. **Which revenue does the $400K/employee gate measure?** Exit ARR clears, booked fails.
2. **ARPU** — $277.55 modeled against $350–500 planned across the archive and pricing docs.
3. **When does Year 1 start?** `year1StartMonth` is registered as January 2026, so the model books
   customers from February — while `payingCustomers` is a MEASURED 0 and launch is TBD. **Two
   registered facts in one file disagreed.** Year 1 honestly reads "the first twelve months of
   operation", not calendar 2026. Left at 1 deliberately; advancing it is a launch-date call.
4. **Who does Year 2 and Year 3 actually hire?** Y1 is now a count of 7 and the Y2/Y3 role lists
   no longer add up to their totals — see the roster section above.
5. **Is a raise $8,756 inside the top of the intended $500K–$1.5M band acceptable**, or does the
   band move? The next line item of any size takes it out.

## Commands

`npm run model:tam` (fetch Census) · `npm run model:doc` · `npm run model:xlsx` ·
`npm run pitch:verify-public-workbook` · `npm run model:upload` ([[Drive Artifact Delivery]]).

## See Also

- [[Investor Pitch Deck & Capital Raise]] · [[Build-Time Confidentiality]] · [[Drive Artifact Delivery]]
- [[Pricing Architecture]] · [[Take-Rate Ladder]] · [[North Star & KPI Scorecard]]
- [[Investor Financial Model Session]] — the session record this page synthesizes
- [[PART 1 — Engineering & AIOS Operations]] — where the Y2/Y3 role-list contradiction is flagged
