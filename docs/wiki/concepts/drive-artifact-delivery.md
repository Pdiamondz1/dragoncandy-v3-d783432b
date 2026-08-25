---
title: Drive Artifact Delivery
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-launch-events-and-drive-delivery.md, 2026-08-24-drive-service-account.md]
tags: [google-drive, rclone, tooling, confidentiality, delivery]
---
# Drive Artifact Delivery

How a built binary artifact — today the investor deck, tomorrow the hiring-pack PDFs — gets
from this repo into the company's Google Drive, and what has to be true before it is allowed
to go.

## The MCP cannot carry a binary

The Google Drive MCP's `create_file` takes content **inline**, as base64 or text. A 4 MB PDF
becomes ~5.4 MB of base64 — larger than a context window, so this is not a matter of trying
harder. It has no file-path or resumable-upload option.

It remains the right tool for **small text documents**, which it converts to Google Docs.
The Investor Q&A went up that way. Verify by reading back: that upload's API response reported
`fileSize: 1`, which looks exactly like an empty file and was not one.

## Two transports, chosen by whether a key is configured

`npm run pitch:upload` uses the **Drive API as a service account** when a key is
configured, and shells out to **rclone** when one is not. The guards, the manifest check
and the md5 verification are identical either way — only the transport moves.

**The service account is the destination.** It is headless: no browser consent, no user
token to re-approve, so the same command runs in CI and on a new engineer's machine on day
one. Installing a binary and completing an OAuth round trip is a poor first task for
someone whose job that week is to publish a deck. It also sidesteps rclone's retiring
client ID entirely.

**It does NOT need domain-wide delegation.** The Workspace signature installer uses DWD
because it must act *as* each user, writing into mailboxes it does not own. This does not:
a service account can be added as a **member of a shared drive** like any other principal,
and files it creates are owned by the drive. That is narrower and safer — no ability to
impersonate anyone — so do not copy the signature script's setup here.

Failing to add it as a member is the likeliest setup mistake, and Drive reports it as a
bare **404 on the folder**, which reads like a wrong ID and sends you checking the ID. The
uploader turns that into a sentence naming the account to add.

**A key that is present but broken fails; it does not fall back.** Falling back would turn
a misconfigured secret into a green run that succeeded by a route nobody chose — the exact
silent-success shape this project keeps recording. Key sources, in precedence order:
`GOOGLE_DRIVE_SA_KEY_JSON` (inline, for CI, which has a secret store and no filesystem),
`GOOGLE_DRIVE_SA_KEY` (a path), then `.drive-service-account.json` (gitignored, so a local
machine needs no configuration and its absence is what keeps the transport dormant).

No new dependency: the token is an RS256 JWT signed with `node:crypto` and one form POST,
about forty lines. Uploads are **resumable**, not multipart — multipart caps at 5 MB and
the deck is already 4, which is a countdown rather than a margin.

> **Proven end to end 2026-08-24.** This block said it had "never completed a real upload"
> until the key existed. It now has: `deck-uploader@dragoncandy-workspace` replaced the deck
> in place — one PDF in the folder afterwards, not two — with the md5 matching on both sides,
> confirmed through rclone as an independent reader. rclone stays as the fallback for a
> machine with no key.

### What running the control found

A key that is PEM-*shaped* but damaged — a truncated paste, or one that lost characters
passing through an environment variable — slipped past the validator, which only checks for
the `BEGIN PRIVATE KEY` header, and died inside OpenSSL as
`DECODER routines::unsupported` over an ASN.1 stack. True, and useless to whoever has to fix
it. The signer now catches that and says what to do. **The guard written to prevent exactly
that message did not cover the case; only running it showed that.**

## rclone, and why it rather than the other CLIs

Installed 2026-08-24 (`brew install rclone`, 1.75.0), remote **`dcdrive`**, authorized as
`dame@dragoncandy.com` with `scope=drive`. Chosen over `gdrive` and friends for one reason:
everything here lives on a **shared drive**, and most Drive CLIs assume My Drive.

Shared drives are not reachable by default. Both flags are required:

```
--drive-team-drive <driveId> --drive-root-folder-id <folderId>
```

Drive and folder IDs are in project memory (`google-workspace-drive-ids`), not in the repo.
The narrower `drive.file` scope cannot write into a folder the app did not create, so it does
not do this job; the alternative to a broad user-scoped grant is the service account above —
by **membership**, not by domain-wide delegation. (An earlier revision of this line said DWD.
It was wrong, and the distinction is the whole security argument: DWD can impersonate every
user in the domain, while membership grants exactly one drive.)

**`scope=drive` grants read/write across the authorizing user's whole Drive.** That is a real
permission decision, not a formality — say so before asking anyone to run the config command.

### It has a deadline

rclone's default config uses rclone's **shared** Google client ID, which is being retired and
**stops working during 2026**. Every command prints this as a one-line `NOTICE`, which is
exactly the kind of warning a `grep -v` in a script removes forever.

Two answers, and they are not alternatives so much as a sequence. The cheap one is a
project-owned OAuth client ID set as `client_id`/`client_secret` on the remote — fifteen
minutes, no code change. The durable one is the service-account transport above, which does
not use an OAuth client at all. **Neither is done**, so today the fallback path is still
running on borrowed credentials with a fuse on them.

## `npm run pitch:upload`

`scripts/upload-pitch-to-drive.ts`. Three guards, then an upload, then a verification.

### 1. Which file — by contents, never by name

Two builds of the deck exist and only one may leave the building: `PITCH_NOTES=1` interleaves
the speaker notes written for Joe — coaching, hedges, what to volunteer before being asked —
as facing pages. An investor must never receive it.

The tempting guard is to refuse `*-notes.pdf`. **That guard is worthless**: a rename defeats
it, and renaming is precisely what happens when someone tidies a downloads folder. The notes
build has one page per slide **plus** one per note, so the check is page count against the
deck's slide count, read from `notes.ts` — whose keys define the deck's own `SlideId` type, so
it cannot drift by being edited separately.

Proven by renaming the notes build to `dragoncandy-pitch.pdf` and watching it be refused.

### 2. Which build — because the PDF cannot say

**This is the guard the first version lacked, and its absence was live on Drive.**
`npm run pitch:pdf` builds with the confidentiality gate **off**; only
`VITE_PITCH_CONFIDENTIAL=1` produces the complete deck. The redacted deck therefore went to
the Confidential drive under a filename promising the opposite, with an ask slide reading
*"Amount in the confidential build"* three times. Caught by the Codex second review.

Nothing in the artifact could have caught it. Both builds have the **same page count**, and
every page is a **JPEG**, so a PDF text search has nothing to read.

So `scripts/export-pitch-pdf.mjs` writes a sidecar manifest, and two decisions in it matter:

- **The build identity is asked of the RENDERED PAGE, not of the environment variable.**
  `vite build` and the exporter are separate commands; export against a stale `dist/` and the
  variable says confidential while the pixels say otherwise. The sentinel is the public
  build's own copy, which exists precisely to announce that the figures are missing.
- **The manifest is bound to the PDF by md5.** A file sitting in the same directory is not
  evidence about the file beside it.

The remote filename is **derived** from that flag, so a mislabel is unreachable — and because
the two names differ, a public build can never overwrite the confidential one.

### 3. Staleness — against an enumerated input set

A PDF older than its build inputs is a deck that disagrees with the model it claims to be
built from, which is this deck's whole premise. `BUILD_INPUTS` covers `src/pitch`,
`src/index.css`, `tailwind.config.ts`, `vite.config.ts` and the exporter — the first version
watched only `src/pitch` and would have passed a stale PDF after a stylesheet change.

**It is an enumeration, and enumerations rot here.** The logo constant and the `profiles`
column grants both shipped green tests over lists that had gone stale. Treat it as watched,
not solved.

### Then verify by hash

`rclone` exiting 0 says the transfer returned, not that the file on the other side is this
one. The uploader re-reads the folder listing with `--hash` and compares md5 to the local
file. Same discipline as the Meta console write that returned `{"success":true}` and
discarded the value ([[Instagram Insights Connector]]).

## Where things live

`DragonCandy — Confidential › 11 · Finance` holds the deck and the Q&A alongside the Capital
Raise Cost Model. The **open** `DragonCandy` drive's `00 · Company` holds an older
`DragonCandy_Story_Line_Pitch_v4.pdf` (2026-08-21), now superseded — the current deck is
marked Confidential on every page and carries the ask, so it does not belong there. See
[[Google Workspace]] for the drive structure and [[Investor Pitch Deck & Capital Raise]] for
what the deck contains.

## Known Issues

- **The retiring client ID** (above) is the one dated hazard.
- **Only the deck has a wrapper.** `docs/hiring/pdf/` had the same problem in August — a
  private repo with no public URL, so the pack had to be attached to emails — and its PDF
  toolchain (pandoc + headless Chrome) is still uncommitted. This is where that gets solved.
- The manifest is gitignored alongside the PDFs. A committed manifest would vouch for bytes
  nobody has.

## See Also

- [[Investor Pitch Deck & Capital Raise]]
- [[Build-Time Confidentiality]]
- [[Google Workspace]]
