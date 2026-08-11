# Session — the legal entity, stated on the public site (PR #439)

**Date:** 2026-08-10 (merged 2026-08-11 02:19 UTC, squash `2e492305`)
**Branch:** `feat/landing-footer-legal-entity`
**Driver:** Apple Developer Program **Organization** enrollment `5HA89RBHQH`, submitted 2026-08-10.

## The ask, and what it turned into

The ask was one line in the landing footer. Apple verifies an Organization enrollment partly by
**visiting the company website** and looking for evidence it belongs to the legal entity on the
D-U-N-S record, and dragoncandy.com stated no entity anywhere — no copyright line, no company
name, no address. Confirmed rather than assumed: `grep` over `src/` for the entity name,
`Newark St` and `Hoboken, NJ 07030` returned **zero matches**.

Reading the legal pages turned up something larger than the footer:

- **Neither legal page named the legal entity.** `TermsOfService.tsx` §1 said the Service is
  *"operated by DragonCandy ('DragonCandy,' 'we,' 'us,' or 'our')"* — a **brand name, not a
  company**. `PrivacyPolicy.tsx` defined the controller the same way. A Terms of Service whose
  contracting party is a brand rather than an LLC is a weakness on its own terms. Apple is why
  it was noticed, not why it matters.
- **`LegalPageLayout.tsx`'s own docstring** says the legal pages exist to *"expose stable,
  indexable URLs for App Store Connect"*. They were built for exactly this verification and were
  carrying none of the evidence.

## What shipped

**Landing footer** (`src/pages/LandingPage.tsx`) — `© {year} Dragon Candy LLC · Hoboken, NJ`.

**Terms + Privacy** — the defining sentence of each now names Dragon Candy LLC; both "Contact Us"
sections gained the entity plus the full registered postal address beside the existing `privacy@`.
`LAST_UPDATED` bumped June 6 → August 10, 2026 on both.

**`src/lib/legalEntity.ts`** (new) — `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_LOCALITY`,
`LEGAL_ENTITY_ADDRESS_LINES`.

## Key decisions

**The footer line is a SIBLING below the existing row, not nested in the logo/tagline cluster.**
An abandoned draft from an earlier session had nested it, which forced that cluster's alignment
classes to change (`sm:items-start`) and so modified the existing desktop row. As a sibling the
diff is **10 insertions, 0 modifications** and the existing row is byte-identical. Its container
classes mirror the row's exactly (`mx-auto max-w-6xl` + the same `px-5 sm:px-8 lg:px-12` ramp), so
it *aligns* with the row rather than approximating it — measured: text starts at x=104px, the
logo's exact left edge.

**Discreet city-only in the footer, full postal address in the legal pages.** A complete postal
address for the operating entity is standard and expected in a privacy policy, and it corroborates
the D&B record rather than merely asserting a name; in a marketing footer it is clutter. The two
placements resolve the same tradeoff in opposite directions on purpose.

**A constant, not three literals.** Same rationale as `src/lib/contactAddresses.ts`, which exists
because eight scattered mail literals were eight chances to update seven. **A site whose entity
name disagrees with itself is worse than one that omits it** — disagreement is precisely what a
verifier is checking for, and it fails silently.

**`LAST_UPDATED` had to move.** Terms §16 and Privacy §10 both commit *in writing* to revising
that date when the document is updated, and changing the stated contracting party is material.
Leaving it would have made each page contradict its own amendment clause.

**Not published, deliberately:** the D-U-N-S number, the business phone, and the EIN. None is what
a verifier looks for on a website; the EIN is sensitive and is kept out of the repo entirely.

## The defect this session shipped and then removed

An intermediate commit wrote **"operated by Dragon Candy LLC, a New Jersey limited liability
company"** into the operative sentence of the Terms. The founder then supplied the **IRS CP 575 B**
EIN assignment letter (dated 2025-06-02), and checking the claim against it showed the four words
were an **inference, not a fact**.

What that letter establishes: the name is `DRAGON CANDY LLC` (uppercase in IRS records, as in
D&B), it is an LLC, it files **Form 1065** (multi-member, taxed as a partnership — consistent with
three co-founders), responsible party `JOSEPH CASTELO MBR`, mailing address in Hoboken NJ.

What it does **not** establish: **where the LLC was formed.** It never says. A Delaware-formed LLC
with a New Jersey office is indistinguishable in that document. And the Terms' §15 New Jersey
*governing-law* clause could not stand in either — **choice of law is not a formation claim**.

The four words were removed rather than sourced from an inference, and `LEGAL_ENTITY_JURISDICTION`
was deleted outright — an unused export is an invitation to re-add the claim. `legalEntity.ts` now
records why there is no such constant and what would be needed to reinstate it: the **NJ
Certificate of Formation**.

## The two official records disagree

| Field | IRS CP 575 B | D&B / D-U-N-S 139390458 | Published |
|---|---|---|---|
| Name | `DRAGON CANDY LLC` | `DRAGON CANDY LLC` | `Dragon Candy LLC` |
| Street | `33-41 NEWARK ST` | `33-41 Newark St., 5th Floor` | **D&B form** |
| City/State/ZIP | `HOBOKEN, NJ 07030` | same | same |

The site publishes the **D&B** form and that is correct: Apple matches the **D-U-N-S** record, and
the EIN letter's instruction to use the address "exactly as shown" governs **federal tax filings**,
not the website. Recorded in `legalEntity.ts` so that a future editor who sees the letter does not
"correct" the site and break the only match that matters.

## Verification notes

Typecheck, eslint and `npm run build` clean. Codex second review clean on all three passes.

**Desktop (1280px):** footer row stays `flex-row`; the line's text starts at x=104px, identical to
the logo. **Prod, post-merge:** `/terms` and `/privacy` both verified rendering the entity in the
opening sentence, the full address in Contact Us, and the new date; `/terms` confirmed to carry
**no formation claim** with §15 governing law intact.

**The landing footer could not be rendered on prod** — the browser session is signed in, so
`/landing` redirects to `/dashboard/creator`, and logging the founder out to view a public page was
declined. Closed at bundle level instead: the deployed chunk `legalEntity-BqcumO9L.js` is literally

```js
const L="Dragon Candy LLC",o="Hoboken, NJ",E=["33-41 Newark St., 5th Floor","Hoboken, NJ 07030"];
```

— three constants, **no jurisdiction constant**, proving the removed claim is absent from the
shipped bundle and not merely from source. The `LandingPage` chunk carries the `<p>` with the
intended classes and `new Date().getFullYear()`.

**Mobile was verified by iframe, not window resize.** `resize_window` resizes the window but leaves
`innerWidth` pinned at 1280 in this environment — a resize that does not move the viewport is
*blocked*, not *passing*. Breakpoints were exercised in same-origin `srcdoc` iframes carrying
identical stylesheets and markup: footer at 386px and 316px (column stack intact, `text-center`
applies and `sm:text-left` correctly does not, one line, no overflow); legal address block at 316px
(3 lines, right edge 285px of 316px, no overflow). This tests width media queries — not iOS
safe-area or toolbar behaviour, neither of which applies to static text.

## Files

- `src/lib/legalEntity.ts` (new)
- `src/pages/LandingPage.tsx`
- `src/pages/legal/TermsOfService.tsx`
- `src/pages/legal/PrivacyPolicy.tsx`

No migration, no edge function, no RLS change.

## Left open

- **State of formation is unestablished.** Reinstating "a New Jersey limited liability company"
  needs the NJ Certificate of Formation.
- **Landing footer not visually confirmed on prod** (signed-in session; a private window closes it).
- Apple enrollment `5HA89RBHQH` is **submitted, not approved**.
