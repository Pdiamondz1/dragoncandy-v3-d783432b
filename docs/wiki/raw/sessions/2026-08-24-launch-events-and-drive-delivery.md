---
title: Launch Events, the Hoboken Denominator, and Getting the Deck onto Drive
type: source
created: 2026-08-24
sources: []
tags: [pitch-deck, fundraising, provenance, google-drive, rclone, tooling, gtm]
---
# Launch Events, the Hoboken Denominator, and Getting the Deck onto Drive

Session of 2026-08-24, following the deck rebuild (#506, #509). Three PRs merged:
**#513** (the Hoboken denominator), **#515** (launch events + Drive upload tooling).
Codex ran on both; six findings across four rounds, all real, all mine.

## 1. A mark asked one question and got the answer to another

The liquidity slide carried a founder mark labelled **"Restaurants in Hoboken:"**. Standing
beside a liquidity model, that phrase says *our supply* as naturally as it says *the town's
total*. The founder answered with ours — **two: Antique Bar & Bakery and Uncle Rocco's**.

The model needs the **denominator**. "Liquid in month 3 at 2 restaurants a month" means
nothing without knowing whether the town holds 40 restaurants or 400.

So the hole stayed open, but the wrong answer was the label's fault. The label now reads
"Restaurants in Hoboken, **town-wide**:" and the question says what the answer is *not*:
*"Our own count is not this number: that is two."*

**The founder's answer was recorded, in a new `FOUNDER_FACTS`, deliberately NOT in the
assumptions register.** The register's vocabulary is `MEASURED` / `BENCHMARKED` / `MODELED`,
and a founder saying a thing is none of the three. Tagging it `MEASURED` because it came
from someone who would know is precisely the failure the Codex review caught days earlier on
the registered-user count. `FounderFact` carries its own `source` and `asOf`, and every
consumer prints them.

The Q&A document now answers *"so how many restaurants do you actually have?"* with **two**,
beside the **45 registered accounts** and the **0 paying customers**, stating that the three
describe different things and must not be substituted for one another in the room.

### The test whose first draft was worthless

It asserted the **slide's** `textContent` contained `"town-wide"` — and **passed against the
old label**, because `PendingMark` renders the question and the question says town-wide. A
whole-slide text search cannot tell a label from the thing standing next to it. It now reads
the label element; the forced control fails with the old wording and passes with the new.

## 2. Three launch events

Founders stated three: **Hoboken, NJ at Antique Lofts**, **Palm Beach, FL at the Colony
Hotel**, **Montauk, NY at a venue not yet chosen**. Recorded as cities and venues and nothing
else, because that is all that was said.

**They are events, not a change to the metro sequence.** The plan of record
(`DragonCandy_Capital_Raise_Cost_Model.md` §7) is Hoboken (Mo 0–6) → Manhattan (Mo 5–12) →
Palm Beach (Mo 11–18), each gated on density before the next. Montauk is not a metro under
anyone's definition. Read as three simultaneous market launches, these would put the deck at
odds with its own liquidity slide, which argues that creator-side lag is what kills local
marketplaces. Read as events they cohere: one network in three places across the year.

**Nobody has priced them, and the ask is derived.** `PRE_SEED_BUDGET`'s only marketing line
is scoped to one city. Adding an events line moves the raise; leaving it out asks for a plan
that has not been costed. No number was invented — `launchEventPlan` asks for dates, whether
the venues are booked, and a budget, and renders as a marked hole on slide 11.

### The confidentiality check failed the build on my own writing

The first draft of that input's `why` explained the collision by quoting a budget line
label verbatim. `npm run pitch:verify-public` failed the build: `deck/pending.ts` is in the
public bundle's module graph, so its **strings** ship — **and so would a comment**, via the
sourcemap, minification notwithstanding. The arithmetic moved to `confidential.ts`, beside
the line it is about, which the public build never resolves.

### Codex, three rounds on #515

1. **The slide showed the question and not the answer.** `PendingMark` renders only the
   question when the value is null, so slide 11 read as "we have not decided anything" while
   three cities and two rooms were settled. The cities now render beside the mark, derived
   from a `LAUNCH_EVENTS` array, with `venue: null` rendering as "venue to be chosen" —
   a city without a room is a different state from no event.
2. **An inference stated as a sourced fact.** The Q&A doc asserted that the Hoboken and New
   York hospitality crowd summers in Montauk and winters in Palm Beach, cited to a founder
   statement that says no such thing. The seasons stay (true of the towns); the claim that
   *our* network travels is now labelled an argument, with the line that we have not measured
   the overlap and should not imply we have.
3. **The slide printed a founder fact without saying it was one.** `pending.ts` says every
   consumer prints provenance; the slide did not, so three cities read exactly like the
   `MEASURED` rows in the table above them. The list now ends `founder-stated 2026-08-24`,
   taken from the fact so the date cannot drift from the Q&A document's.

Slide 11 took **four PDF exports** to fit — the first three pushed the footer off the
1280×720 canvas. No text assertion can see that.

## 3. Getting the deck onto Drive

The founder asked for the deck in Google Drive. The Drive MCP could not do it: `create_file`
takes content **inline as base64**, and 4 MB of PDF becomes ~5.4 MB of it — larger than a
context window. No Drive CLI, no service-account key and no Drive-for-Desktop folder existed
on the machine.

**rclone was installed** (`brew install rclone`, 1.75.0) with a `dcdrive` remote authorized
as `dame@dragoncandy.com`. Chosen over `gdrive` and the rest because it handles **shared
drives**, where everything here lives — `--drive-team-drive <id>` plus
`--drive-root-folder-id <id>`.

`npm run pitch:upload` puts the deck in `DragonCandy — Confidential › 11 · Finance`, beside
the Capital Raise Cost Model.

### The guard that matters, and why it is not a filename check

Two builds of this deck exist and only one may leave the building: `PITCH_NOTES=1` interleaves
the speaker notes written for Joe, which an investor must never receive. Refusing a file called
`*-notes.pdf` would be worthless — a rename defeats it, and renaming is what happens when
someone tidies a downloads folder. The notes build has one page per slide **plus** one per
note, so the check is page count against the deck's slide count. Proven by renaming the notes
build to `dragoncandy-pitch.pdf`: still refused.

### Codex found the one that was live

**The file I first uploaded was the PUBLIC build.** `npm run pitch:pdf` builds with the
confidentiality gate **off**; only `VITE_PITCH_CONFIDENTIAL=1` produces the complete deck. So
the ask slide read *"Amount in the confidential build"* three times, under a filename saying
CONFIDENTIAL. Someone opening it for the raise would have found a placeholder.

Nothing in the file could catch it: both builds have the **same page count**, and every page
is a **JPEG**, so a PDF text search has nothing to read. The exporter now writes
`dragoncandy-pitch.manifest.json` recording which build it captured — asked of the **rendered
page** (the public build's own "Amount in the confidential build" sentinel) rather than of
`process.env.VITE_PITCH_CONFIDENTIAL`, because `vite build` and the exporter are separate
commands, so the variable describes intent while the page describes what exists. The manifest
is bound to the PDF by **md5**, since a file sitting in the same directory is not evidence
about the file beside it. The remote filename is derived from that flag, so the name cannot
disagree with the contents.

Codex's second finding: the staleness guard watched only `src/pitch`, while the deck also
depends on `src/index.css`, the Tailwind tokens, the Vite config and the exporter. Widened —
and it blocked an upload the moment the exporter was edited. The list is an enumeration and
the comment says so, naming the two enumerations in this repo that rotted while their tests
stayed green.

Uploads are verified by **MD5 against the bytes Drive holds**, never by rclone's exit code.

### On Drive now

`DragonCandy — Investor Deck (CONFIDENTIAL).pdf` — the complete deck, $1,462,568 and the three
funds buckets, md5 `0e46abb5…` matched both ways, folder holding exactly one PDF. The Investor
Q&A also went up as a Google Doc via the MCP (small enough to inline), verified by reading it
back — its API response reported `fileSize: 1`, which looked like an empty file and was not.

### A deadline nobody set

rclone's default config uses its **shared** Google client ID, which is being retired and
**stops working during 2026**. Every command prints it as a one-line `NOTICE` that is easy to
filter out. The fix is a project-owned OAuth client ID. **Not done.**

## Files

- `src/pitch/deck/pending.ts` — `FounderFact`, `FOUNDER_FACTS`, `LAUNCH_EVENTS`,
  `describeLaunchEvents()`, `launchEventPlan`
- `src/pitch/slides/slides.tsx` — liquidity label; slide 11 events row + provenance
- `src/pitch/model/confidential.ts` — the budget-vs-events note, where the public build
  cannot resolve it
- `scripts/generate-investor-qa.ts` — traction paragraph, launch-events section
- `scripts/export-pitch-pdf.mjs` — build detection + manifest
- `scripts/upload-pitch-to-drive.ts` — new
- `src/pitch/deck/pending.test.tsx` — three new tests, each with a forced control
