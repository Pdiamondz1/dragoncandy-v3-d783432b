# Session — 2026-08-23 · The alarm that rang into a wall

Raw session source. Immutable. Synthesized into
`docs/wiki/concepts/workspace-email-signatures.md`.

## What was asked

"Walk me through sending a test alert on the browser." That is, run the `sendTestAlert()` that
#466 had built and never fired, and prove the alert email arrives.

It did not arrive. The rest of the session is why.

## The finding

**`MailApp.sendEmail` is silently undeliverable to external recipients from this project, and
`GmailApp.sendEmail` is not.** The alert had never worked. It could not have worked on any day
since it was built.

Measured on prod via Admin > Reporting > Email Log Search:

| Transport | Recipients | Result |
|---|---|---|
| Gmail-composed, same sender | lvatchkov@hotmail.com, adrian.vella.jobs@gmail.com, joe@coalition-films.com | **3 of 3 Delivered** |
| Apps Script `MailApp` | dwilliams@harbormill.net (7:41), damewillie@gmail.com (10:49), damesonpoint@gmail.com (11:25) | **0 of 3**, each `Bounced` in 0.11–0.16s |
| Apps Script `GmailApp` | damesonpoint@gmail.com (11:47) | **Received** |

Two providers, three addresses, one sender, one week. The variable is the transport.

## Why it survived four rounds of work on the same feature

**`MailApp` cannot report this failure.** It hands the message to Google and returns; the
rejection happens milliseconds later, outside the script's execution. So `sendRunAlert_` returned
`true`, the execution log said "accepted for delivery", and the run was recorded as a success —
for every one of those bounces.

#463, #466 and two rounds before them improved *what the alert said* and *when it fired*. Nobody
had ever received one, and nothing in the system could tell them that. The only reason it
surfaced now is that someone deliberately fired the alarm at an address they could check.

## Three wrong turns, kept because each one has a reusable shape

**1. "No bounce message in the mailbox, so nothing bounced."** A search of `dame@` found no NDR,
and I concluded the failure was on the receiving end. Email Log Search then showed an explicit
`Bounced`. **A missing non-delivery report is not evidence that nothing bounced** — Google's own
relay rejected these before any NDR was generated.

**2. DKIM.** `dragoncandy.com` had no DKIM record at all, which I called the likely cause. It was
a genuine defect and is now fixed — key generated, published at GoDaddy under `google._domainkey`,
verified byte-exact against the authoritative nameserver and at 8.8.8.8, and the admin console now
reads "Authenticating email with DKIM." **It was not the cause.** The bounces did not change when
it landed, and the RAW headers showed `d=dragoncandy.com; s=google` signing was already live. A
real bug found while chasing the wrong hypothesis is still a real bug; it is not a confirmation.

**3. "That address probably doesn't exist."** Offered as an explanation for the second bounce. All
three were the founder's own addresses. The correct move at that point was not another guess but a
2×2 — same sender, two transports, two recipients — which is what finally isolated it.

## The instrument lesson, twice

Every sender-side signal agreed the mail was fine: the execution log said accepted, the message
appeared in Gmail's Sent folder, the Gmail API returned an id. All four are the *sender's* view.
Only the Email Log Search recipient row, or the recipient's own inbox, is evidence of delivery.

Then the same trap on the other side. Searching Email Log Search by the new message's `Message-ID`
returned **0 results**, which reads as "never sent". Before believing it I ran the known-good
`Message-ID` of the 11:25 bounce through the identical query: **1 result**. So the query worked and
the zero was real — most likely indexing lag on a 20-minute-old message. The zero was *not*
evidence of failure, and the founder's inbox settled it. **When a probe returns zero, prove it
could have returned non-zero.**

## The header tell

The two transports are distinguishable from headers alone, which is worth knowing for next time:

- `MailApp` → `Message-Id: <autogen-java-<uuid>@google.com>`
- `GmailApp` → `Message-Id: <CA...@mail.gmail.com>`, `Received: ... by gmailapi.google.com with HTTPREST`

The `@mail.gmail.com` family is what Gmail-composed mail carries. Reading that header is the
cheapest way to confirm which route a message actually took.

## The scope, and a refuted P1

The change needs a scope swap: `script.send_mail` (MailApp) → `gmail.send` (GmailApp). Adding a
scope invalidates the existing authorization, so the owner must re-consent by hand before the
nightly trigger works again.

**Codex flagged `gmail.send` as a P1**, on the grounds that Google's GmailApp reference lists
`https://mail.google.com/` for `sendEmail` and does not mention `gmail.send` — predicting that
deployed sends would fail authorization and `sendRunAlert_` would silently return `false`.

The documentation says exactly that. The prediction is still wrong. Refuted two ways:

1. The alert **sent and was received** on the deployed build.
2. The account's actual grant list reads "Send email as you" (`gmail.send`) and does **not**
   contain "Read, compose, send, and permanently delete all your email" — the consent label for
   `https://mail.google.com/`. That scope is not granted, and the send worked anyway.

Adopting the suggestion would have converted a send-only grant into full read-and-delete over the
owner's mailbox in order to send one alert. The narrow scope stays, with the evidence recorded in
`build-gs.mjs` so the next reader does not re-derive the same "fix" from the docs. Codex was clean
at round 2.

**The generalisable half:** a documentation-derived P1 is a hypothesis about runtime behaviour, and
runtime is checkable. Reading the *granted* scope list is the control that separates "this works
because the scope is sufficient" from "this works because something broader was granted" — and
without that control, the observation alone could not distinguish them.

## What shipped

- `sendRunAlert_` calls `GmailApp.sendEmail(recipient, subject, body)` — **positional**, where
  `MailApp.sendEmail` takes a single options object. A straight symbol swap would have sent to
  `undefined` while every existing test passed.
- The test stub was changed to positional arguments for the same reason.
- Manifest scope `script.send_mail` → `gmail.send`, via `build-gs.mjs`.
- A new test pins the transport as a **text assertion** on the source, because the property is
  unobservable at runtime: no stub and no `try/catch` can see a rejection that arrives after the
  call returns. Mutation-verified — reverting to `MailApp` fails 6 tests, this one by name.
  **97 tests, was 96.**
- Its first version failed on my own comment, which discusses `MailApp` at length. It now strips
  comments before matching. A test that fails on documentation teaches the next person to weaken
  it.

## Still open

- The nightly trigger has not yet fired on the new transport. Manual and triggered runs share one
  authorization, so it should hold, but it is unobserved.
- `script.send_mail` remains in the account's grant list as residue from the old manifest. It is
  harmless — nothing calls `MailApp` — and will not be requested on a fresh consent.
- Whether `MailApp` is blocked by a Workspace policy, a reputation heuristic, or something else is
  **unknown**. The fix routes around it rather than explaining it.
