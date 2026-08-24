# Session — Investor deck Plan B (2026-08-24)

Branch `feat/investor-deck`, stacked on `worktree-DC-pitchdeck` (Plan A, PR #506). PR #509.

## What this session was

Plan A — the investor financial model — had been built on 2026-08-23 and left **unmerged and
unpushed**: 25 commits sitting only in local git. The founder asked to "finish the pitch deck".
So: land Plan A, then build Plan B (the deck itself) against it.

Founder decisions taken at the start:
- The five §8 founder inputs are **not** blocking. Build the deck with visibly marked TBD slots.
- Land Plan A as its own PR first rather than one large PR.

## Plan A landed

Pushed as `worktree-DC-pitchdeck`, PR #506. `npm run typecheck` and `npm run build` verified on the
merged tree before pushing.

## Plan B built

Fifteen slides in the spec's §6 order, importing `src/pitch/model/`. Three primitives make the
spec's promises structural: `Gloss` (term + plain-English gloss render together, enforced by a
render-level test), `Tag` (provenance on every figure), `PendingMark` (a founder input renders as
its answer or as a marked hole — no third branch).

Plus: speaker notes as data with an opt-in facing-page PDF export, `docs/DragonCandy_Investor_QA.md`
generated from the model, and the fine-tune unit restated at source.

## Findings worth keeping

### The confidentiality gate failed twice, and only an assertion over `dist/` said so

The spec specified `import.meta.env.VITE_PITCH_CONFIDENTIAL`. **Vite only folds an env key that is
SET** — and the build that matters is the one where it is unset, so the comparison stayed at
runtime, neither branch was dead, and every budget line shipped in the public bundle behind a false
condition. Replaced with a `define`.

That fixed the JavaScript and **not the sourcemap**. The module was still in the graph, so
`sourcesContent` in `PitchDeck-*.js.map` carried the entire pre-seed budget, every salary line
included. Sourcemaps are deployed. Closed by aliasing `@pitch/confidential` to a stub so the real
module never enters the graph.

Both were found by `npm run pitch:verify-public`, which scans `.map` as well as `.js` and refuses
to report "clean" until it first finds strings that must be present. Its first version also
reported six leaks that were not leaks — `"10000"` matched inside a Stripe test routing number — so
the needles are now labels and seven-figure totals, never bare round integers.

**A later finding sharpened this:** the derived-total needles cannot fire at all, because the deck
computes the raise in the browser from the budget lines and its digits never exist as a literal in
`dist/`. The **labels** are the load-bearing check — 12 found in a confidential build, 0 in the
default one. A needle that cannot fire looks exactly like one that found nothing.

### Two defects that no test could see

Opening all fifteen exported pages, rather than counting them:

- The **on-screen navigation was composited into every captured slide**. `pitch-print.css` hides
  `.pitch-controls` under `@media print`, and a screenshot is not a print; an element screenshot
  captures the page pixels in that box including anything painted over it. Pre-existing — every
  deck this exporter has ever produced had buttons on it.
- The gloss on the ask slide rendered as **invisible text**. `GradientText` is
  `bg-clip-text text-transparent`, and an inline span that wraps has no background behind its
  second line. The glossary test passed throughout, because it reads `textContent`, which cannot
  see a thing that renders as nothing.

Durable: a text-level assertion proves a string is present, never that a human can read it.

### Codex found a $305K arithmetic error nothing else would have

The ask slide passed `budgetTotal(PRE_SEED_BUDGET, 1)` — the **first** month's burn — into a
parameter named `endingMonthlyBurn`, and applied a 3-month buffer where the generated document
applied 6. In month 1 neither engineer has started (back-end month 3, AI month 4), so that figure
is $27,507 against the $64,657 the company actually costs to run when the money runs out.

The deck said **$1,157,147**; the diligence document said **$1,462,568**. A founder could have sent
both in the same email. Both now call one `preSeedRaise()`.

The lesson is the parameter name: it said exactly what it wanted, the call site handed it something
else, and nothing type-checks intent when both sides are `number`.

### A provenance tag applied to a copy is worse than no tag

`payingCustomers` and `registeredUsers` were tagged `MEASURED`, sourced to `PROJECT_CONTEXT.md` §4,
and carried notes saying in as many words that they had never been confirmed against production.
Codex read the note rather than the tag. Checked against prod: **registered users 30 → 45**. An
investor-facing count understated by a third, certified by the system built to prevent exactly
that.

Same class as the codebase-scale rows corrected earlier the same session: `PROJECT_CONTEXT.md`'s
own "re-counted 2026-08-24" line says 92 pages / 269 hooks, and **disagrees with
`scripts/update-scale-numbers.mjs`, which generates it** (96 / 277, confirmed by `git ls-tree` on
`origin/main`). A figure that reproduces from a command beats a figure a human typed while
correcting someone else's typing.

### One deliberate departure from the spec

§7 says speaker notes print "as a facing page in the PDF export", unqualified. Taken literally, the
one artefact Joe sends an investor carries the coaching written for him — "do not inflate, an
investor checks". Notes are therefore **opt-in** (`PITCH_NOTES=1`) and land under a different
filename. The spec's intent is met by the copy he presents from.

## State at end of session

- PR #506 (Plan A) and PR #509 (Plan B, stacked) both open, neither merged.
- Codex clean at round 4; four findings across three rounds, all real.
- 3,228 tests in 291 files, typecheck and build green.
- The corrected raise is **$1,462,568** — inside the spec's $500K–$1.5M band by $37K.
- The five founder inputs remain outstanding by design; each is marked on its slide and printed by
  the exporter before it writes.
