# Session — Workspace Wave 1: the admin half, the Drive fill, and a claim that did not survive its first run

Date: 2026-08-21
Branches: `worktree-dc-google-workspace` (#453, merged 11:35 UTC),
`fix/juwan-title-shareholder` (#454, merged 21:00 UTC)

---

## What happened, in order

1. **Task 10 — the signature installer went live.** Domain-wide delegation was granted, a
   service-account key created (which required lifting an org policy), the Apps Script project
   pushed with `clasp`, three script properties set, `dryRun()` run, then
   `installAllSignatures()` for all four users: **`4 × ok`**. A daily 2–3am trigger was added.
2. **The acceptance signal was writing into other people's mailboxes.** Signatures appeared in
   `joe@`, `jay@` and `adrian@` — accounts `dame@` cannot otherwise touch. That is what proves
   delegation; `dryRun()` never mints an impersonation token and passes cleanly with a revoked
   key, so it could not have shown this.
3. **`installAllSignatures()` reported `0 shared`.** The code's own warning blamed a Google
   Groups conversion. Task 8 (the conversion) had been deliberately skipped, so that diagnosis
   was structurally impossible.
4. **The real cause: an alias is not a send-as identity.** Verified in the admin console — the
   seven shared addresses are aliases on `dame@`, which makes mail *arrive* but does not put
   them in `settings/sendAs`, which is exactly where the installer looks.
5. **Gmail iOS dark mode passed** — the renderer sets no background colour, so the risk was
   dark-on-dark text. Gmail's mobile client remaps the text rather than only inverting the
   background. `#241332` came back white. No code change needed.
6. **Outlook for Windows could not be checked** — no access. Recorded as untested rather than
   passed.
7. **Both shared drives were populated** with 14 business documents, hiring pack in the open
   drive and compensation in Confidential — the split #452 designed, now enforced by structure
   rather than by remembering to delete a section.
8. **Profile pictures were locked domain-wide.** *Directory → Directory settings → Profile
   editing → Profile picture* was unchecked, so no user in the domain could set a photo.
   Enabled and verified by reopening the dialog as the user.
9. **#454 corrected the record**, through four Codex rounds.

---

## The central finding

**The spec and README both asserted that the shared addresses appear in Gmail's send-as list
"because they are aliases on `dame@`", and framed the alias→Group conversion as the thing that
would break shared signatures.**

The first real run refuted it: 0 shared, with the aliases intact and no Group anywhere. The
failure written up as a *future risk of a decision nobody had taken* was the state on the day
it was written. Groups were never a prerequisite for shared signatures.

Three copies of the wrong diagnosis were corrected — README, spec, and the live `console.warn`
an operator reads at 3am, which is the one that would actually have sent someone hunting a
Groups migration that never happened.

---

## Three things the Codex second review caught, each a real defect

- **Round 1 — `founders@` had no display label.** Adding it to `SHARED_IDENTITIES` without an
  entry in `titleForShared_()` falls through to the raw local part, rendering "DragonCandy
  founders" — lowercase — to customers. Fixed and pinned by a test. **The test was verified by
  removing the label and watching it go red**, not by trusting a green run.
- **Round 2 — removing `legal@` was wrong.** It was removed because the alias does not exist.
  But `isSharedIdentity_` is a *classifier*: listing a nonexistent address is inert, while
  omitting one means it is signed as personal mail — an individual's name and title, no
  registered address, on the legal mailbox. Restored, with a test pinning planned addresses.
- **Round 3 — "no API can do this" was false.** `users.settings.sendAs.create` exists and is
  available *only* to domain-wide-delegated service accounts, which is what this system runs.
  Checked Google's reference rather than swapping one unverified claim for another: it needs
  `gmail.settings.sharing`, and the delegation grants `gmail.settings.basic`. Automatable, but
  at the cost of a scope that lets the service account decide who may send as what.

Codex clean at round 4.

---

## Durable lessons

- **A claim that something is impossible is itself a claim.** Twice on the same page a
  limitation was asserted rather than checked, and both times reality was less restrictive —
  first "only a Groups conversion breaks this", then "no API can create a send-as identity".
  Same class as the "edge secrets aren't listable" myth that cost two days.
- **A classifier is not an inventory, and its errors are asymmetric.** Tidiness argues the
  wrong way: include the address you are unsure about.
- **"Cannot be tested" was also untrue.** `Code.gs.js` was documented as untestable because it
  needs the Apps Script runtime. It has no top-level calls, so it loads in the test process
  fine — and that unchallenged belief is exactly what let a missing label reach review.
- **A merged PR is not a verified one.** #453 merged in the morning carrying a premise its own
  first run disproved by afternoon.
