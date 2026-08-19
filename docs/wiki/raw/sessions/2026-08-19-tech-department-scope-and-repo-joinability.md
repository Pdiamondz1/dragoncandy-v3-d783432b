# Session — Tech department scope of work, and the repo not being safe to hand over

**Date:** 2026-08-19
**Branch:** `feat/tech-department-scope` · **PR:** #451
**Trigger:** A board discussion (Dame / Joe / Adrian Vella, WhatsApp, 2026-08-17→18) about adding
tech staff. Adrian is sourcing (designer Lubo, dev houses Root Codex and Alan Systems, EPAM
pending); Joe is raising the capital. Dame committed in-thread: *"I will put together a tech scope
of work & share it with you guys."*

Adrian's explicit asks: for developers, *"how senior they have to be, what technology, what tech
stack and how you want them to work .. not only in the code but also with qa, release, tickets"*;
for designers, *"we have to give manifesto and product descriptions so they can mock"*, holistic
direction first and specific screens later; and for product, *"someone close to you who can manage
both developer roadmap and designers."*

---

## What this session was actually about

It started as a document and turned into two things, because the audit that produced the document
found that **the repository could not safely be given to anyone.**

That is the durable finding. The hiring plan is the visible artifact; the reason it could not have
been executed on 2026-08-18 is the useful one.

---

## Part 1 — The measured case for hiring

Numbers taken from the repo, not asserted:

| Measure | Value |
|---|---|
| Source files in `src/` | 1,174 |
| Pages | 92 |
| Hooks | 269 (per `npm run docs:scale`) |
| Edge functions | 98 |
| Migrations | 389 |
| Tests | 2,443 across 243 files (145 `src` + 68 `supabase` + 30 `sim`) |
| Commits | 3,299, ~2,500 by Dame; 793 by the `gpt-engineer-app` (Lovable) bot |

Commits per month: Mar 190 · Apr 751 · **May 1,023** · Jun 431 · Jul 142 · **Aug 131**.

**An 87% fall from the May peak.** This is the single most useful number produced this session. It
is not a motivation story — it is the complexity tax of one maintainer on 1,174 files with
production-grade RLS. It reframes the hire from "we would like more people" to "throughput is
already collapsing", and it is verifiable by anyone with the repo.

`docs/PROJECT_CONTEXT.md` §4 had been claiming 73 pages / 206 hooks / 80 edge functions since
2026-06-13 — about a year of drift on the project's own self-description. Refreshed via the
existing `npm run docs:scale`.

---

## Part 2 — The repo was not safe to hand over

Four findings, in descending severity.

### 2.1 `npm run dev` connected a fresh clone to PRODUCTION

Two independent causes, both pointing at `zocahiffooqdybdhguqv`:

1. **`.env` is tracked.** It is listed in `.gitignore` (line 19) but was committed before that rule
   existed, and `.gitignore` does not untrack an already-tracked file. It ships in every clone with
   `VITE_SUPABASE_URL="https://zocahiffooqdybdhguqv.supabase.co"`.
2. **`client.ts` fell back to prod** when the variable was unset
   (`src/integrations/supabase/client.ts:11`).

So the default developer experience was: clone, `npm run dev`, and you are on live customer data
with no warning and no opt-in. Survivable with exactly one developer. Not survivable the day a
contractor is onboarded — which is the thing this very session was planning.

**Fix:** a dev-only guard that throws at import time. Gated on `import.meta.env.DEV`, skipped when
`MODE === 'test'` (or it would have broken all 243 test files), and escapable per-session with
`VITE_ALLOW_PROD_FROM_LOCAL=true`.

**Proven not to change production**, rather than assumed:
- The guard's message is **absent from `dist/`** after `npm run build` — Vite statically replaces
  `import.meta.env.DEV` with `false` and dead-code-eliminates the block. The staging host is absent
  too, so the guard module tree-shakes entirely.
- The prod bundle still resolves to the prod project.
- Test results identical with the change reverted (proven by copying the file aside,
  `git checkout HEAD --`, re-running, and restoring): **50 failures / 3 files either way.**

### 2.2 The guard's first version failed OPEN — caught by Codex

The first implementation compared strings: `SUPABASE_URL === PROD_SUPABASE_URL`.

Codex round 1, [P1]: *"When `VITE_SUPABASE_URL` contains an equivalent production URL such as
`https://zocahiffooqdybdhguqv.supabase.co/` with a trailing slash, this exact string comparison is
false and local development connects to production without requiring the escape hatch."*

Correct, and the most important finding of the session. **A safety control that fails open is worse
than no control**, because it also creates the belief that the hazard is handled. Every one of
these bypassed it: trailing slash, different casing, an explicit `:443`, an added path, a query
string, a fragment.

**Fix:** compare **hostnames**, extracted with `new URL().hostname.toLowerCase()`. Extracted into a
new tested module `src/lib/supabaseEnvGuard.ts` rather than left inline, for two reasons —
`client.ts` creates the client as an import side effect (awkward to unit-test), and `client.ts`
still carries a Lovable-era `// This file is automatically generated. Do not edit it directly.`
header, so keeping the rule in a plain module means it survives a regeneration of that file.

19 tests cover the bypasses above, plus lookalike hosts that merely *contain* the ref
(`zocahiffooqdybdhguqvx.supabase.co`, `…supabase.co.evil.test`) which a substring check would have
wrongly blocked, plus unparseable input which now **fails closed** with its own message.

Codex round 2: clean.

### 2.3 The repo disagrees with itself on a Supabase key name

`.env` and `.env.example` define `VITE_SUPABASE_PUBLISHABLE_KEY`. Every call site reads
`VITE_SUPABASE_ANON_KEY`. `CLAUDE.md`'s env block lists `VITE_SUPABASE_ANON_KEY`.

`client.ts` survived on its hard-coded fallback, so nobody noticed. But five hooks
(`useDonny.ts`, `useInternalUsers.ts`, `useInternalDonny.ts`, `useGoogleWorkspace.ts`,
`useCorrections.ts`) pass `import.meta.env.VITE_SUPABASE_ANON_KEY` **directly into an `apikey`
header with no fallback** — locally that is `undefined`.

Mitigated additively (`client.ts` now accepts either name). **Not fully fixed:** those five hooks
still read the env var directly. Whether production sets `ANON_KEY` was **not verified** — no
Vercel CLI on this machine — but internal Donny works in production, which implies it does.

### 2.4 Nobody could onboard

No `CONTRIBUTING.md`, no architecture map, no first-week guide. `README.md` was 268 lines
describing a product that does not exist: a *"ChatGPT-4o Copilot"*, AI video scene detection,
auto-captioning, and publishing to LinkedIn/Facebook/Twitter. A strong candidate reads that, reads
the code, and concludes the company does not know what it has built.

`docs/product-roadmap.md` was dead — 0 of 72 tasks, describing a `dragon-teal`/Inter/JetBrains-Mono
design system that was never built. Archived with a header rather than deleted.

Node was unpinned: the founder's machine runs Node 26, which shadows jsdom's `localStorage` and
fails 50 tests that CI (Node 24) passes. A new hire's first impression would have been 50 red
tests. `.nvmrc` + `engines` added.

---

## What shipped

**The deliverable:** `docs/DragonCandy_Tech_Department_Scope.md` — goals, the four roles, the
stack, ways of working, compensation by region, and what has to happen before anyone starts.
Section 7 (comp) is marked for removal before forwarding.

**Onboarding:** `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/onboarding/first-week.md`,
`.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{bug,audit-finding}.md`.

**Safety:** the dev guard + `src/lib/supabaseEnvGuard.ts` + 19 tests; `.nvmrc`; `engines`.

**Corrections:** `README.md` rewritten; `docs/runbooks/qa-staging-gate.md` and
`feature-change-workflow.md` corrected from "Lovable auto-deploys prod" to Vercel (true since
2026-07-15); `PROJECT_CONTEXT.md` §4 counts refreshed; `product-roadmap.md` archived.

---

## Decisions taken with the founder

- **One combined document**, not separate hiring and investor versions — one file cannot drift
  against itself, and Joe will show investors all three of this, the cost model, and the staffing
  spec.
- **One senior engineer owns the codebase, contractors work around them.** The named risk is an
  agency doing project work in a 1,174-file codebase with this RLS model and nobody resident who
  owns it.
- **Audit-led first 90 days.** PM and designer at day 0 auditing all three roles; developers at day
  30 joining a real backlog rather than a blank page. **The audit is the onboarding** — each person
  learns the product by auditing it, and the artifact is the backlog.
- **Linear** for tickets, GitHub-synced.
- **Comp included**, by region, marked confidential.
- **Dame stays hands-on**, with the senior hire's explicit success metric being *"ships to
  production without Dame within 60 days."*
- **A paid two-week scoped trial for every hire**, including dev houses — already the company rule
  in the staffing spec, and the only honest way to evaluate an agency.

---

## Gotchas worth keeping

- **`git ls-files --error-unmatch .env` returns `.env`.** A path in `.gitignore` can still be
  tracked. Checking `.gitignore` is not checking whether a file ships.
- **`package.json` is CRLF** (the repo came from Windows). A `JSON.parse` → `JSON.stringify`
  rewrite produced a **137-insertion / 134-deletion** diff for a 3-line addition. Use a slurp-mode
  regex that preserves `\r\n`. `git diff --check` then flags the added lines as trailing
  whitespace — that is CRLF, consistent with the rest of the file, not a defect.
- **Counting test files with `find` needs parentheses.** `find src tests -name '*.test.ts' -o -name
  '*.test.tsx'` silently applies the path list to only the first predicate. It reported 154; vitest
  reported 243. Vitest was right — the gap is `supabase/` (68) and `sim/` (30). **Prefer the
  runner's own count to a hand-rolled one.**
- **A draft can contradict the very document it cites.** The first draft of the scope invented US
  salary bands ($150–190K PM etc.) while also instructing the reader that reconciliation with
  `DragonCandy_Capital_Raise_Cost_Model.md` was mandatory. The cost model has grounded figures
  (Back-End $150K/~$195K loaded, Front-End $140K/~$182K, PM $90–120K). Replaced with those verbatim.
- **Reconciling surfaced a real decision, not just a number.** This plan hires a PM at **month 0**;
  the cost model hires one at **month 6**. That is a direct consequence of making the 90 days
  audit-led, and it changes the shape of the early spend — Joe needs to know.

---

## Deliberately not done

- **`.env` is still tracked**, though it is the root cause of 2.1. Whether Vercel's Production
  scope supplies all five `VITE_` variables — or quietly relies on that committed file for
  `VITE_GOOGLE_MAPS_API_KEY` / `VITE_RECAPTCHA_SITE_KEY` — **could not be verified from this
  machine** (no Vercel CLI, no dashboard access). Untracking it could break Maps and reCAPTCHA in
  production. The guard closes the hazard without needing that answer, so the check was deferred
  rather than guessed.
- **The committed staging password is not rotated.** Recorded in `qa-staging-gate.md` as sitting in
  three tracked files and already flagged compromised. Item 2 of the "before anyone starts" list.
- **The five hooks reading `VITE_SUPABASE_ANON_KEY` directly** were not repointed at the exported
  constant.
- **Not merged.** Merging to `main` is the project's deliberate human ship gate.

## Verification

`npm run build` pass · `npm run typecheck` pass · `npm run lint` 0 errors (120 pre-existing
warnings) · `npm run test` 2,412 pass (+19, exactly the new tests) with the same 50 pre-existing
Node-26 failures · Codex clean at round 2 · CI on PR #451: `verify`, `smoke` **and** `lighthouse`
all green — which independently confirms the 50 local failures are Node-26-only, since CI runs the
full suite on Node 24.
