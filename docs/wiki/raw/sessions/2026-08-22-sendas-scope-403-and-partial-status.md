# Session — 2026-08-22 · The send-as 403, the regression it caused, and the scope switch

Raw session source. Immutable. Synthesized into
`docs/wiki/concepts/workspace-email-signatures.md`.

## What was asked

Continuation of the Google Workspace Wave 1 workstream. The founder asked to "fix what's left
except Outlook for Windows because we cannot test that right now" — an explicit scope exclusion
that held for the whole session.

## What happened

### 1. The manual send-as route was executed, and it returned 403

Three shared addresses (`info@`, `support@`, `appstore@`) were added by hand as send-as
identities on `dame@dragoncandy.com` via Gmail → Settings → Accounts and Import → Send mail as.
Same-domain, so all three were accepted immediately with no verification email — that part of
the documentation was correct.

The installer then failed on them:

```
403 PERMISSION_DENIED
Missing required scope "https://www.googleapis.com/auth/gmail.settings.sharing"
for modifying non-primary SendAs
```

This falsified a claim written in four places (README, spec, wiki concept page, PROJECT_CONTEXT
§5): that the manual route needed no new permissions and only the account holder could complete
it. Google's reference lists `settings.sendAs.update` as accepting `gmail.settings.basic` **or**
`gmail.settings.sharing`. That is true of the **primary** identity. Non-primary writes require
`sharing`, and no documentation page states it.

Consequence: both routes — manual, and `sendAs.create` from the script — need the same scope.
The manual route was never the cheap one.

### 2. It caused a live regression

Adding those three identities made the nightly 2am run throw on the first unwritable one and
abort the whole user. From 2026-08-21 the run logged `ERROR` for `dame@` and stopped refreshing
even his own working primary signature. A wrong claim about permissions removed a working
feature rather than merely failing to add a new one.

### 3. #456 — per-identity isolation, PARTIAL, and the scope switch

- `isMissingSharingScope_(err)` classifies the 403 off the verbatim error body; the install loop
  counts it as `denied` and continues instead of throwing.
- `installAllSignatures` gained a **`PARTIAL`** status distinct from `ok` and `ERROR`, plus a
  `totalDenied` count, so a partly-refused run reads as neither success nor failure.
- Four unrelated error shapes are pinned by tests as things the classifier must **not** swallow.
- The zero-shared warning branches on whether anything was denied, and names the two-step fix
  and its order.

**Codex P1 (the one that mattered):** the runbook told an admin to add
`gmail.settings.sharing` to the delegation, but the impersonation JWT hardcoded
`gmail.settings.basic`. Granting the scope in the console would have changed nothing, produced
the identical 403, and left nothing to look at. Fixed with `requestedScopes_()` reading a
`SHARING_SCOPE_ENABLED` script property.

**The default is off, and that is load-bearing.** Requesting a scope the delegation does not
carry fails the **entire** token exchange with `unauthorized_client` — not just the shared
identities, but every signature for every user. So the order is not optional: admin console
first, script property second. Reversing it takes the whole system down. The reversal is
symmetric (property to `false` first, then remove the scope) and the error message says so.

Tests: 24 → 30. Codex clean after the P1.

### 4. Merge accuracy

The founder said "merged" while #456 was still `OPEN` (`mergedAt=null`). Verified with
`gh pr view` before acting on it; said so plainly; merged it. Earlier the same pattern appeared
in reverse — a request to "merge Wave 1" when Wave 1 was already merged. Four instances of
stated-state disagreeing with actual state in two days on this workstream.

## Left open at session end

- **#456 is merged (`b0f4e4de`) and NOT deployed.** `clasp push` fails with
  `{"error":"invalid_grant","error_subtype":"invalid_rapt"}` — a clasp reauth, browser-based and
  therefore the founder's. Until it lands, the live Apps Script runs pre-#456 code and `dame@`
  errors every night.
- **The `gmail.settings.sharing` decision is the founder's.** Nothing installs a shared
  signature until it is made.
- Outlook for Windows — explicitly excluded, recorded as untested. Matrix is four-of-five.
- `01 · Product` Drive folder still empty.
- Adrian and Joe hold `organizer` on the Confidential drive where `content manager` would do.
- Joe and Juwan have never signed in.

## Durable lessons

**A claim that something is impossible — or that something is free — is itself a claim, and the
only instrument that settles it is execution.** Three successive claims about this one mechanism
were asserted and falsified. The first two were caught by reading and by review. The third was
caught only by running it, and it is the one that broke production. Reviews catch claims that
contradict something already written down; they cannot catch a claim that is merely untested and
plausible.

**A runbook step that cannot work is worse than a missing one.** "Add the scope in the console"
was actionable, specific, and inert. An operator following it gets the identical failure with no
new information. Documentation that instructs an action the code does not support is a trap, not
a gap.

**A default that fails safe is worth more than a default that is convenient.**
`SHARING_SCOPE_ENABLED` defaults off because the failure mode of the wrong value is total, not
partial.
