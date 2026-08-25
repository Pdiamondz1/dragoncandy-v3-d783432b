---
title: A Service-Account Transport for Drive Uploads
type: source
created: 2026-08-24
sources: []
tags: [google-drive, rclone, service-account, tooling, oauth]
---
# A Service-Account Transport for Drive Uploads

Follows `2026-08-24-launch-events-and-drive-delivery.md`, same day. The founder asked
whether rclone should be replaced, since it is "going away soon".

## The premise was wrong, and the correction matters

**rclone is not going away.** What Google is retiring is the OAuth client ID that rclone
*lends* every install by default — a shared credential everyone borrows. rclone itself is
actively maintained. The one-line `NOTICE` says so explicitly ("Create your own client_id
to avoid interruption"), but reads at a glance like a deprecation warning for the tool.

That correction changes the shape of the answer, because **every alternative needs the same
thing**. Google requires an app credential to touch Drive, so switching tools does not avoid
the work — it only changes which tool the credential points at. `gdrive` and the other CLIs
are a lateral move with less maturity and weaker shared-drive support; Drive for Desktop
works but is a GUI daemon that syncs silently, a poor fit for tooling whose job is to
*refuse* the wrong file.

So the real choice is the credential shape, and there are two good answers in sequence: a
project-owned OAuth client for rclone (fifteen minutes, no code), and a service account
(headless, no OAuth client at all).

## What was built

A second transport in `npm run pitch:upload`, dormant unless a key is configured. Same
command, same guards, same md5 verification; only the transport moves.

- `scripts/lib/drive-service-account.ts` — RS256 JWT via `node:crypto`, one form POST for a
  token, resumable upload, read-back by `md5Checksum`. **No new dependency**; `googleapis`
  would have pulled a large tree in to do what forty lines already do.
- Key sources in precedence order: `GOOGLE_DRIVE_SA_KEY_JSON` (inline, for CI, which has a
  secret store and no filesystem), `GOOGLE_DRIVE_SA_KEY` (path), then
  `.drive-service-account.json` (gitignored). Absence of all three is what keeps it dormant.
- 15 tests over the parts a fake `fetch` can reach.

**Resumable rather than multipart** because multipart caps at 5 MB and the deck is already
4 — a countdown, not a margin.

## Two decisions worth keeping

**No domain-wide delegation.** The Workspace signature installer uses DWD because it must
act *as* each user, writing into mailboxes it does not own. This does not: a service account
can be a **member of a shared drive** like any other principal, and files it creates are
owned by the drive. DWD can impersonate every user in the domain; membership grants exactly
one drive. An earlier draft of the wiki page said the alternative "is a service account with
domain-wide delegation" — wrong, and corrected in place, because that sentence would have
sent the next person to configure the more dangerous thing.

**A key that is present but broken fails; it never falls back to rclone.** Falling back
would turn a misconfigured secret into a green run that succeeded by a route nobody chose.
The first real run must not be able to quietly pass by the old path and look like a test of
the new one.

## What running the controls found

Three controls were run against the live script, and one changed the code.

- **A key selects the new transport** — a syntactically valid key for a nonexistent account
  reached Google and failed at the token endpoint, which is proof it took that path.
- **A malformed key refuses** — but the refusal was `DECODER routines::unsupported` over an
  ASN.1 stack, because `parseServiceAccountKey` checks only for the `BEGIN PRIVATE KEY`
  header and a PEM-shaped-but-damaged body slips past it. True and useless. **The guard
  written to prevent exactly that message did not cover the case, and only running it showed
  that.** The signer now catches it and names the likely cause.
- **No key is unchanged** — still rclone, still md5-verified, still the same output.

## The limit, stated rather than buried

**No real upload has ever run through the service-account path.** No key exists on this
machine. It is proven by unit tests over its pure parts and a fake `fetch`, and by nothing
else — a signature a fake `fetch` accepts says nothing about whether Google will. rclone is
what has actually put the deck on Drive, and that stays true until someone drops a key in.

## Files

- `scripts/lib/drive-service-account.ts`, `scripts/lib/drive-service-account.test.ts` — new
- `scripts/upload-pitch-to-drive.ts` — transport selection; verification made
  transport-agnostic
- `.gitignore` — `.drive-service-account.json`
