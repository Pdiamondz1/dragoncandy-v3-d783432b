---
title: Email Verification Prod Exercise Session
type: source
created: 2026-08-26
updated: 2026-08-26
sources: [raw/sessions/2026-08-26-email-verification-prod-exercise.md]
tags: [auth, onboarding, verification, prod-verification, controls, evidence]
---

# Email Verification Prod Exercise Session

Summary of the 2026-08-26 session that drove both email-verification routes against production
on `dame+onboardtest@dragoncandy.com`, retiring part of the [[Email Verification Routes]] pending
clause carried since #530/#531 shipped earlier the same day. Documentation-only outcome: no code,
migration or edge-function change. Synthesis lives on [[Email Verification Routes]] (per-leg
coverage) and [[Verify Before Reporting]] (two method instances).

## Key claims

- **Coverage is partial and the page says which legs.** Send → Resend → real inbox, the emailed
  link clicked by a person, and the code accepted with its budget spent are covered. The six-digit
  input in a browser, a fresh signup, and the login form are **not** — the account pre-existed and
  its session came from an admin `generate_link` exchange.
- **The result only means something because of one flip.** `consume_email_verification_code`
  returns `already_verified` before reading the code, so the WRONG code `999999` returned HTTP 200
  on the verified account; after `email_verified` was set false the same request returned 400.
- **The attempt budget is per user, shown not asserted.** `remaining` fell 9 → 8 across two
  different wrong codes; a per-code budget answers 9 twice.
- **Three tokens were issued and the order is load-bearing.** Two were spent by the agent, so the
  founder's first clicks correctly failed `invalid_or_used`; a third was sent and left untouched
  for a human to click, consumed 21:26:02.
- **A P1 was nearly filed and was wrong.** Verification links read back corrupted through the
  claude.ai Gmail connector; an unrelated sender's mail showed identical damage. The first control
  tried could not have detected it.
- **An empty table is not proof of non-use.** Zero rows at inspection was briefly written up as
  "the feature never ran"; a nightly expiry cron had swept the 2026-08-24 row. The defensible bound
  is the ship date of `code` and its template.

## See Also

- [[Email Verification Routes]] — the concept page this session's evidence updates
- [[Verify Before Reporting]] — the instrument failure and the idempotent-branch trap
- [[Identity & Address Verification]] — the phone/address half of the same slice
