---
title: Verify Before Reporting
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-email-verification-prod-exercise.md]
tags: [method, verification, controls, evidence, review]
---
# Verify Before Reporting

Five concept pages pointed here before this page existed, which is the strongest argument
for writing it: this is the method the project keeps re-deriving after it costs something.

**The rule.** Before reporting a result, establish that the check you ran could have
produced the opposite answer. A check that cannot fail is not evidence, however many times
it passes and however carefully it was reasoned about.

Everything below is a recorded instance, not an illustration.

## A probe that cannot distinguish yes from no is not a probe

The `.io` → `.com` mail migration needed one fact: does the `.com` mailbox receive? An SMTP
`RCPT TO` probe answered **250 for all five target mailboxes — and 250 for two nonsense
control addresses**, because Google's MX does not disclose recipient validity at `RCPT`.
Without the controls it would have read as *"all five confirmed"* and licensed the flip.
`.io` was unprobeable in the other direction (IONOS answered `554 blocklisted`), so
**neither TLD could be established by probing at all**. What settled it was reading the
Workspace admin console: all five are aliases on one live mailbox — the *routing*, which is
strictly stronger than a single delivery.

*When a probe cannot distinguish a true answer from a false one, no number of runs makes it
evidence. Change instrument.*

## A zero needs a control that could have been non-zero

A body-scroll probe reported "no scrolling" **twice** and was used, in writing, to talk the
founder out of a real Codex finding. It measured `main` — not the document's scroll
container — inside an emulator, where there is no collapsing URL bar, so `100vh === 100dvh`
and the gap being measured is *structurally* zero. Forced control: with the shell 80px over,
`body.scrollTop` moves to 80 while `html`, `#root`, the shell and `main` all read 0.
See [[Mobile Viewport & Fixed Positioning]].

The same shape recurs whenever a count comes back empty. `x_account_connections` showing
**zero RLS policies** only means something because the identical query against `profiles`
returns 7 — a 0 looks the same whether the answer is zero or the question is wrong. And a
5-parameter RPC called with `{}` returns `PGRST202` whether or not it exists, because no
zero-argument overload can ever match; the first reading of "absent" was an artefact of the
question. See [[Identity & Address Verification]].

## The report is not the result

`MailApp.sendEmail` hands off to Google and returns, so a rejection lands milliseconds later
outside the execution. The Workspace alerting ran for weeks returning `true` and logging
success while reaching **0 of 3 recipients**, both providers, each bounced within 0.16s.
*Every sender-side signal is the sender's view, and a missing bounce message is not evidence
nothing bounced.* See [[Workspace Email Signatures]].

Meta's App settings answers `{"success":true}` and then discards a multi-field write — four
fields saved, all four reverted on reload. *A vendor's success flag is not evidence the value
stuck.* See [[Instagram Insights Connector]].

A shell is no better. `! cd X && cmd` parses as `(! cd X) && cmd`, so the directory changed
and nothing else ran, silently. *A shell printing nothing has not necessarily done nothing;
one printing success has not necessarily done anything — check the target, not the report.*

## Recorded is not actual

The migration ledger records that a migration ran; it does not record that its objects exist.
This project has **three** cases of `recorded ≠ actual`, including a whole collaboration state
machine that the ledger called applied and prod did not have, and a shared trigger function
whose entire body on prod was `-- Function logic here / RETURN NEW;` while both repo
definitions were correct. Verify by object — `pg_proc`, `information_schema`, `to_regclass` —
with an invented name as the control. See [[Content Delivery State Machine]] and
[[Updated-At Trigger Drift]].

The same distinction runs through the deployment chain: **merged is not deployed, and deployed
is not exercised**. `PROJECT_CONTEXT.md` §5 collapsed those repeatedly, which is why its
"Built — awaiting founder go-live" section carries its own staleness warning.

## An empty result is ambiguous, not a finding

A 2026-06-11 conclusion that our posts were *"fundamentally unmeasurable"* rested on ONE
empty-metrics YouTube post — two bullets after the same document warned that an empty result
is ambiguous. A post captured two days later returned 1,388 views growing between snapshots.
Nobody re-checked, and the conclusion nearly cost a platform migration.
*A post with no views returns 0; that is a measurement, not a failure.*
See [[Social Provider Decision]] and [[Honest Analytics]].

## The instrument encodes an assumption, and the assumption is usually the bug

A check for a dangling `[[wikilink]]` ran `grep -F "[[Name]]"` and passed — by matching a
*prose mention* inside another entry. Resolution requires a **catalog** entry (`^- [[Name]](`),
so the grep answered a different question than the one asked. A prod-verification probe
grepped only the scripts named in the root HTML, while the page under test is a lazy chunk
that could never appear there; the negative control returned 0 the same way, which was the
tell. See [[Knowledge-Sync Automation]].

The costliest instance so far was nearly a filed P1. Reading production verification mail
through the claude.ai Gmail connector, every link came back corrupted — `?token=29ece178`
as `?token)ece178`, `width=device-width` as `width`+`Þ`+`vice-width`. It was mechanically
consistent with quoted-printable decoding of an unescaped `=`: every `=` followed by two hex
digits eaten, every other `=` (`initial-scale=1.0`, `href="https`) untouched. Since a UUID
always follows `?token=` with hex, the reading was "100% of verification links are broken",
and it had been *tested* — the corrupted form returned `missing_token`, the stored token
returned `verified=1`.

It was still wrong. **An unrelated sender's mail showed the identical damage** — an X Corp
login notification, whose links demonstrably work for millions of people. The corruption is
the reader. Confirmed hours later from the other end: the founder clicked the real buttons
in a real mail client and the edge function logged `token_prefix: "29ece178"`, intact, where
the agent's own corrupted probe had logged `token_prefix: ")ece178-"`.

**The first control chosen could not have detected it.** A Google Apps Script notification
came back clean — because it happens to contain no `=` followed by two hex digits
(`?trigger_id=td…`, and `t` is not hex). A control that comes back clean because it cannot
express the failure is not corroboration; it is the same nothing as no control at all. Pick
a control that carries the pattern you are testing for. See [[Email Verification Routes]].

*State what the instrument would have to see to say no. If you cannot, you are not measuring.*

## An idempotent success branch turns the whole test into a false pass

`consume_email_verification_code` returns `ok:true, reason:'already_verified'` before it
looks at the code, so that a double submit — or a race with the emailed link being clicked
on another device — never errors about something that already worked. Correct behaviour, and
it makes any verification test run against an already-verified account a guaranteed pass.

Measured on prod rather than reasoned about: the **wrong** code `999999` returned **HTTP 200
success**. With `email_verified` set false, the identical request returned **400 `mismatch`**.
Same endpoint, same input, opposite answers — which is what made every later result on that
route mean something. See [[Email Verification Routes]].

*Before testing a success path, ask what the system does when the work is already done. If
that answer is "succeed", the precondition is the test.*

## Two observations of the same thing are not two pieces of evidence

The YouTube connector's revoke was reported as confirmed by the code path **and**
"independently" by Google dropping into a consent screen after disconnect. The second is not
evidence of anything: `buildAuthUrl` sends `prompt=consent` on every authorization, so the
screen appears either way. It felt like corroboration only because it was a second
observation. See [[YouTube Analytics Connector]].

## Applying it

- Name the control before running the check, not after it comes back clean.
- Prefer the reading that could have gone the other way: an object over a ledger row, a
  console over an email, the target over the command's exit code.
- A claim that something is unverifiable is itself a claim. Edge secrets were called
  unlistable in writing, and on that basis left unchecked for two days; `supabase secrets
  list` returns every name, digest and `updated_at`.
- When a review disputes a finding, verify before accepting **or** dismissing. Refuting
  correctly is as much work as confirming.

## See Also

- [[Content Delivery State Machine]] — the original `recorded ≠ actual`
- [[Updated-At Trigger Drift]] — a trigger that fired and did nothing
- [[Honest Analytics]] — the product-facing half of the same discipline
- [[Social Provider Decision]] — what an unchecked empty result nearly cost
- [[Mobile Viewport & Fixed Positioning]] — the probe that measured the wrong element
- [[Workspace Email Signatures]] — success logged for zero delivered
- [[Email Verification Routes]] — the instrument, the idempotent branch, and a real click that settled both
- `codex-review` — the second reader that catches what one model's controls do not
