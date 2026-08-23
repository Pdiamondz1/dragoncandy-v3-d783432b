# Investor Deck & Financial Model — Design

**Date:** 2026-08-23
**Status:** design approved in chat; spec awaiting founder review
**Owner:** Damon Williams (build), Joe Castelo (presents), Adrian Vella (reviews)

---

## 1. Why this exists

Joe is raising capital. Adrian Vella reviewed the story line
(`DragonCandy_Story_Line_Pitch_v4.pdf`, Drive `1ofRmQpA9UYm9Rk9-rCtCZBAoMfZOmLOX`) and
approved it as the "Manifesto" — his words: *"I actually wouldn't add much more narrative.
Seven pages is enough."* He then named the next workstream precisely:

> "The next workstream should now be evidence and numbers... Product → some usage →
> economics → scale."

and asked for two assets: the Manifesto (done) and a **fundraising deck, 12–15 slides,
~70% visual/data**, plus **two models** — one showing growth trajectories, one showing
"top line, opex and EBITDA".

This spec covers the numbers and the deck. It does not touch the story line, which is
finished.

## 2. What already exists, and what is wrong with it

**The deck exists.** `src/pitch/PitchDeck.tsx` renders a 15-slide deck at `/pitch` from
`src/pitch/slides/slides.tsx` (713 lines): Cover, Problem, Solution, WhyNow, Product,
Market, Model, Traction, GTM, Moat, Team, Vision, Financials, Ask, Close. It is
lazy-loaded (`App.tsx:40`), bypasses AppShell, and prints one landscape 16:9 page per
slide via `pitch-print.css`.

**Most of the numbers exist.** `docs/DragonCandy_Capital_Raise_Cost_Model.md` (353 lines)
and `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md` (809 lines) already answer
roughly eleven of Adrian's sixteen questions: CAC by channel and customer type, LTV,
payback, gross margin, the infra scaling curve, a three-year forecast, an 18-month budget
and a use-of-funds split.

**They have gone stale, and that is the problem this design is built around.** Verified
2026-08-23:

| Claim in the docs | Reality |
|---|---|
| Burn is `$390/mo` (cost model §2.1) | `$572/mo` — Outstand rose $67 → $249 |
| Supabase is `$25/mo` (briefing §5) | `$45/mo` |
| "Toast POS integration" is live (briefing §5) | Never existed. Six `toast-*` functions all answer `toast_not_configured` 503; zero `%toast%` tables on prod |
| "Current pricing" is `$199/$499/$999`, flat 5% (briefing §3) | Stale. The hybrid ladder shipped in May |

None of these failed loudly, because prose cannot fail. That is the single most important
input to this design.

**Live pricing is the ladder, and it is MEASURED.** `docs/STRIPE_PRICES.md` (updated
2026-05-20), `supabase/functions/_shared/platform-fee.ts` and migration
`20260507000001_add_take_rate_and_campaign_limit.sql` all agree:

| Tier | Monthly | Annual (20% off) | Take rate | Active campaigns | Donny actions/mo |
|---|---|---|---|---|---|
| Free | $0 | — | 10% | 1 | 50 |
| Starter | $149 | $119 | 7% | 3 | 500 |
| Growth | $449 | $359 | 5% | 10 | 2,000 |
| Pro | $899 | $719 | 3% | Unlimited | 10,000 |
| Enterprise | Custom | Custom | 2% | Unlimited | 50,000 |

Plus per-seat add-ons ($29/$39/$49), delivery premiums (Express $25, DragonDash $75) and
rush surcharges ($25–$50). Four stacked revenue streams, all live in code.

### 2.1 The codebase figures were stale too, and one of them is ambiguous

`PROJECT_CONTEXT.md` §4 claims 92 pages / 269 hooks / 100 edge functions; the hiring
outreach quoted 1,186 source files and 2,481 tests; the site-lockdown entry says 2,756
tests. Counted directly on 2026-08-23:

| Figure | Value | Command |
|---|---:|---|
| Page components | 95 | `find src/pages -name '*.tsx' \| wc -l` |
| Hooks | 274 | `find src/hooks -name '*.ts' -o -name '*.tsx' \| wc -l` |
| Edge functions | 104 | `ls -d supabase/functions/*/ \| grep -v _shared \| wc -l` |
| TypeScript source files | 1,182 | `find src -type f \( -name '*.ts' -o -name '*.tsx' \) \| wc -l` |
| Migrations | 402 | `ls supabase/migrations/*.sql \| wc -l` |
| Tests / test files | 2,857 / 262 | `npx vitest run` (all passing) |

**A `MEASURED` row must record its counting method, not just its number.** "Pages" returns
**69** counting only top-level `src/pages/*.tsx` and **95** counting recursively. Both are
defensible; a number without its command is not reproducible, and the next person to count
will conclude it drifted when it did not. Hence the `source` field in §4.1 stores the
command or file path, never a prose description.

## 3. Decisions taken

1. **Every number carries a provenance tag** — `MEASURED` (real production or invoice
   data), `BENCHMARKED` (sourced external comparable, cited), `MODELED` (our assumption,
   driver shown). No modeled figure appears without its inputs visible on the same slide
   or one click away.
2. **Repo is the source of truth.** Numbers live in versioned code; the prose document and
   the interactive model are generated from it; the deck imports it.
3. **The round is a pre-seed on a post-money SAFE**, not the priced $3M seed the existing
   cost model recommends. Size is derived bottom-up from a rebuilt budget, not picked.
   Nothing is committed and the deck says so.
4. **The fine-tune threshold is defended, with the unit restated** — labeled examples per
   task, not campaigns. Adrian's challenge is answered rather than dodged.
5. **Nameable proof points:** Antique Bar & Bakery (design partner / first client),
   Uncle Rocco's (second launch restaurant), Adrian Vella (advisor). Nothing else is named.
6. **Deck order follows Adrian's brief**, not the conventional VC order — the ask lands at
   slide 7, not slide 14.
7. **Pricing shown is what the app charges today.** No aspirational pricing.

## 4. Architecture — one source, three consumers

### 4.1 The model

Three new files under `src/pitch/model/`:

- **`assumptions.ts`** — the register. Every driver is a named export carrying
  `{ value, unit, provenance, source, note, asOf? }`. `asOf` is required on every
  `MEASURED` row and forbidden elsewhere.
- **`project.ts`** — pure functions over the register. `projectMonth(n, assumptions)`
  returns restaurants, creators, GMV, subscription revenue, take-rate revenue, other
  revenue, total revenue, cost of revenue, gross margin, operating expense, EBITDA, cash
  and runway. No I/O, no dates, no randomness.
- **`derive.ts`** — the specific views: Hoboken liquidity, the 100/1,000/10,000 business
  steps, the three-year trajectory, and the pre-seed budget.

### 4.2 The three consumers

- **Deck slides** import constants. A slide may not hardcode a figure.
- **The interactive model** — an Artifact with sliders on the primary drivers, so Adrian
  and any investor can move an assumption and watch revenue, EBITDA and runway respond.
  Generated from the same functions.
- **`docs/DragonCandy_Investor_Model.md`** — written by `npm run model:doc`. A generated
  file. It carries a header saying so, and editing it by hand is pointless.

### 4.3 The tests, because a source of truth nobody checks is just a longer document

`src/pitch/model/model.test.ts` asserts:

1. Use-of-funds buckets sum to the raise.
2. Category lines sum to the operating subtotal.
3. AI spend stays at or under 15% of revenue at every modeled point (the standing cap in
   `PROJECT_CONTEXT.md` §8).
4. **Every `MEASURED` row's `asOf` is under 90 days old.** This is the direct answer to
   the Outstand incident — the burn figure was wrong by ~$182 for an unknown stretch
   because nothing re-reads an invoice. CI now does the remembering.
5. No slide string contains a jargon term from the glossary list without its gloss
   present on the same slide (see §7).

### 4.4 Confidentiality

`/pitch` is a lazy chunk, publicly fetchable by anyone who guesses the URL until the edge
password gate ships (PR #482, built and reviewed, **not merged and not switched on**).
The current slides are tolerable in public; a full P&L and SAFE terms are not.

Therefore the deck renders in two layers. The public-safe layer (story, product, market,
team) renders unauthenticated. The confidential layer — Financials, the Ask, the runway
and the unit economics — renders only for an authenticated internal user, using the same
`is_internal_user()` boundary `/internal` already uses. Unauthenticated, those slides
render a placeholder, not the numbers.

**The PDF is the presentation medium, not the URL.** Joe exports the deck while signed in
as an internal user, which is when the confidential layer renders; the resulting PDF is
complete and is what he presents and sends. He never needs to be logged in during a
pitch. The live `/pitch` URL exists for the team and for a demo link, not for delivery.

**Hard dependency: do not send the `/pitch` URL to any investor until #482 is merged and
`SITE_GATE_ENABLED` is on.** Until then, the PDF export is the only sendable form.

## 5. What the model computes

### 5.1 Carried forward with fresh provenance

CAC by channel and by customer type (restaurant $500–1,500, creator $50–200, brand
$1,500–3,500); payback (4–6 months restaurant, 3–5 brand); LTV; gross margin; the infra
scaling curve at 100 / 1K / 10K / 100K / 1M users; the three-year revenue shape ($300–600K
→ $2–4.5M → $7–12M). Each becomes a tagged row, re-derived rather than copied, with the
stale inputs in §2 corrected at source.

### 5.2 Genuinely new work

**Hoboken liquidity.** Nothing in the repo answers this and it is Adrian's sharpest
question. It needs a definition before a number. Liquidity is reached when *a posted
campaign draws at least 3 qualified applicants within 48 hours* **and** *a creator opening
the app sees at least 5 campaigns within range*. Both are computable from our own schema
(`campaigns`, `campaign_applications`, `creator_profiles.lat/lng`) on day one — which
makes this the one forward-looking claim in the deck that converts from `MODELED` to
`MEASURED` the moment we launch. Months-to-threshold then falls out of Hoboken's real
restaurant count and the 3–5 creators-per-restaurant ratio.

**100 / 1,000 / 10,000 businesses.** Revenue, gross margin and EBITDA at each step, with
the tier mix stated as an explicit assumption rather than buried in a blended ARPU.

**EBITDA.** Adrian named it and no existing document states it. Revenue and cost both
exist; the line between them was never drawn.

**The pre-seed budget.** The $3M figure was built for a full team across three metros over
18 months. A SAFE buys something different: Hoboken only, the outsourced engineering
arrangement already in motion (Root Codex / ALAN Systems / Lubo, per
`docs/hiring/outreach-drafts.md`) rather than four FTEs, founder salaries, one metro's
marketing, and the real $572/mo infra line growing with usage. The raise number is the
output of that budget plus a buffer, not an input to it.

### 5.3 The fine-tune claim, defended

Adrian: *"investors with strong AI backgrounds may challenge why 1,000–5,000 is the magic
threshold. Unless Damon can technically defend that number, I'd soften it."*

The number is defensible; the **unit** was wrong. A campaign is not a training example —
it is a causal chain that yields several labeled rows: one brief (intent), N applicants
resolving to one chosen creator (a preference pair), one approve/reject (a quality label),
and one performance record (an outcome). A few thousand campaigns therefore produce tens
of thousands of labeled preference pairs, which is the regime LoRA is sample-efficient in.

The slide states the multiplier, names the three tasks being tuned (match ranking, brief
generation, performance prediction), and cites the LoRA economics already in the cost
model §3.1 ($50–300 a run). The story line's "1,000 to 5,000 completed campaigns" sentence
and the cost model §3.1 trigger are both updated to the restated unit.

## 6. The fifteen slides

Adrian's order. Demo and thesis-alignment are handled as mechanisms, not slides.

| # | Slide | Carries |
|---|---|---|
| 1 | Cover | Name, one line, Hoboken NJ |
| 2 | What we're building | The one-liner and the USP in one sentence. **Three variants** — see §6.1 |
| 3 | The problem | Told from inside Joe's restaurant. Ten years, first person |
| 4 | Why this is different | Content is a supply problem, not a software problem. Competitor grid: marketplaces hand you off, AI tools describe a pizza they have never eaten, agencies serve nobody under $10K/mo |
| 5 | The three supply lines | Hired creators, DragonShare at the table, customer QR |
| 6 | What is actually built | 95 pages, 274 hooks, 104 edge functions, 1,182 source files, 402 migrations, 2,857 tests in 262 files (all green), live payments, three social platforms. All `MEASURED` 2026-08-23 — see §2.1. Carries the demo link and QR |
| 7 | **The ask** | Round size, SAFE with cap, use of funds, $0 committed stated plainly |
| 8 | How the money works | Four stacked streams at live prices. `MEASURED`, cited to code |
| 9 | Unit economics | What one restaurant is worth against what it costs to win. CAC, payback, gross margin |
| 10 | Hoboken liquidity | The definition, the threshold, months to reach it |
| 11 | Hoboken → NYC | 100 / 1,000 / 10,000 businesses |
| 12 | The trajectory | Three-year top line, operating cost, EBITDA |
| 13 | Why it compounds | The ledger, and the fine-tune with the corrected unit |
| 14 | Team & advisors | Joe, Damon, Juwan; Adrian Vella named as advisor |
| 15 | Close | *"DragonCandy is my social media department. Now it's yours."* — Joe Castelo |

### 6.1 Thesis alignment as a swap

Adrian's item 5 — *"if Joe's investor is into data then add that flair"* — is not a slide,
it is a variant. Slide 2 exists in three forms (data/AI thesis, marketplace thesis, SMB
software thesis) selected by a single constant before export. Cheap, because the deck is
already an array of components.

### 6.2 The demo

Adrian's item 4 is the product, not a slide. Slide 6 carries a link and QR to a live
walkthrough. Blocked on the same gate as §4.4.

## 7. Joe must be able to present this cold

A build requirement, not a writing preference.

- **Speaker notes on every slide**, printed as a facing page in the PDF export. Joe can
  present a slide he did not write.
- **No unglossed jargon.** Banning terms is wrong — Adrian asked for CAC and EBITDA by
  name and investors expect them. The rule is that a glossary term may not appear on a
  slide without a plain-English gloss on that same slide. Enforced by test (§4.3.5), with
  the glossary list living beside the model.
- **A one-page cheat sheet** — `docs/DragonCandy_Investor_QA.md`, generated: every number
  in the deck, where it came from, and the honest answer to *"how do you know that?"*
  Adrian's sixteen questions are the questions an investor asks, so the cheat sheet is
  those questions with answers Joe can give without calling Damon.

## 8. Inputs still needed from the founders

These cannot be derived and the build will stop at them:

1. **SAFE terms** — target size within $500K–$1.5M, valuation cap, discount, MFN. The
   budget derives a *need*; the terms are a founder decision.
2. **Team bios with real track records.** Adrian's standard is *"Ex-product at xx",
   "Founding Engineer at [Top L1]", "Ex-JP Morgan"*. What we hold today is Joe (ten years
   running ABB, filmmaker), Damon (builds AI, CTO) and Juwan (shareholder). That is thin
   and will not be invented.
3. **Uncle Rocco's status** — have they agreed to *use the platform*, or only to let us
   use their footage? The slide says different things depending.
4. **Adrian's consent** to be named as an advisor in a document sent to investors.
5. **Hoboken restaurant count** — a countable real number, needed for the liquidity model.

## 9. Out of scope

- The story line / Manifesto. Adrian approved it; it is finished.
- Live Stripe keys or any change to pricing. The deck reports what is live.
- Merging or enabling the site gate (#482). Tracked separately; this spec only depends on it.
- Investor targeting, outreach, or a data room.

## 10. Build sequence — two plans, not one

This is too much for a single implementation plan, and the halves have a real dependency
between them: the deck cannot be written until the numbers are approved, because the deck
is derived from them. So it splits at the founder review gate.

**Plan A — the numbers.** Ends at a gate, not at a deck.

1. `assumptions.ts` register, with every stale input from §2 and §2.1 corrected at source
   and `asOf` stamped, each `source` holding a command or file path.
2. `project.ts` + `derive.ts`, with the tests from §4.3 written first.
3. `npm run model:doc` → `docs/DragonCandy_Investor_Model.md`.
4. The pre-seed budget and the derived raise number.
5. Interactive model artifact, so Joe and Adrian can move assumptions.
6. **Gate:** founders review the model and supply the §8 inputs. Plan B does not start
   until the numbers are agreed and the SAFE terms are known.

**Plan B — the deck.**

7. Deck rebuild to the §6 order, importing the model; confidential layer per §4.4.
8. Speaker notes, glossary test, `docs/DragonCandy_Investor_QA.md`.
9. Correct the fine-tune unit in the story line source and cost model §3.1.
10. PDF export; Codex second review; `knowledge-sync`.

## 11. Risks

- **The stale-input class recurs.** Mitigated by the `asOf` test, which is the only
  mechanism here that fails loudly. It is also the only one that can be disabled by
  someone in a hurry.
- **A pre-seed sized bottom-up may exceed $1.5M.** If the honest budget does not fit the
  round, the answer is to cut scope (one metro, later hires), not to shave the budget.
- **Almost everything is `MODELED`.** Zero paying customers, ~30 organic users, Stripe in
  test mode. The provenance tags make that visible rather than hiding it, which is the
  point — but a deck where most rows read `MODELED` is an honest deck about an early
  company, and Joe should expect that conversation rather than be surprised by it.
- **The deck depends on the site gate** for both the demo link and the confidential layer.
