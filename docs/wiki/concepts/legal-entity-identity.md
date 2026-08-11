---
title: Legal Entity Identity
type: concept
created: 2026-08-10
updated: 2026-08-10
sources: [raw/sessions/2026-08-10-legal-entity-public-site.md]
tags: [legal, entity, apple, duns, compliance, terms, privacy]
---
# Legal Entity Identity

The company behind DragonCandy is **Dragon Candy LLC**, Hoboken NJ. Until 2026-08-10 the public
site said so **nowhere** — no copyright line, no company name, no address — and both legal pages
named a *brand* as the contracting party. This page is about which record is authoritative for
which purpose, and the two ways that question is easy to get wrong.

It is **not** a page about the App Store. Apple is what made the gap visible; the rules below apply
to any verifier — payment processors, bank KYC, trademark filings — long after enrollment closes.
For the iOS workstream see [[iOS TestFlight First Build]] and [[Capacitor Native Shell]].

## Where the entity is published

One constant module, `src/lib/legalEntity.ts`, feeds three surfaces:

| Surface | Form | Why that form |
|---|---|---|
| Landing footer | `© {year} Dragon Candy LLC · Hoboken, NJ` | Discreet. City corroborates the D&B locality without a postal block in a marketing footer. |
| Terms of Service | Names the entity in §1; entity + **full address** in §17 | The contracting party must be a company, not a brand. |
| Privacy Policy | Names the entity in the opening; entity + **full address** in §11 | A complete postal address for the controller is standard and expected here. |

The constant exists for the same reason `src/lib/contactAddresses.ts` does: eight scattered mail
literals were eight chances to update seven. **A site whose entity name disagrees with itself is
worse than one that omits it** — disagreement is precisely what a verifier checks, and it fails
silently.

`LegalPageLayout.tsx`'s docstring already said the legal pages exist to *"expose stable, indexable
URLs for App Store Connect"*. They were built for this verification and were carrying none of the
evidence — worth remembering that **a surface can be purpose-built for a job and still not do it**.

## Two official records disagree, and only one governs the website

| Field | IRS CP 575 B (2025-06-02) | D&B / D-U-N-S 139390458 |
|---|---|---|
| Name | `DRAGON CANDY LLC` | `DRAGON CANDY LLC` |
| Street | `33-41 NEWARK ST` — **no floor** | `33-41 Newark St., 5th Floor` |
| City / State / ZIP | `HOBOKEN, NJ 07030` | same |

The site publishes the **D&B** form. Apple's Organization verification matches the **D-U-N-S**
record, and the EIN letter's instruction to use the address *"exactly as shown"* governs **federal
tax filings**, not a website. This is written into `legalEntity.ts` because the trap is asymmetric:
someone who later sees the IRS letter will be tempted to "correct" the site, and that edit would
break the only match that matters while looking like diligence.

**Rule: D&B is the source of truth for anything published; the IRS letter is the source of truth
for tax filings.** They are allowed to differ.

## A governing-law clause is not a state-of-formation claim

The sharpest thing this work produced, because the branch shipped the error before catching it.

An intermediate commit wrote *"operated by Dragon Candy LLC, **a New Jersey limited liability
company**"* into the operative sentence of the Terms. It felt safe: the address is in Hoboken, and
Terms §15 already chose New Jersey law. Both are irrelevant.

- The **IRS CP 575 B** proves the name, that the entity is an LLC, that it files Form 1065
  (multi-member), and a Hoboken **mailing** address. It never states **where the LLC was formed**.
  A Delaware-formed LLC with a New Jersey office is indistinguishable in that document.
- **§15 is a choice-of-law term.** Parties may choose the law of a state they were not formed in;
  that is the ordinary purpose of such a clause. It carries no information about formation.

So the claim rested on an address plus a contract term, neither of which is evidence. The four
words were **removed rather than sourced from an inference**, and `LEGAL_ENTITY_JURISDICTION` was
deleted outright — an unused export is an invitation to re-add the claim. Reinstating it needs the
**NJ Certificate of Formation**.

Generalises past this repo: **a document that is authoritative about several facts is not
authoritative about every adjacent fact.** Ask what the document actually attests, not what it
makes plausible. Same family as the [[Domain Migration (.io → .com)]] probe lesson — *when an
instrument cannot distinguish a true answer from a false one, change instrument* — here the
instrument (an EIN letter) simply never addressed the question.

## Amendment clauses are load-bearing

`LAST_UPDATED` moved June 6 → August 10, 2026 on both legal pages. Terms §16 and Privacy §10 each
commit **in writing** to revising that date when the document is updated, and changing the stated
contracting party is material. Leaving the old date would have made each page contradict its own
amendment clause — a self-inflicted inconsistency on the exact documents a verifier reads.

**Check whether a page makes promises about its own maintenance before editing it.**

## Not published, deliberately

The **D-U-N-S number**, the **business phone**, and the **EIN**. None is what a verifier looks for
on a website; the first two are footer clutter, and the EIN is sensitive and is kept out of the
repo, the PRs and every published page entirely.

## Key Decisions

- **Footer line is a sibling below the existing row, never nested in the logo/tagline cluster.**
  An abandoned earlier draft nested it, which forced that cluster to `sm:items-start` and so
  modified the existing desktop row. As a sibling the change was **10 insertions, 0 modifications**.
  Its container classes mirror the row's exactly, so it *aligns* (text at x=104px, the logo's exact
  left edge) rather than approximating.
- **City-only in the footer, full postal address in the legal pages** — the same tradeoff resolved
  in opposite directions, each where that form is conventional.
- **Landing tokens for the footer, `dc-*` tokens for the legal pages.** The two surfaces are on
  different design systems; the legal pages needed no new styling at all (see [[Light-App Kit]]
  and `DESIGN_SYSTEM.md` § "Marketing + entry's own scoped identity").

## Known Issues

- **State of formation is unestablished.** The Terms deliberately does not say where the LLC was
  formed. Needs the NJ Certificate of Formation to reinstate.
- **The landing footer has never been visually confirmed on prod.** The founder's browser is signed
  in, so `/landing` redirects to `/dashboard/creator`; logging them out to view a public page was
  declined. Closed at bundle level instead — the deployed `legalEntity-*.js` chunk was read
  directly and contains exactly three constants and no jurisdiction constant — but a private-window
  look is the outstanding check.
- **Apple enrollment `5HA89RBHQH` is submitted, not approved.** Whether the entity line satisfies
  the verifier is unknown until Apple responds.
- **Only the landing page carries the footer.** `PublicPageHeader`-based pages and the help centre
  have no footer, so the entity appears on three URLs, not site-wide.

## See Also

- [[iOS TestFlight First Build]]
- [[Capacitor Native Shell]]
- [[Domain Migration (.io → .com)]]
- [[Help Center & Donny Guidance]]
