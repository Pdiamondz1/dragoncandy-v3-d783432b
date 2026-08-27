---
title: Investor Pitch Deck & Capital Raise
type: concept
created: 2026-06-17
updated: 2026-08-26
sources: [2026-06-17-investor-pitch-deck-cost-model.md, 2026-08-24-investor-deck-plan-b.md, 2026-08-24-launch-events-and-drive-delivery.md, 2026-08-26-investor-financial-model-workbook.md]
tags: [fundraising, pitch-deck, cost-model, raise, donny, brands, provenance]
---
# Investor Pitch Deck & Capital Raise

DragonCandy's investor-facing fundraising assets: a brand-faithful pitch deck and the sourced cost
model that backs its numbers. Target investors: VCs in tech / SaaS / AI / Marketing / Hospitality.
First built 2026-06-17 (branch `worktree-DC-pitch-deck`, PR #111). Modeled on the narrative arc of
the "The Station" template deck (CEO Joe Castelo's prior raise), in the AIOS Workspace Drive.

## The deck (`/pitch`)

- **In-repo HTML/React**, not Google Slides — chosen for pixel-perfect brand fidelity. Lives in
  `src/pitch/` (`PitchDeck.tsx`, `slides/slides.tsx`, `slides/SlideShell.tsx`, `slides/index.ts`).
- **Unlisted + `noindex`**, reachable by URL only, with **no nav / [[Donny AI]] / auth chrome** —
  a single early return in `AppLayout` (`src/App.tsx`) renders it under the top-level providers.
- **15 slides:** Cover, Problem, Solution, Why Now, Product, Market, Model, Traction, GTM, Moat,
  Team, **Vision**, Financials, Ask, Close.
- **Brand rules:** `dc-*` tokens, Outfit/Pacifico, `logo.webp`. **No dragon emoji** (the teal
  mascot logo is fine), **no gray** — brand-adjacent colors only.
- **Fixed 1280×720 canvas per slide.** Adding copy silently overflows (content clips in the PDF
  with no error) — every touched slide must be verified `scrollHeight === 720` (Playwright
  screenshot) before shipping.
- **PDF export:** `npm run pitch:pdf` — self-contained (`vite build` → `vite preview` → Playwright
  captures each slide as a 2× JPEG → hand-rolled image-per-page PDF, deterministic page count). The
  deck renders **only from the production build**, not `vite dev`. `dragoncandy-pitch.pdf` is
  **gitignored** (worktree-only, never in the PR; regenerate from code).

> **REBUILT 2026-08-23/24 and MERGED (#506, #509; then #513, #515).** This banner read "both
> open, neither merged" until 2026-08-24. Everything below the
> next two sections describes the FIRST deck and is kept as history. What changed: the numbers now
> live in a versioned model (`src/pitch/model/`) that the deck, the generated diligence document
> and the interactive artifact all read, the slide order follows the advisor's brief rather than
> the conventional one, and the ask is a **pre-seed on a SAFE**, not the ~$3M priced seed described
> under "The ask". Read "The rebuild" first.

## The rebuild (2026-08-24)

**One source, three consumers.** `src/pitch/model/` holds a provenance-tagged assumptions register
(`MEASURED` / `BENCHMARKED` / `MODELED`, each row carrying an `asOf` and a `source` that is a
command or a file path), the projection, and the derivations. The deck imports it, `npm run
model:doc` generates `docs/DragonCandy_Investor_Model.md` from it, and the interactive Assumptions
Ledger artifact mirrors it. **A slide may not hardcode a figure.**

**Fifteen slides, advisor's order** — the ask lands at slide 7, in the middle, and everything after
it is the evidence for it. Slide 2 has three thesis variants (marketplace / data / SMB software)
picked by a constant before export.

**Three primitives instead of three habits.** `Gloss` renders a jargon term and its plain-English
gloss together, enforced by a test that renders every slide; `Tag` puts provenance on every figure;
`PendingMark` renders a founder input as its answer or as a visibly marked hole, with no third
branch, so an unanswered question cannot be silently omitted.

**The confidential half is absent, not hidden.** The budget, raise and use-of-funds live behind a
build-time gate; `npm run pitch:verify-public` asserts over `dist/`. Two mechanisms are needed and
both were learned the hard way — see [[Build-Time Confidentiality]].

**Delivery is the PDF, not the URL.** `npm run pitch:pdf` produces the sendable deck;
`VITE_PITCH_CONFIDENTIAL=1` adds the money; `PITCH_NOTES=1` produces the presenter's copy with
facing speaker notes under a **different filename** — notes are opt-in against a literal reading of
the spec, because the coaching written for Joe ("do not inflate — an investor checks") must never
reach an investor. Do not send the `/pitch` URL until the site gate (#482) is on.

`npm run pitch:qa` generates `docs/DragonCandy_Investor_QA.md`: every figure, its provenance, and
the honest answer to "how do you know that?".

### What the rebuild caught

- **A provenance tag applied to a COPY is worse than no tag.** Two rows read `MEASURED` while their
  own notes said they had never been checked against prod. They hadn't: registered users were
  **30 → 45**, an investor-facing count understated by a third and certified by the system built to
  prevent that. Found by the Codex second review reading the note rather than the tag.
- **Two consumers of one register will disagree if each does its own arithmetic.** The deck sized
  the runway buffer on the FIRST month's burn (nobody has started in month 1) with a 3-month
  buffer, where the document used the ending burn and 6. $1,157,147 versus $1,462,568, both
  sendable in the same email. One `preSeedRaise()` now. Both figures are the ones the roster of
  the day produced and are left as written; the raise has since moved (below), which is the point
  — the bug was two arithmetics, not two numbers.
- **A text assertion proves a string is present, never that a human can read it.** The gloss on the
  ask slide rendered as invisible text — `GradientText` is `bg-clip-text text-transparent`, and a
  wrapped inline span has no background behind its second line — while the glossary test passed
  throughout on `textContent`.
- **`PROJECT_CONTEXT.md` disagrees with its own generator.** Its "re-counted 2026-08-24" scale line
  says 92 pages / 269 hooks; `scripts/update-scale-numbers.mjs`, which writes that line, counts
  96 / 277. Quote the command.

### A mark asked one question and got the answer to another (#513)

The liquidity slide's founder mark was labelled **"Restaurants in Hoboken:"**. Beside a liquidity
model that phrase says *our supply* as naturally as it says *the town's total*, and it was answered
with ours — **two: Antique Bar & Bakery and Uncle Rocco's**. The model needs the **denominator**:
two restaurants out of forty is a different story from two out of four hundred.

The label now says **town-wide** and the question says what the answer is not. **The durable half
is that a plausible answer to the wrong question looks exactly like progress** — nothing about the
reply flagged it; it had to be noticed.

The founder's answer went into a new **`FOUNDER_FACTS`**, deliberately *not* the assumptions
register: the register's vocabulary is `MEASURED` / `BENCHMARKED` / `MODELED`, and a founder saying
a thing is none of the three. `FounderFact` carries its own `source` and `asOf`, and every consumer
prints them — the deck inline for want of space, the Q&A document in full.

The test's first draft was worthless: it asserted the **slide's** text contained "town-wide" and
**passed against the old label**, because `PendingMark` renders the question and the question says
town-wide. A whole-slide text search cannot tell a label from the thing next to it.

### Three launch events (#515)

Founders stated three: **Hoboken at Antique Lofts**, **Palm Beach at the Colony Hotel**, **Montauk
at a venue not yet chosen**. Recorded as cities and venues and nothing else, because that is all
that was said.

**They are events, not a change to the metro sequence** (Hoboken → Manhattan → Palm Beach, each
gated on density before the next; Montauk is not a metro). Read as three simultaneous market
launches they would contradict the deck's own liquidity slide, which argues that creator-side lag
kills local marketplaces. Read as events they cohere: one network in three places across the year.
**That last clause is an argument, not a finding** — the Q&A document says so in as many words,
because an earlier draft asserted the seasonal overlap as a sourced fact and Codex caught it.

**Nobody has priced them, and the ask is derived from the budget**, whose marketing provision is
scoped to one city. Pricing them moves the raise; omitting them asks for an uncosted plan. Both are
founder decisions, so `launchEventPlan` marks the hole rather than inventing a number.

Explaining that collision in `deck/pending.ts` **failed the confidentiality build**: that module is
in the public bundle's graph, so its strings ship — and so would a comment, via the sourcemap. The
arithmetic lives in `confidential.ts` now. See [[Build-Time Confidentiality]].

### Delivery: `npm run pitch:upload` (#515)

The deck now goes to `DragonCandy — Confidential › 11 · Finance` in one command, via rclone. The
guard worth knowing is that **the wrong build is refused by page count, not by filename** — a
rename defeats a name check, and the notes build is the one file that must never reach an investor.
And the *first* upload put the **redacted** deck there under a name promising the complete one,
because both builds have the same page count and every page is a JPEG. Full mechanics:
[[Drive Artifact Delivery]].

### The numbers moved under the deck (2026-08-26)

The model grew a **bottom-up, multi-metro forecast** — Census venue counts × penetration × live
pricing — and the three-year band in `PROJECT_CONTEXT.md` §3 was **restated from it**. The deck's
financials slide reads from that, and an editable `.xlsx` with live formulas now ships alongside
the PDF. Two things a deck reader will ask about:

- **The plan and the model agree on reach and disagree on price.** Every metro count lands inside
  the plan's own band; the gap is ARPU, and the model is low *by construction* because it books two
  of the four revenue streams. The superseded band is **not refuted; it is unproven.**
- **"Revenue" was three quantities** — booked, exit ARR, and steady-state at N — and separating them
  is what surfaced the $400K/employee kill-switch's unstated ambiguity.

The **eleven** live documents carrying the old band were restated, and `docConsistency.test.ts` now
fails any live doc that quotes it unmarked. **Two of those documents are generated**
(`DragonCandy_Investor_Model.md`, `DragonCandy_Investor_QA.md`) and say so in their first three
lines — hand-editing either survives until the next generator run. Full mechanics, controls and the
three open founder decisions: [[Bottom-Up Financial Model]].

### Still outstanding

Four founder inputs, each a marked hole on its slide and printed by the exporter before it writes a
PDF: **SAFE terms**, **real team bios**, a **countable Hoboken restaurant number** (town-wide), and
the **launch-event dates, venue bookings and budget**. Uncle Rocco's status and Adrian Vella's
consent were answered 2026-08-24 — Adrian as a **board member**, not an advisor, which the deck had
understated throughout.

**The raise is $1,491,244** (2026-08-26). It read **$1,462,568** until the pre-seed budget was
re-cut onto the four roles the tech-department plan is actually recruiting — product manager, UX
designer, senior developer, mid-level developer — in place of the back-end and AI engineers it used
to fund, neither of whom appears in that plan or in the outreach sent 2026-08-21. The raise is
computed from the budget, so changing who it funds changes it; nothing was re-sized by hand.

**Read the band margin, not just the figure.** $1,491,244 is inside the intended $500K–$1.5M
pre-seed band by **$8,756**. The old figure cleared it by $37K. The next line item of any size
takes the raise out of the band, and the band is the constraint that has been treated as
comfortable in every prior write-up here — it no longer is.

## The ask (superseded — the first deck's framing)

**~$3M seed** ($2.5–3.5M, ~$12–15M post-money ⇒ ~20–25% dilution), **18-month runway**, use of
funds **50/30/20** = Engineering&Donny AI / GTM&metro expansion / working capital. Presented as a
recommended *range* — valuation/structure (priced vs. SAFE) is a founder/market decision.

## The cost model

`docs/DragonCandy_Capital_Raise_Cost_Model.md` — the defensible basis behind the Ask. Every figure
traces to a repo doc or a cited 2026 external benchmark. Sections:

- **Infra at scale (100→1M users):** grounded 100–1K (Infrastructure Capacity Report), illustrative
  100K–1M; cost-per-user falls at every tier (operating leverage). The AI line is the governor,
  capped at 15% of revenue (sits at 0.2–0.6% in real tiers) — see [[Pricing Architecture]].
- **Donny super-agent R&D (phased):** fine-tuned model + public API + standalone assistant. The
  dominant cost is the AI-developer FTE, not compute — 2026 fine-tuning is cheap (LoRA runs
  $50–300). Ties to the [[Data Flywheel]] and [[Self-Improving App]].
- **Mobile (Apple + Google):** ~$5–10K incremental — [[Capacitor Native Shell]] iOS Phase 1 already
  shipped; [[Payments Split by Surface]] avoids Apple's 30%.
- **Staffing:** hybrid, NYC-loaded, phased over 18 months — the requested roster framed as "what
  the raise buys," explicitly reconciled against the lean staffing plan (a raise funds the team you
  can't yet self-fund; lean rules become gates on the spend). Auto-improvement "agents" modeled as
  compute, not headcount.
- **Brands** (see below) and **sequenced 3-metro marketing** (Hoboken→Manhattan→Palm Beach, each
  gated on density).

## Brands — the high-LTV third side

Brand economics: CAC $1,500–3,500 (3–5 mo payback), 24-mo LTV $24K–72K, ~$800/mo subscription,
**LTV:CAC ~7:1–20:1**. Acquired **founder + AE led, no new hire** (the Brand Partnerships Manager
stays a Year-3 hire); ~$30–50K of brand-specific GTM is absorbed in the GTM bucket, so the **raise
band is unchanged** — brand revenue is upside, not a runway dependency. The brand role remains
behind the `BRAND_ROLE_ENABLED` flag; enabling it is dev time already inside the staffing line.
Woven into the deck's Market/Model/Financials slides rather than a separate slide.

## Vision — Donny as a super-intelligence, built to adapt

A dedicated slide sells the upside: Donny's trajectory **copilot → autonomous super-agent → AGI-
adjacent self-improving agents**, paired with the adaptability thesis — **model-agnostic routing**
(adopt the best/cheapest model the day it ships, backend-only via the `_shared/model-routing`
seam), **provider-independent** (Anthropic + OpenAI today, any frontier lab tomorrow), and **owns
its data** (proprietary flywheel → fine-tune our own models). As frontier AI accelerates,
DragonCandy gets smarter and cheaper automatically instead of being disrupted. This is the [[Data
Flywheel]] and [[Self-Improving App]] told as a fundraising narrative.

## See Also

- [[Investor Pitch Deck & Cost Model Session]] · [[Bottom-Up Financial Model]] · [[Build-Time Confidentiality]] · [[Drive Artifact Delivery]]
- [[Pricing Architecture]] · [[Take-Rate Ladder]] · [[Data Flywheel]]
- [[Donny AI]] · [[DragonDash]] · [[DragonShare]]
- [[North Star & KPI Scorecard]] · [[Self-Improving App]] · [[Musk's Algorithm]]
- [[Capacitor Native Shell]] · [[Payments Split by Surface]]
