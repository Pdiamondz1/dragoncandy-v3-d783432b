# Session — 2026-08-23 · Closing "a warning is not a gate"

Raw session source. Immutable. Synthesized into
`docs/wiki/concepts/workspace-email-signatures.md`.

## What was asked

"let's fix what's left" — scoped by the founder to three of four offered items: the alerting gap,
Workspace housekeeping, repo housekeeping. Extending shared signatures to other accounts was
deliberately **not** selected.

## The alerting gap

"A warning is not a gate" had been recorded as a known issue three times without being closed.
Every round improved what the warning *said*; none made anyone read it. A `console.warn` lands in
Cloud Logging, which is seen only by someone who goes looking.

A run with a finding now emails `ALERT_EMAIL` via `MailApp` (as the **script owner** — unrelated
to the domain-wide delegation).

**Design choices, each with a reason worth keeping:**

- **Silent on a clean run.** A nightly "all fine" trains its recipient to filter the thread, and
  then the one that matters is filtered too.
- **A standing regression emails nightly** until fixed or the `SHARED_BASELINE` entry is cleared.
  The alternative is alerting on the transition only, and a transition alert missed at 2am is
  gone.
- **It cannot fail the run.** Signatures are already written by the time it sends; a mail error is
  caught and logged. Same "prefer the failure that loses less" reasoning as the baseline write.
- **`ALERT_EMAIL` unset means nobody is told** while everything else looks normal, so the run logs
  that explicitly rather than skipping silently.

## Two Codex findings, and the second changed the shape

1. **P1 — a failed *primary* signature raised no alert.** A direct consequence of the earlier
   per-identity isolation fix: a primary-identity failure is now caught rather than thrown, so the
   user was absent from every alert category and their own signature could silently stop updating.
2. **P2 — a scope denial on a non-company address raised no alert either.** Not degraded (not a
   shared identity), didn't throw.

Two holes in two rounds meant *enumerating causes was the wrong shape*. The alert now takes
**"every user whose run was not a clean `ok`"**, keyed off the same status the Sheet records. It
cannot fall behind the status logic because it **is** the status logic.

## The test finding worth more than the feature

Mutating the previous inline `status !== 'ok'` collection went **undetected by all 79 tests** —
every test touching that path fed `runAlert_` directly, so the collection itself was uncovered.
The predicate looked too trivial to test, and it decides *both* the Sheet's status column and
whether anyone is told.

Extracted as `runStatus_` and mutation-checked: removing the denial branch turns two red.
86 tests, up from 63.

## Also done

- **Confidential drive:** `adrian@` demoted `organizer` → `fileOrganizer` (Content manager),
  verified through the API rather than the UI that made the change. `joe@` deliberately left as
  `organizer` — he is a co-founder and CEO, and removing his ability to manage members of the
  company's confidential drive is a governance decision, not housekeeping.

## Stopped deliberately

- **`01 · Product` was left empty.** The two candidate documents are stale (`prd.md` last
  substantively touched 2026-06-01; `product-vision.md`'s only recent edit was the mechanical
  `.io`→`.com` pass), which was expected. What was not: `product-vision.md` line 15 describes Dame
  as a **"solo technical founder"**, and neither document mentions Joe Castelo or Juwan Robinson
  anywhere, while `PROJECT_CONTEXT.md` lists them as CEO and Shareholder. Both also state "35+
  tables" against a current 70+. Publishing that into a drive the co-founders can read would be
  worse than an empty folder. Escalated rather than uploaded.
- **Repo worktree cleanup** analysed but not executed — the worktree isolation guard blocks
  `git -C` into sibling worktrees, the same class of block as `refresh-main`.
- **Sign-in status of Joe and Juwan not re-verified** — the admin console demanded a password
  re-auth, which the assistant does not perform.

## Durable lessons

**Improving what an alarm says is not the same as making it audible.** Three rounds were spent on
the wording and the scoping of a warning nobody was receiving. The delivery question is separate
from the correctness question and does not get solved by solving the other one.

**An alert that fires on everything is an alert that fires on nothing.** Silence on a clean run is
a feature, and it is why the "not clean" condition has to be exactly right.

**A predicate too trivial to test is worth checking anyway when it gates something.**
`status !== 'ok'` decided who gets told, and no test covered it.

**Stale is a different problem from wrong-about-people.** A document with old numbers can be
banner-dated and published. A document that erases two co-founders cannot.
