---
title: Google Workspace Signatures Wave 1 Session
type: source
created: 2026-08-20
updated: 2026-08-20
sources: [2026-08-20-google-workspace-signatures-wave-1.md]
tags: [google-workspace, email, branding, apps-script, session]
---

# Google Workspace Signatures Wave 1 Session

Session of 2026-08-20 on branch `worktree-dc-google-workspace` (11 commits, Codex clean).
The founder had set up DragonCandy's Google Workspace and asked for it to be organised "like
an official cool corporate workspace" — Drive structure, documents, email signatures,
branding. Brainstormed to a spec, planned Wave 1, executed the four tasks an agent can do.

**The status split is the most important thing about this session.** The *code* half shipped;
the *admin console* half — two shared drives, nine Google Groups, `adrian@`, the service
account with domain-wide delegation — cannot be performed by any agent, connector or API
available to a session, and is pending the founder. Nothing here is live.

## Key claims

- **Webfonts do not render in email at all.** The brand type system cannot appear as text in
  a signature under any circumstances — only inside an image. Signatures are Arial.
- **Outlook for Windows uses the Word engine**, so `logo.webp` was unusable; PNG exports with
  the alpha channel preserved were required, because dark-mode auto-inversion turns an opaque
  mark into a glowing slab.
- **Google Workspace has no built-in signature management.** The Gmail API plus a service
  account with domain-wide delegation is the only first-party mechanism; the admin console's
  *Append footer* appends below the quoted thread and is not a signature.
- **A Google Group is not a send-as identity.** Converting the shared aliases to Groups — a
  requirement of the same plan — removes them from every user's send-as list, so the
  installer would report success while installing zero address-bearing signatures. Found by
  the Codex second review, which correctly refused an earlier documentation-only fix.
- **In a Google shared drive, folder permissions can only ADD access, never remove it.** A
  drive member sees every folder in that drive. This forced two shared drives instead of the
  one originally chosen — otherwise incoming developers could read the cap table, comp bands
  and offer letters.
- **Three founders' titles were stale in nine repo files**, including `src/pitch/slides` (the
  live investor deck, where all three were wrong) and all four `docs/hiring/` documents that
  Adrian forwards to candidates, telling applicants they report to a CPO who is the CTO.

## Notable quotes

> The image is never load-bearing. No name, title, address or contact detail exists only
> inside a picture. Strip every image and the signature is still complete.

> A 200 is not proof of a resource — `dragoncandy.com/brand/dc-mark-104.png` returns HTTP 200
> serving `index.html` before the asset deploys, because of the SPA catch-all.

> No API, admin or script can do the re-adding. Gmail requires the account holder to complete
> send-as verification.

## Deliberately not done

`docs/DragonCandy_Org_Staffing_Plan.html` still says "Shareholder & Advisor". Its labels
encode a working arrangement across a three-phase org chart, not a title; correcting it is a
content decision for the founder, and a pattern-match sweep would have destroyed the
document's meaning.

Historical records — `docs/superpowers/**`, `docs/wiki/raw/**`, `docs/archive/**` — keep the
old titles, on the repo's established rule from the domain migration: *undated present-tense
claims move, dated and historical text stays.*

## Open assumption

Two dated bylines ("Written 2026-08-19 by Damon 'Dame' Williams, co-founder & CPO") were
corrected on the assumption the repo recorded the title wrongly all along, rather than the
title having changed this week. If it genuinely changed on 2026-08-20, those two now overstate
when Dame became CTO.

## See Also

- [[Workspace Email Signatures]] — the durable synthesis of this session
- [[Legal Entity Identity]] — the registered address the shared-mailbox signatures carry
- [[Local/Production Boundary & Repo Joinability]] — the hiring-driven audit that led here
