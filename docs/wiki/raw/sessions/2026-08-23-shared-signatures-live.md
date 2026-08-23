# Session — 2026-08-23 · Shared-mailbox signatures go live

Raw session source. Immutable. Synthesized into
`docs/wiki/concepts/workspace-email-signatures.md`.

## What was asked

"grant gmail.settings.sharing" — the founder's decision on the scope, taken after #456
established that both routes to shared-mailbox signatures need it.

## What happened, in order

### 1. The scope grant (admin console)

Security → Access and data control → API controls → Domain-wide delegation → client
`117869070719843760682`. The edit dialog **appends a row rather than replacing the set**, so the
existing `gmail.settings.basic` had to be confirmed still present before authorizing — losing it
would break every signature. Verified both scopes on the list page afterwards.

A false alarm worth recording: after filling the new row, a zoomed screenshot appeared to show
`sharing` in the *first* field, suggesting `basic` had been clobbered. It had not — the dialog
had scrolled, and re-setting field 1 read back `basic` as its previous value. **A rendering
artifact is not state; read the value back.**

### 2. Deliberately not setting the property yet

`SHARING_SCOPE_ENABLED` was left unset even though the decision was made. Two reasons: the code
that reads it was undeployed, and a delegation grant propagates on Google's schedule — inside
that window, setting the property fails the *entire* token exchange with `unauthorized_client`,
exactly as doing the two steps out of order would. Nothing to gain from racing it.

### 3. The deploy

`clasp login` had been failing with `invalid_grant` / `invalid_rapt`. Re-authenticating fixed
it; `clasp push --force` then uploaded 3 files. Before pushing, `dist/` was rebuilt from
`origin/main` and grepped to confirm it carried `requestedScopes_`, `isMissingSharingScope_`,
`SHARING_SCOPE_ENABLED` and the `PARTIAL` status — deploying an unverified build was the whole
class of problem being fixed.

### 4. Run one — the load-bearing one

`installAllSignatures()` → **execution completed**, no `ERROR`, with a warning naming 3 refused
identities and both remediation steps in order. Log Sheet: `PARTIAL / 1 identity, 3 denied /
0 shared` for `dame@`.

**This run is what proves the fix.** It shows the per-identity isolation working — the personal
signature written, the three shared ones refused cleanly, the user not aborted. Without it, a
success after enabling the scope would not distinguish *the scope fixed it* from *the scope
masked a loop that was still broken*.

### 5. The property, then run two

`SHARING_SCOPE_ENABLED=true` set by the founder (the auto-mode classifier blocked the assistant
from typing into that page, reasonably — the service-account private key sits two rows above).
Verified persisted by reloading the settings page rather than trusting the "done".

`installAllSignatures()` again → **`ok / 4 identities / 3 shared`** for `dame@`;
`ok / 1 identity / 0 shared` for adrian, jay and joe. No `unauthorized_client`; roughly 40
minutes had elapsed since the grant.

## Verification approach

The execution log showing no warning was treated as insufficient. The log Sheet was read
directly, and it carries the whole arc in four rows: `ERROR` (8/21), `ERROR` (8/22), `PARTIAL`
(8/23), `ok / 4 identities / 3 shared` (8/23).

## Left open

- Shared identities exist on **no account but `dame@`**. Extending them is per-person; the
  granted scope now permits either the manual route or `sendAs.create`.
- Outlook for Windows: untested, untestable. Matrix is four-of-five.
- `01 · Product` Drive folder still empty; Adrian and Joe hold `organizer` where `content
  manager` would do; Joe and Juwan have never signed in.

## Durable lessons

**The intermediate check is the one that carries the proof.** A two-step fix verified only at
the end conflates "the second step worked" with "the first step was ever right". Run the
intermediate state deliberately and record it.

**Merged is not deployed.** #456 was correct in the repo for a full day while production ran the
broken code, because `clasp push` needed a re-auth. Nothing detected it — Apps Script has no CI
joining repo to live script — and it surfaced only because someone went to push.

**A dated status paragraph on a RAG-fed page has a short half-life.** This page's status block
was wrong twice in three days: "admin half outstanding" when it was done, then "pending deploy
and property" when both had landed within hours. Codex caught four P2s of exactly this shape
across five rounds. Date such lines and distrust them past their date.

**Verify a reported "done" before acting on it.** Four times in three days a stated state
disagreed with the actual one — a merge claimed that had not happened, a merge requested that
already had, and two stale status clauses. Each check cost seconds.
