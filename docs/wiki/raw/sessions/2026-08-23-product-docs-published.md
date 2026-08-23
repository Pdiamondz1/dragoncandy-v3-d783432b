# Session — 2026-08-23 · Publishing the product docs, and the distinction that gated it

Raw session source. Immutable.

## What was asked

"Let's do the remaining tasks" — the four items left open after the signature-alert work.

## The one that produced a durable lesson

`01 · Product` in the open shared drive was empty. Two candidate documents existed and both were
stale, which was expected and is what a dated banner is for.

**What gated publication was not staleness.** `product-vision.md` line 15 described Dame as a
"solo technical founder", and neither document mentioned Joe Castelo or Juwan Robinson anywhere,
while `PROJECT_CONTEXT.md` §1 lists them as CEO and Shareholder. Joe can read that drive and
Adrian will.

**Stale is a different problem from wrong-about-people.** Old numbers can be dated and published.
A document that erases two co-founders cannot. Escalated to the founder, who chose to fix the
founder section and publish (#468).

## Then a second cut of the same distinction

Reviewing for publication found three sections that are not merely old but **actively contradicted
by the shipped system** — a reader acting on them builds the wrong thing:

- **product-vision §5** specifies one dark-mode-first Inter/JetBrains system with `dragon-*`
  tokens. Nothing shipped uses them. Most urgent of the three: **a designer is being hired, and
  this is the document they would read first.**
- **PRD §2** says Lovable.dev deploys production. Vercel has, since 2026-07-15.
- **PRD §3** defines `gig_assignments`, `creative_briefs`, `content_deliverables`, `payments`,
  `notifications` — none of which exist — and roles `creator`/`business`/`brand` rather than
  `content_creator`/`business_client`/`brand`.

A banner handles stale. A **SUPERSEDED note pointing at the authoritative file** is what a
contradicted section needs. (#470)

## Codex caught me making the same mistake I was fixing

Round 1 of the SUPERSEDED note said "the app is light, `dc-*` tokens, Outfit/Pacifico". True of the
authenticated app; **false for the landing** (dark, video-led, Bricolage Grotesque / Instrument
Sans / Silkscreen) and for `/internal`. I had replaced one wrong design summary with another.

The fix was to stop summarising: the note now says the system is **surface-specific**, sends the
reader to `DESIGN_SYSTEM.md`, and says explicitly not to trust any one-line summary — *because a
summary of that file is how §5 came to be wrong in the first place.*

## Two smaller findings

**The main checkout was not on `main`.** It sat on `codex/new-UX-flow` at `2c87ba99`, six merges
back, while `main` was checked out in this worktree. The `refresh-main` instruction given earlier
would have fast-forwarded the **Codex review branch** instead. Closed by detaching this worktree's
HEAD, freeing `main` — and `main` is already at `origin/main`, so the main checkout needs only a
`git checkout main`, not a merge. Consequence worth knowing: a checkout does **not** fire the
`post-merge` hook, so the RAG sync must be run by hand.

**A CRLF trap.** The first commit of #468 normalised both documents from CRLF to LF as a side
effect of the Python editing script — **3,584 lines rewritten to change 24**. Codex caught it; the
commit was reset and redone with `newline='\r\n'`. Worth remembering for any script-driven edit of
the Windows-era files in this repo.

**A Lighthouse flake, correctly diagnosed rather than chased.** #470 failed with performance `NaN`
across all three runs on `/landing` — on a docs-only change that cannot touch the landing page.
`NaN` is a page-load failure, not a score regression. Re-ran unchanged; passed.

## Not done, and why

- **`sendTestAlert()` still has not been run.** The Apps Script editor's function dropdown reverted
  its selection three times (a re-rendering "signed in as" popup swallowed input, and Escape
  cancelled the selection), so a Run click executed `installAllSignatures` instead — harmless,
  it is idempotent, but not the test. Stopped after three attempts rather than looping.
- **Joe and Juwan's sign-in status** — the admin console demanded a password re-auth.
- **`refresh-main` and worktree cleanup** — the worktree isolation guard blocks `git -C` into the
  main checkout and into sibling worktrees. Analysis done, execution is the founder's.

## Durable lessons

**Stale, contradicted and wrong-about-people are three different problems with three different
remedies.** A date fixes the first. A pointer at the authoritative file fixes the second. Only a
rewrite fixes the third, and it is the only one that should block publication outright.

**A summary of a source of truth is a copy, and copies rot.** §5 was originally somebody's accurate
summary of the design system. The correct replacement is not a better summary — it is a pointer.

**Publish-then-sync is drift.** The SUPERSEDED notes were written into the Google Docs first and
into the repo second; that gap had to be closed deliberately in a follow-up commit. One residual
divergence is disclosed rather than hidden: the published Vision's §5 has its palette and
typography detail condensed, where the repo keeps the full text. It sits inside a section marked
do-not-build-from, so it was judged not worth a third upload — but it is recorded, not ignored.
