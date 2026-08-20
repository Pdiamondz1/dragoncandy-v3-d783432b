---
title: Workspace Email Signatures
type: concept
created: 2026-08-20
updated: 2026-08-20
sources: [2026-08-20-google-workspace-signatures-wave-1.md]
tags: [google-workspace, email, branding, apps-script, automation, security]
---

# Workspace Email Signatures

Every DragonCandy employee's Gmail signature, generated from one template and installed
automatically by a nightly Google Apps Script. Built 2026-08-20 as the code half of Wave 1
of the corporate Workspace setup; the admin-console half (shared drives, Google Groups,
`adrian@`, the service account) is founder-owned and outstanding at time of writing.

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
delegated grant is **only** `gmail.settings.basic` — the directory read runs through the
`AdminDirectory` advanced service under the script owner's own authorisation, a separate auth
path. An earlier draft of the runbook told the reader to delegate
`admin.directory.user.readonly` as well, which would have been a standing domain-wide right
to read every user record that nothing uses.

## A Google Group is not a send-as identity

**The sharpest interaction in this system, and it is invisible until it silently costs you.**

Shared addresses (`support@`, `sales@`, `legal@` …) appear in a user's Gmail send-as list
**only because they are aliases on one person's account** — and the send-as list is exactly
where the installer looks for them. Converting those aliases to real Google Groups, which the
Workspace plan requires for perfectly good reasons, **removes them from every user's send-as
list.**

The installer then runs, reports success, and installs **zero** address-bearing signatures.
The registered postal address that policy puts on shared mailboxes appears nowhere, and
nothing errors.

Three-part resolution, and the split is the point:

- **Code** — warn when a run installs zero shared identities, naming the likely cause. This
  makes the failure visible. It cannot prevent it.
- **Process** — after the conversion, each member re-adds and verifies each shared address on
  their own account (Gmail → Settings → Accounts and Import → *Send mail as*).
- **Docs** — the spec records why the two decisions interact, so the next reader does not
  rediscover it in production.

**No API, admin or script can do the re-adding.** Gmail requires the account holder to
complete send-as verification. This is a genuine platform limit, not an automation gap — and
worth knowing before someone promises to automate it.

## Known issues

- **A warning is not a gate.** If nobody reads the run log, a zero-shared-signature run still
  passes unnoticed. The mitigation is that the founder step now sits in the plan *before* the
  install step, not that the code prevents it.
- **`Code.gs.js` has no unit tests and cannot have any** — it needs the Apps Script runtime.
  The renderer is pure and carries 19 tests; the driver is deliberately kept thin enough to
  review by eye. Its correctness is established by reading, a syntax check on the generated
  output, and the founder's dry run.
- **The whole thing is unproven against Google's real endpoints.** Delegation, token
  exchange, the Admin SDK's `organizations[].primary` shape, and Gmail's acceptance of the
  patched HTML have never executed. Everything to date is static review.
- **`dryRun()` does not authenticate**, so it passes cleanly with a missing or revoked
  service-account key. Its comment says so; the limitation stands.
- **Nothing is deployed.** At time of writing the branch is unmerged and the admin half is
  not started.

## Two traps worth carrying to other work

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
