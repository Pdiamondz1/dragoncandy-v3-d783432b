# 2026-08-26 — The pre-seed funds the four people we are actually hiring, and the workbook gets a design

Branch `feat/preseed-four-hires`, two commits, cut off `origin/main` after #550 and #551 merged.
Codex second review: clean, no findings. `tsc --noEmit` clean, 341 test files / 3931 tests pass,
`npm run build` green, `npm run pitch:verify-public-workbook` clean with its control passing.

## Part 1 — the budget funded two roles nobody is hiring

`src/pitch/model/confidential.ts` funded a **back-end engineer** ($195K loaded) and an **AI
engineer** ($215K loaded). Neither role appears in `docs/DragonCandy_Tech_Department_Scope.md` §4,
and neither appears in the outreach sent 2026-08-21 to Adrian's three referrals. The plan being
executed recruits four different people: a product manager, a UX designer, a senior developer and
a mid-level developer.

Funding a team nobody is recruiting is not a conservative assumption. It is a wrong one, and it
propagates: the raise is computed from the budget, so the number an investor is asked for was
sized against a roster that does not exist.

The four lines now sit on the tech scope's own recommended US/Europe mix, and the four annuals
reproduce that document's stated band exactly. It says the mix is "about $415–445K in salary":
low = 195 + 90 + 60 + 70 = 415, high = 195 + 120 + 60 + 70 = 445, the spread being the product
manager's $90–120K range, of which the midpoint $105K is taken. US FTE figures are loaded (~30%
employer cost); the Europe/contract figures are not, which is correct rather than an oversight —
a European contractor carries no employer load for us. Software and AI costs are deliberately NOT
folded in, because the same document's "$450–500K a year with software and AI" figure is already
carried by the separate `infra` and `agents` lines; adding it here would double-count.

**Start months are inherited or sourced, never chosen.** Month 3 is carried over unchanged from
the `backend` line these replace, and applies to the senior developer, the mid-level developer
and the designer. The product manager is month 6 because the cost model's §5 states the PM as a
month-6 hire ("Dame covers product early"). The tech scope argues the PM should instead start
first, since the audit is their job — a real disagreement between two live documents, recorded in
the tech scope's own "Two places this differs from our existing cost model" note rather than
silently resolved by a code file.

### Three consequences, each stated rather than left to be discovered

**No dedicated AI engineer is funded for the whole 18-month horizon.** Donny work sits with the
CTO and the senior developer. A reader comparing `confidential.ts` with the cost model's §5 roster
will notice the omission, and finding it explained is very different from finding it missing. The
cost model's other roles (AI developer, DevOps/App Administrator, part-time security engineer,
sales AE) are not cancelled — the tech scope's own words are that they are "just later" — and
later is beyond this horizon. `docs/DragonCandy_Capital_Raise_Cost_Model.md` §5 keeps its roster
with a note explaining that it describes the fully-ramped seed-stage team behind a $3M priced
round, not the four hires a pre-seed pays for, and that where the two disagree on a role the tech
scope is current.

**The raise moved: $1,462,568 → $1,491,244.** Nothing was re-sized by hand; the raise is computed
from the budget, so changing who it funds changes it. The margin is what matters more than the
figure: it now sits inside the intended $500K–$1.5M pre-seed band by **$8,756**, where the old
figure cleared it by $37K. Every prior write-up treated that band as comfortable. It no longer is,
and `docs/wiki/concepts/investor-pitch-deck.md` says so where it states the raise.

**Y1 headcount is 7, not 5–6** — a count (2 founders + 4 hires + bookkeeper), not an estimate.
And that broke the year-over-year composition in the staffing analysis, which is flagged rather
than resolved:

- Year 2 is 7–8 people, so it adds at most one person, while its role list names three FTE roles
  plus a contractor. Under the old 5–6 Year 1 that list was roughly coherent. It is not now.
- Year 3 says "Add: Product Manager (FTE)", and the PM is now a Year 1 hire — hired twice.

The Y2/Y3 totals were written against a 5–6 Year 1 and were **not** re-derived, because
re-deriving them means deciding who is actually hired in 2027 and 2028: a founder call, not an
arithmetic one. `PROJECT_CONTEXT.md` §3's claim that nothing in its own three-year table derives
from the Y1 cell remains true — revenue per employee is computed against Y3 alone — so the
contradiction is in the *composition* of the years, not in any revenue figure.

### The leak probe had been pointed at a deleted line

`workbookProvenance.test.ts` asserts no confidential salary reaches the public workbook, and its
needle was the AI engineer's **$17,900** — a value this budget no longer emits. A needle aimed at
a deleted line can never fire and would report clean forever, which is the exact failure mode
`verify-public-bundle.ts` records in its own header. It now uses the mid-level developer's
**$5,833**, chosen over the designer's round $5,000 for the same reason that file avoids round
needles, and it carries a **control**: the same needle must be FOUND in the confidential spec.
Without that, "absent from the public build" is also what you get from a needle nothing emits.

## Part 2 — the workbook had two style rules

`npm run model:xlsx` shipped with column A at width 44 and row 1 bold. That is enough to read and
not enough to follow. Twelve identical grey sheets; no way to see where a section begins; no way
to tell a subtotal from the rows above it; no way to tell the sheet you may edit from the sheet
that is a Census extract. The explanatory paragraphs are hand-wrapped one row per line, so they
read as data until you notice they are prose.

**The split is the design.** The spec (`src/pitch/model/workbook.ts`) gains a `CellRole` —
`title`, `subtitle`, `header`, `section`, `note`, `input`, `total`, `headline`, `provenance` —
which are claims about the document's STRUCTURE, true in a PDF or in a renderer with no colours
at all. `scripts/lib/workbook-theme.ts` is the only file that decides a section is teal. Putting
fills in the spec instead would turn the model into a stylesheet, and `workbookProvenance.test.ts`
walks every cell in it asserting each number traces to a registered assumption — every colour
added there is another cell that walk has to learn to ignore.

**A role on the first cell of a row governs the row**, which is why tagging four metro sheets,
Totals, Financing, Unit_Economics, the cohort sheet, Sources and the README cost about forty edits
rather than four hundred. The alternative — inferring structure in the writer from a row's shape —
was rejected because a prose row and a section heading are the same shape (one string in column A,
nothing beside it), and a rule that cannot tell them apart formats every explanatory paragraph as
a heading.

**No row was added, moved or removed.** `rowOf()` resolves cross-sheet formulas by LABEL and
`totalsSheet` addresses metro sheets by row number, so a presentation change that shifted a row
would silently repoint a formula. The role helpers keep `v` byte-identical, so both resolvers see
what they always saw.

What a reader now gets: a dark-teal title band per sheet, tinted section headings, prose merged
across the sheet in muted italic so it cannot be clipped at column A's edge, subtotals with a rule
above them, the headline row of each block tinted, the label column and header row frozen,
per-sheet column widths measured from the content (excluding merged prose rows, or one 90-char
sentence would set column A's width), grouped tab colours, landscape fit-to-one-page-wide print
setup, and losses as red bracketed accounting figures.

Colours are the DragonCandy tokens from `docs/DESIGN_SYSTEM.md`, not picked to taste. The header
fill is `dc-teal-btn` **#0F766E**, the dark teal the design system reserves for fills, for the same
reason it is used behind white text there: the bright brand teal #4DD9C0 is ~1.6:1 against white
and unreadable as a header. The design system records that trap as "dark-fill-as-text"; a
spreadsheet header is the same mistake one medium over.

### Two of these are not cosmetic

**The Assumptions value column had NO number format.** The sheet a reader is told to edit showed
`0.029` for a 2.9% Stripe fee and `0.005` for a half-percent Manhattan penetration — the two
figures most likely to be mistyped by an order of magnitude, displayed in the form that makes the
mistake invisible. Formats are now derived from the registered UNIT: `fraction` → `0.00%`, `USD*`
→ `$#,##0.00`, `calendar` → `0`, everything else → `#,##0.###`. The percent format also makes the
edit natural — typing `8%` into a percent-formatted cell stores 0.08, where typing it into a
General cell stores text. `calendar` is special-cased AHEAD of the numeric fallback because 2026
is a year and `#,##0` renders it `2,026`.

**The editable cells are now visible as editable.** The Assumptions values and the Totals YES/NO
toggles carry a boxed amber fill, and nothing else does. A test asserts exactly two sheets ever
hold an `input` cell: the README promises two editable surfaces, and a third would be a promise
nothing made.

### The control

`scripts/lib/workbook-theme.test.ts` enforces one rule: **presentation may not change a value.**
It builds the spec, writes it the way the generator does, applies the theme, then reads every cell
back and compares to the spec — over a thousand cells, with a floor asserted so the check cannot
pass on an empty workbook. It also pins that a number format's POSITIVE section is byte-identical
to the spec's, because a format is presentation fully capable of lying: `0.029` shown as `3%`.
`withNegativeStyle` therefore only ever appends a negative section, only to `$` formats, and never
to a format that already declares its own sections (which has said what it wants).

### Found and not fixed

A formula cell whose cached result is **zero** reads back from exceljs with the result missing.
This predates the change — the real writer has always behaved this way — and it is harmless in
Excel and Sheets, both of which recalculate on open. It matters only to something that trusts a
cached value without recalculating. The test records it rather than papering over it.

## Files

- `src/pitch/model/confidential.ts` — four budget lines replace two; `TECH_TEAM_ROSTER` source.
- `src/pitch/model/workbook.ts` — `CellRole`, role helpers, `assumptionFormat`, ~40 tagged rows.
- `src/pitch/model/workbookProvenance.test.ts` — needle repointed, control added.
- `src/pitch/model/consolidated.ts`, `sharedCost.ts` — comment figures restated to the new roster.
- `scripts/lib/workbook-theme.ts` (new), `scripts/lib/workbook-theme.test.ts` (new).
- `scripts/generate-financial-model-xlsx.ts` — calls `applyTheme` after values are written.
- `docs/PROJECT_CONTEXT.md` §3, `docs/DragonCandy_Capital_Raise_Cost_Model.md` §5,
  `docs/wiki/analyses/north-star-kpi-scorecard.md`,
  `docs/wiki/analyses/part-1-engineering-aios-operations.md`,
  `docs/wiki/concepts/investor-pitch-deck.md`.

## Open, for a founder

1. Which four people Year 2 and Year 3 actually hire, now that Year 1 is a count of seven.
2. Whether a raise $8,756 inside the top of the intended band is acceptable, or whether the band
   moves.
