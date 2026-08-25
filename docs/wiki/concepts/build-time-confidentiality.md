---
title: Build-Time Confidentiality
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-investor-deck-plan-b.md]
tags: [security, vite, bundling, pitch-deck, sourcemaps]
---
# Build-Time Confidentiality

How to keep a figure out of a public JavaScript bundle, and why the obvious ways don't.

Written from the investor deck's ask slide ([[Investor Pitch Deck & Capital Raise]]), where the
pre-seed budget and the derived raise had to be absent from the default build — `/pitch` is a lazy
chunk anyone who guesses the URL can fetch until the edge gate ships ([[Site Access Lockdown]]).

## A runtime check is not confidentiality

Gating on `is_internal_user()`, a session, or a query string still ships the numbers inside the
public JavaScript and merely declines to paint them. That is a `display: none` on a value an
investor's engineer reads in ten seconds. It also breaks the delivery path: the PDF exporter drives
an **anonymous** headless Chromium, so an auth gate produces a PDF with the financials blanked out.

## Two mechanisms are needed, and each was learned by failing

### 1. `import.meta.env.VITE_X` does not fold when X is unset

Vite statically replaces an env key it knows about. An **unset** key stays a runtime property
lookup on `import.meta.env`, so `undefined === '1'` is evaluated in the browser, neither branch is
dead, and Rollup keeps the module. The build where the variable is unset is precisely the public
build — so the mechanism fails exactly where it is needed.

Use a `define` in `vite.config.ts` instead. It is substituted unconditionally, the ternary folds,
and the dead branch goes.

### 2. Dead-code elimination does not clean the sourcemap

With the branch folded, the emitted JavaScript really was clean — and `sourcesContent` in
`PitchDeck-*.js.map` still carried the entire budget, every salary line included, because the
module remained in the graph. **Sourcemaps are deployed and fetchable.**

Swap the module at **resolution**: alias the specifier to a stub in public builds. Nothing enters
the graph, so there is nothing for a sourcemap to embed. Keep the folded constant too — the two
guards fail independently, and the assertion below says which.

## The assertion, and why it needs controls in both directions

`npm run pitch:verify-public` builds the default bundle and scans `dist/` — `.js`, `.css`, `.html`
**and `.map`** — for every confidential value.

- **A "clean" result is also what you get from an empty directory, a stale build, or a wrong
  glob.** So the script first searches for strings that MUST be present in any real build and
  refuses to report clean unless it finds them.
- **The inverse control matters just as much**: scanning a `VITE_PITCH_CONFIDENTIAL=1` build must
  find the values. It reports 12; the default build reports 0. Without that, "clean" could mean the
  needles are wrong.

## Pick needles that can identify a value

The first version reported six leaks in a bundle that had none — `"10000"` matched inside a Stripe
test routing number, and `"2000"` matches roughly anything. **Six false positives in a report whose
job is to be believed is worse than six missing checks**, because the next reader sees "LEAK" and
stops reading.

Use distinctive strings (labels) and large specific totals; a round four-digit salary is not
checkable this way and should not be pretended to be.

**And know which of your needles can fire at all.** The derived totals here never appear in the
bundle even when confidential, because the page computes them in the browser from the budget lines
— their digits are never a literal. They are worth keeping against a future change that inlines a
total, but the **labels** are the load-bearing check. A needle that cannot fire looks exactly like
one that found nothing.

## See Also

- [[Investor Pitch Deck & Capital Raise]] · [[Site Access Lockdown]]
- [[verify_jwt Is Not Authorization]] — the same shape one layer down: a check that looks like a
  control and is not.
