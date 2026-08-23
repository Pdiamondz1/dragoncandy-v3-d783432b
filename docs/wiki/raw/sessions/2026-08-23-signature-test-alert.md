# Session — 2026-08-23 · Hearing the alarm ring

Raw session source. Immutable. Synthesized into
`docs/wiki/concepts/workspace-email-signatures.md`.

## What was asked

Walk the founder through the two steps #463 left open — set `ALERT_EMAIL`, and re-consent to the
new `script.send_mail` scope. Then, on the gap that surfaced from doing so: build a way to prove
the alert can actually deliver.

## The two steps, and what they established

`ALERT_EMAIL` is **`alerts@dragoncandy.com`**, a new alias created on `dame@` for the purpose.

The founder asked whether to reuse an existing alias. The recommendation was no, and the reason
generalises: **every existing alias is already spoken for in a way that bites later.** `admin@`
carries Stripe dispute alerts (`stripe-webhook/index.ts:511`), so a filter could not separate
money from mail-config. `support@`, `privacy@`, `legal@`, `sales@` and `info@` are published
*inbound* addresses that `src/lib/contactAddresses.ts` already flags as wanting to become a shared
mailbox someone else covers — at which point the alerts follow them to a person who cannot fix an
Apps Script authorization error. `founders@` will fan out to Joe and Juwan. `appstore@` is Apple's.

What the alias buys is **a stable indirection point**: when this becomes a Group, the Group
changes and the script property does not — and every trip into that property page is a trip into
the page that also holds the service-account private key.

What it does **not** buy is redundancy. An alias is a delivery label on `dame@`'s inbox. If that
account is suspended the alerts go with it.

The re-consent ran clean: **all four users `ok`, `dame@` at 4 identities / 3/3 shared**, 9s. The
"Authorization required" dialog appearing *is* the proof the old grant had been invalidated — it
would not have asked otherwise.

## Two claims of mine that were falsified within minutes of each other

**1. "`alerts@` will show up as a fifth send-as identity and get your personal signature."**
Wrong. The run reported **4 identities**, unchanged. An alias does not become a send-as identity
on its own — which is *already the recorded finding on this page*, and I failed to apply it to a
case I had just created. The three shared identities are identities because they were added by
hand.

**2. "The 4:47 run doesn't appear in the Sheet."** Wrong, and the mechanism matters: Chrome served
a cached render across two full reloads. Reading the same file through the Drive API showed the
newest batch present. Same class as the zoomed-screenshot false alarm two days earlier —
**a rendering artifact is not state.** The instrument was wrong, not the system.

## The gap the clean run exposed

A clean run is silent by design. So the *delivery* path is exercised only by a run that has a
finding — which, if everything works, should be rare. Four rounds had been spent on an alert
**nobody had ever received**, and the successful run proved the signatures install while proving
nothing at all about whether the alarm reaches anyone.

`sendTestAlert()` closes that. It emails whatever `ALERT_EMAIL` currently holds and writes nothing
else — no signature, no baseline, no Sheet row. Permanent rather than throwaway, because the same
question returns every time the property changes, a scope is granted, or the manifest moves.

**Three design points, each load-bearing:**

- **It calls `sendRunAlert_`, not `MailApp`.** A test that builds its own send proves MailApp
  works, which was never in doubt. What is in doubt is whether *this* script's authorization,
  *this* property and *this* recipient list deliver. If it ever stops calling `sendRunAlert_` it
  stops being a test.
- **It throws where a real run only warns** — on no usable recipient, and on a refused send.
  `installAllSignatures` must not die over a notification; the signatures are already written by
  then. This function's only job *is* the notification. The refused-send case is the important
  one: `sendRunAlert_` swallows delivery errors by design, so unchecked, **a broken mail path
  finishes green and reads as a pass** — the same "nobody was told" failure rebuilt one level up.
- **A green execution is not the result — the mail arriving is.** All it can prove is that the
  send was *accepted*. So the console line says to go and look.

## The coverage gap found on the way

**`sendRunAlert_` had no tests at all.** Every existing test fed `runAlert_` — the pure composer —
and stopped there, leaving the half that actually delivers uncovered. Identical in shape to the
`runStatus_` mutation that went undetected by all 79 tests the day before: *the tested thing was
adjacent to the untested thing, and the adjacency read as coverage.*

The loader now injects `MailApp` and records every send, so a test can assert that **nothing** went
out — the half a "did it send?" stub cannot check, and the half that matters for the no-recipient
paths. It also now covers the guarantee that a mail outage cannot kill the run.

96 tests, was 86. Mutation-checked: dropping the refused-send throw (1 red), dropping the
no-recipient throw (2 red), unmarking the `[TEST]` subject (1 red), making `sendRunAlert_` rethrow
(2 red).

Codex clean at round 1 — the first single-round pass in this workstream.

## Status at end of session

Merged (#466, `0d54d28d`) and pushed to Apps Script. **`sendTestAlert` has never been run** — the
executions list ends at `installAllSignatures` 4:47:43. Running it sends mail, which is the
founder's call, not the assistant's.

## Durable lessons

**A finding recorded on a page does not apply itself.** "An alias is not a send-as identity" was
written on this very page, and I predicted the opposite about an alias I had just recommended
creating. Reading is not the same as consulting.

**When two instruments disagree, suspect the instrument you did not choose.** Two browser reloads
agreed with each other and were both wrong; the API was right. Agreement between two readings from
the same cache is not corroboration.

**Coverage of a pure function adjacent to an impure one reads as coverage of both.** `runAlert_`
was thoroughly tested and `sendRunAlert_` was not tested at all, and the suite looked healthy.
Twice now the untested piece has been the one that decides whether anyone is told.

**The last step of building an alarm is hearing it ring.** Everything short of that — composing,
scoping, wording, routing — was done four times over while the delivery path stayed unexercised.
