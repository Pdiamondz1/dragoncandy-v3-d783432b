---
title: Workspace Email Signatures
type: concept
created: 2026-08-20
updated: 2026-08-23
sources: [2026-08-20-google-workspace-signatures-wave-1.md, 2026-08-21-workspace-wave-1-admin-half-and-sendas-correction.md, 2026-08-22-sendas-scope-403-and-partial-status.md, 2026-08-23-shared-signatures-live.md, 2026-08-23-per-user-shared-signature-warning.md]
tags: [google-workspace, email, branding, apps-script, automation, security]
---

# Workspace Email Signatures

Every DragonCandy employee's Gmail signature, generated from one template and installed
automatically by a nightly Google Apps Script. Built 2026-08-20 as the code half of Wave 1 of
the corporate Workspace setup.

**Status, 2026-08-23 — the system is complete and shared-mailbox signatures install.** Both
shared drives exist and hold business documents; the delegation carries `gmail.settings.basic`
**and** `gmail.settings.sharing`; #456 is deployed; `SHARING_SCOPE_ENABLED=true`; and a daily
2–3am trigger is armed. The final run logged **`ok / 4 identities / 3 shared`** for `dame@` and
`ok / 1 identity / 0 shared` for the other three, which is correct — only he has shared
identities. Google Groups (Task 8) were **deliberately skipped** rather than deferred; the
sections below explain why that turned out not to matter. What remains open is Outlook for
Windows, which is untestable, and extending shared identities to anyone else.

*This paragraph has now been wrong twice, in the same way both times.* On 2026-08-20 it called
the admin half "founder-owned and outstanding", which stopped being true the next day. On
2026-08-22 it listed the deploy and the property as open; both landed within hours. Codex caught
the first; the second was caught only because the work continued in the same session. **A
present-tense status paragraph on a page that feeds a RAG is a liability with a short
half-life** — the same mechanism `PROJECT_CONTEXT.md` §5 keeps hitting. Date it, and distrust it
past its date.

**The one-line summary: email is not the web, and almost every design decision here is a
consequence of that.**

## Email is not the web — the constraint set

These are not preferences. Each one changed a decision, and a designer who does not know
them will produce a signature that looks right in a browser and wrong in an inbox.

**Webfonts do not exist in email.** Gmail, Outlook and Apple Mail all strip `@font-face`.
DragonCandy's entire type system — Bricolage Grotesque, Instrument Sans, Silkscreen, the
`landing-*` marketing identity chosen as the *company* identity — **cannot appear as text in
a signature under any circumstances.** It can only appear inside an image. Signature text is
therefore `Arial, Helvetica, sans-serif`, full stop.

A corollary that matters when *presenting* options: mock signatures in the fonts they will
really render in. Showing a founder a signature set in the brand face, for a medium that
cannot render it, is a mockup that lies about the thing being decided.

**Outlook for Windows renders mail with the Word engine.** No WebP, no CSS layout. So
`public/logo.webp` was unusable and PNG exports were required (`public/brand/`), tables
replace `<div>` layout, all CSS is inline, and `<img>` carries explicit `width`/`height`.

**Transparency is load-bearing.** Apple Mail and Outlook auto-invert light signatures in
dark mode. A mark with an opaque white background becomes a glowing white slab in a dark
thread. Both PNG exports preserve the alpha channel, and `public/brand/README.md` says so in
those words, because a future regeneration that flattens it would break dark mode silently.

**Many corporate inboxes block images by default.** This produces the governing rule:

> **The image is never load-bearing.** No name, title, address or contact detail exists only
> inside a picture. Strip every image and the signature is still complete and legible.

That rule is why the "Badge" design was chosen over a fuller lockup: it degrades to a
complete text signature rather than to nothing. The heavier variant survives as an optional
second signature for cold first contact, not the default.

**Reply chains multiply everything.** A six-image signature twelve messages into a thread is
seventy-two images. Weight is a design constraint here, not an afterthought.

## Google Workspace has no built-in signature management

There is no admin setting that applies a signature to everyone. This surprises people and is
the reason a whole category of paid tools exists.

What *does* exist, and is not this: **Admin → Gmail → Compliance → Append footer** appends
text to every outgoing message — but **below the entire quoted thread**, so on any reply it
lands detached at the bottom. It is a compliance footer, not a signature.

So the mechanism is the Gmail API (`settings.sendAs.update`, scope `gmail.settings.basic`),
and writing another user's settings requires a **service account with domain-wide
delegation**. The shape:

```
Daily trigger
  ↓  Admin SDK Directory API → list active users in the domain
  ↓  for each user: render template(name, title, email) → Gmail API per send-as identity
  ↓  log the run
```

**Titles come from the Workspace directory, never from a hardcoded list.** That is deliberate
and it is the same principle this project keeps relearning: one place a fact can be wrong.
The session that built this found three founders' titles stale in **nine** repo files at once
— including the live investor deck and the whole hiring pack — which is precisely the failure
mode a directory lookup removes.

**The security posture, stated plainly:** that service account can change Gmail settings for
every account in the domain, indefinitely. Standard practice for the task, and a real
standing grant. Its key lives in Apps Script script properties, never in the repo. The
delegated grant was `gmail.settings.basic` alone until **2026-08-22**, when
`gmail.settings.sharing` was added — a deliberate founder decision, and a materially wider
right: it lets the account set **who may send mail as which address for every user in the
domain**, not merely rewrite signature HTML. It buys the shared-mailbox signatures and nothing
else, and the *grant* is reversible by removing the scope (property to `false` first — see the
ordering rules below). **Reversing the grant does not un-install anything**: signatures already
written to a sendAs record live in Gmail, not in this script, so they keep going out until
somebody clears them. Revoking the scope does not block that — a mailbox owner can always clear
a signature by hand in Gmail settings — but it does end *this automation's* ability to do it, so
a scripted cleanup has to happen before the revoke, not after. Notably the directory read is *not* part of any of this: it runs through the
`AdminDirectory` advanced service under the script owner's own authorisation, a separate auth
path. An earlier draft of the runbook told the reader to delegate
`admin.directory.user.readonly` as well, which would have been a standing domain-wide right
to read every user record that nothing uses.

## Neither a Group nor an alias is a send-as identity

**This section was wrong when first written, and the correction is the more useful lesson.**

The original claim: shared addresses (`support@`, `sales@` …) appear in a user's Gmail
send-as list *because they are aliases on one person's account*, so converting them to real
Google Groups would remove them and silently break shared-mailbox signatures. The
prescription followed: treat the alias→Group conversion as the hazard.

**The first real run refuted it. `installAllSignatures()` reported 0 shared signatures —
2026-08-21, with the aliases fully intact and no Group anywhere.**

An alias makes mail **arrive**. It does not create a send-as identity. The send-as list is
exactly where the installer looks, so the shared branch had never matched anything and never
could have. The failure written up as a future risk of a decision nobody had taken was the
state on the day it was written.

That leaves the original conclusion standing but its reasoning inverted:

- Groups genuinely are not send-as identities — but neither are aliases, so the conversion was
  never a *prerequisite* for shared signatures, which was the original claim's real error.
- The `0 shared` outcome was **the expected state on 2026-08-21**, not a regression, and the
  installer's warning was changed to say so rather than sending an operator to look at a Groups
  migration that never happened. **That is no longer true and is the wrong thing to accept
  today** — three real send-as identities were added to `dame@` the same day, so `0 shared`
  for a user who has them now indicates a fault. See Known issues for the current matrix.
- **What the conversion would cost is no longer hypothetical.** It removes the aliases, and
  `info@`, `support@` and `appstore@` are now real send-as identities built on them. Converting
  would strip all three and their signatures, taking `dame@` from `4 identities / 3/3 shared`
  back to `1 identity / 0 shared`. Re-cost decision 9 against that, not against the 2026-08-21 state
  in which the conversion genuinely cost nothing.

### It is automatable, at a price — the second correction

The first version of this page also stated: *"No API, admin or script can do the re-adding.
Gmail requires the account holder to complete send-as verification. This is a genuine
platform limit."*

**That is false, and Codex caught it.** `users.settings.sendAs.create` exists and — per
Google's own reference — is available **only** to service account clients with domain-wide
delegation, which is precisely what this system already runs.

The real constraint is scope, not capability. `sendAs.create` requires
`https://www.googleapis.com/auth/gmail.settings.sharing`, which at the time of writing the
delegation did not carry. That scope lets the service account decide **who in the domain may
send mail as which address** — materially wider than "can write signatures", and a founder's
decision rather than an implementation detail.

**That decision was taken on 2026-08-22: the scope is granted.** The delegation now carries
both, so this paragraph describes the constraint as it *was*; the current grant is the two-scope
one described under "The security posture" above. Same-domain addresses should return
`verificationStatus: accepted` without an ownership email — confirmed by hand for the manual
route on 2026-08-21, though `sendAs.create` itself has still never been run.

So there are two routes — and a **third correction**, which is the one that finally cost
something. This page said the manual route was free of new permissions. **Executing it
returned 403:**

```
Missing required scope ".../auth/gmail.settings.sharing"
for modifying non-primary SendAs
```

`gmail.settings.sharing` is required for **either** route. Google's reference lists
`settings.sendAs.update` as accepting `basic` *or* `sharing` — true of the **primary**
identity, and silent on the non-primary case that every shared address falls into. Adding
the identity by hand therefore produces an identity the installer still cannot write to.

**The cost of that discovery was a live regression.** Three send-as identities were added to
`dame@` on 2026-08-21 on the strength of the wrong claim; from that moment the nightly 2am
run logged `ERROR` for him and stopped refreshing even his own primary signature, because one
unwritable identity aborted the whole user. Both halves are now fixed — the scope is named as
mandatory, and the loop records a refusal and continues instead of throwing.

**The durable lesson is not about Gmail, and it took three rounds to land.** This page
asserted, in order: *only a Groups conversion breaks shared signatures* (wrong — aliases were
never send-as identities); *no API can create a send-as identity* (wrong — `sendAs.create`
exists for delegated service accounts); *the manual route needs no new permissions* (wrong —
non-primary writes need `sharing`).

The first two were caught by reading and by review. **The third was caught only by running
it, and it is the one that broke production.** Reviews catch claims that contradict something
already written down; they cannot catch a claim that is merely untested and plausible. *A
claim that something is impossible — or that something is free — is itself a claim, and the
only instrument that settles it is execution.* Same family as the `RCPT TO` probe and the
"edge secrets aren't listable" myth that cost this project two days.

### Granting a scope is two steps, and a runbook step that cannot work is worse than a missing one

The correction above produced a follow-on defect worth its own note, because the shape recurs.

The runbook's remedy was *"add `gmail.settings.sharing` to the domain-wide delegation"*. That is
actionable, specific, and **inert** — the impersonation JWT hardcoded `gmail.settings.basic`, so
an admin who followed it would grant the scope, re-run, receive the identical 403, and have
nothing new to look at. Codex caught it. Documentation that instructs an action the code does
not support is a trap, not a gap.

The fix is a `SHARING_SCOPE_ENABLED` script property read by `requestedScopes_()`. **It defaults
off, and the default is load-bearing:** requesting a scope the delegation does not carry fails
the **entire** token exchange with `unauthorized_client` — not the shared identities, but every
signature for every user. So enabling is ordered and the order is not optional:

1. Admin console — add the scope to the existing delegation client.
   **Done 2026-08-22**, both scopes verified present on client
   `117869070719843760682`.
2. *Then* set `SHARING_SCOPE_ENABLED=true`. **Done 2026-08-23**, after the
   deploy and after a `PARTIAL` run confirmed the narrow path still worked.

Reversing it takes the whole system down until the property is set back. Disabling runs the same
rule backwards: property first, scope second. The README, the spec and the runtime error message
all say so.

**Generalisable: when a capability needs a grant in two independent systems, the default must be
whichever value is safe while only one of them is configured.** Here that is off, because the
half-configured failure is total rather than partial.

### The regression warning was scoped to the wrong thing

Worth recording separately, because the shape recurs and the code passed every test it had.

The "no shared signatures installed" warning fired on `totalSharedInstalled === 0` — a **domain
aggregate**. With exactly one account holding shared identities that is indistinguishable from a
per-user check, which is why nobody noticed. With two it is not: `dame@` could lose all three
signatures and the run would stay silent because somebody else still installed one. The warning
would have gone quiet at precisely the moment the feature grew.

Fixed by `sharedRegressions_(perUser, baseline)` — pure, so vitest can reach it
(`installAllSignatures` needs `AdminDirectory` and a live impersonation token, so the decision
would otherwise be untestable), returning `user@ (written/expected)` for anyone whose shared
identities did not all get a signature. The log Sheet's shared column became `3/3 shared` rather
than a bare `3` for the same reason: **`0 shared` is correct for a user with none and alarming
for a user with three, and a bare count cannot tell those apart.**

**Then the first fix turned out to have the same disease, one level down.** It derived
"expected" from `sharedSeen` — the shared identities present in the sendAs list *right now*. So
the worst case stayed invisible: delete a user's send-as identities and the denominator falls to
zero alongside the numerator, and the run reads clean. **A check whose expectation is recomputed
from current state cannot detect a change in that state.** Caught by Codex as a P1, on a
function written specifically to close the previous scoping hole.

The expectation is now `max(identities present now, SHARED_BASELINE[user])`, where
`SHARED_BASELINE` is a persisted per-user high-water mark that **never decreases on its own** — a
drop is the signal, so letting the baseline follow it down would erase the evidence one run later
and reduce a standing regression to a single warning nobody was awake for. Accepting a deliberate
removal is an explicit act: clear that user from the script property.

A second finding in the same pass: the remediation text was chosen from a **domain-wide** denied
count, so one user's missing-scope 403 would tell an operator to fix the scope for a different
user whose failure had nothing to do with it. Degraded users are now partitioned by cause and
each group gets its own remedy.

Tests were checked by mutation rather than by passing. Reintroducing the aggregate semantics
turns three red; reverting the denominator to live-only turns the two removal tests red.
**A test that has never failed has not been shown to test anything** — every buggy version here
passed the whole suite as it stood at the time.

The general lesson is about *what a check is scoped to*, and it bit twice in one function: a
condition computed over a population equals a per-member condition only while the population has
one member, and nothing tells you when it grows; and an expectation derived from current state is
blind to exactly the change it exists to catch.

**And a grant is not immediately a capability.** Domain-wide delegation changes propagate on
Google's schedule — minutes, sometimes longer — so "granted in the console" opens a window
rather than flipping a switch. Inside that window, step 2 produces exactly the same
`unauthorized_client` total failure as doing the steps out of order. This is why the scope was
granted on 2026-08-22 while `SHARING_SCOPE_ENABLED` was deliberately left unset: the code was
undeployed anyway, so there was nothing to gain from racing it. The sequence run on 2026-08-23
was push → confirm `PARTIAL` with a non-zero denied count → set the property → run again, with
about **seven hours** between the grant (2026-08-22 19:36 ET) and the enabling run (2026-08-23
02:39 ET), with no `unauthorized_client`. That interval is too long to bound propagation from
below — it is evidence that seven hours is enough, and evidence of nothing shorter.

**The intermediate `PARTIAL` run is the load-bearing one, and it is worth keeping in any repeat
of this.** It is the only observation that distinguishes *the scope fixed it* from *the scope
masked a loop that was still broken*. Both runs are in the log Sheet:
`PARTIAL / 1 identity, 3 denied / 0 shared`, then `ok / 4 identities / 3 shared`. Had the second
been run alone, a success at the end would have proven strictly less — the same reasoning as
using *signatures appearing in other people's mailboxes* rather than a success message as the
original acceptance signal.

## Known issues

- **Shared signatures exist only on `dame@`.** `info@`, `support@` and `appstore@` were added
  as send-as identities on his account and now carry the signature. Nobody else has any, so
  `0 shared` is still the correct report for the other three users. Extending it means adding
  the identity on each person's account — either by hand or via `sendAs.create`, both of which
  the granted scope now permits.
- **`0 shared` for `dame@` would be a fault.** His expected report is
  **`ok / 4 identities / 3/3 shared`** (the shared column became `written/expected` on
  2026-08-23; the run logged that day predates the change and reads `3 shared`); anything less
  means something regressed. The
  deployed-code × property matrix in `scripts/workspace/README.md` gives the expected report for
  each configuration — read it before judging a run.
- **Merged is not deployed, and Apps Script has no CI that closes the gap.** #456 sat merged and
  undeployed for a day because `clasp push` needed a re-auth, during which the nightly run kept
  failing on code that was already fixed in the repo. Nothing detected that; it was found by
  going to push. Worth remembering for any future change here — the repo state and the live
  script are joined only by someone remembering to run `clasp push`.
- **Outlook for Windows is untested and now untestable** — the account that could have
  checked it is gone. The rendering matrix is four-of-five (Gmail web light, Gmail web dark,
  Gmail iOS dark, images-disabled), not five-of-five. Do not describe it as verified.
- **A warning is still not a gate, though it now arrives.** As of 2026-08-23 a run with a
  finding emails `ALERT_EMAIL` (MailApp, as the script owner — unrelated to the delegation),
  naming each failed or degraded user with written/expected and the cause. It is deliberately
  silent on a clean run, because a nightly "all fine" trains its reader to filter the thread.
  **`ALERT_EMAIL` unset means nobody is told** and everything else still looks normal; the run
  logs that. And nothing *blocks* on the alert — an email is a stronger nudge than a log line,
  not a gate.
- **`dryRun()` does not authenticate**, so it passes cleanly with a missing or revoked
  service-account key. Its comment says so; the limitation stands. This is why the acceptance
  signal was writing into *other people's* mailboxes, which `dryRun()` structurally cannot
  demonstrate.

### Three "known issues" that were resolved and are recorded here so they are not re-raised

- ~~**`Code.gs.js` has no unit tests and cannot have any** — it needs the Apps Script
  runtime.~~ **Resolved 2026-08-21.** It is Apps Script with no top-level calls, so the file
  loads in the test process and its values can be inspected — 5 invariant tests now pin
  `SHARED_IDENTITIES` against `titleForShared_()`. The belief that it was untestable is what
  let a missing label reach review. 24 tests total, up from 19.
- ~~**The whole thing is unproven against Google's real endpoints.**~~ **Resolved
  2026-08-21.** It ran: delegation, token exchange, the Admin SDK read and Gmail's acceptance
  of the patched HTML all executed, `4 × ok`. Proven by signatures appearing in `joe@`,
  `jay@` and `adrian@` — mailboxes `dame@` cannot otherwise touch, which is the only evidence
  that distinguishes a working delegation from a broken one.
- ~~**Nothing is deployed.**~~ **Merged (#453) and live 2026-08-21**, with a daily 2–3am
  trigger armed. Corrections followed in #454.

## Three traps worth carrying to other work

**A 200 is not proof of a resource.** `https://dragoncandy.com/brand/dc-mark-104.png` returns
**HTTP 200 serving `index.html`** before the asset deploys, because Vercel's SPA catch-all
rewrites unknown paths. Installing signatures against that yields a broken image behind a
success status — which image proxies cache. The check must be `content-type: image/png`. Same
family as the `RCPT TO` lesson in [[Legal Entity Identity]]'s sibling work: *when a probe
cannot distinguish a true answer from a false one, change instrument.*

**A build step that exists is not a build step that runs.** The runbook documented
`clasp push` while the repo shipped no `.clasp.json` and no `appsscript.json` — so clasp
would have uploaded the ES-module source and the vitest file, each a V8 syntax error failing
the whole project at load. The transform existed specifically to prevent that and was being
bypassed by the documented procedure. Generated output now includes `appsscript.json`, and
the runbook pins `"rootDir": "dist"`.

**A classifier is not an inventory, and the two errors are not symmetric.**
`SHARED_IDENTITIES` decides how an address is *signed*, and is only ever consulted for
addresses that already appeared in someone's send-as list. Listing an address that does not
exist yet is therefore **inert** — nothing matches it. Omitting one is not: an unclassified
company address is signed as *personal*, going out under an individual's name and title with
no registered postal address. A cleanup pass removed `legal@` for the sensible-sounding
reason that the alias does not exist; Codex refused it, correctly, because the day the
address is created it would be mis-signed — on the mailbox that exists to receive legal
correspondence. **When a list is a classifier, tidiness argues the wrong way: include the
address you are unsure about.**

## A refuted finding, recorded so it is not re-raised

Codex's final pass flagged trailing whitespace on the `package.json` line this work added
(`git diff --check`). It is **not a defect**: `package.json` is CRLF on all 138 lines — this
repo came from Windows and moved to macOS on 2026-08-14 (see
[[Local/Production Boundary & Repo Joinability]]) — and `git diff --check` reports the CR as
trailing whitespace on any added line in a CRLF file. The added line matches the file's
existing convention; converting it to LF would make it the only inconsistent line.

## See Also

- [[Legal Entity Identity]] — the registered address these signatures carry, and why the
  D&B form rather than the IRS one
- [[Local/Production Boundary & Repo Joinability]] — the same hiring-driven audit that
  surfaced this work, and the source of the CRLF history above
- [[Cloud Platform Strategy]] — the sibling decision from the same week, also written for
  people joining the company
- [[Landing "Human-driven. AI-assisted." Redesign]] — where the `landing-*` marketing
  identity comes from, chosen here as the *company* identity
- [[Updated-At Trigger Drift]] — the house rule this page's directory-lookup decision echoes:
  one place a fact can be wrong
