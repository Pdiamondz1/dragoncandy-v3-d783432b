---
title: Social Provider Decision
type: concept
created: 2026-08-04
updated: 2026-08-04
sources: [docs/superpowers/specs/2026-08-01-outstand-zernio-cutover-design.md, docs/superpowers/specs/2026-08-04-zernio-api-capture-notes.md, docs/wiki/entities/outstand.md]
tags: [outstand, zernio, social, integration, decision, cost]
---

# Social Provider Decision

**Decision (2026-08-04): stay on [[Outstand]]. Keep the provider-agnostic seam. Do not
complete the Zernio cutover.**

A migration Outstand → Zernio reached Phase 2 (merged and live, PR #360) before a cost
question surfaced that unwound both of its justifications. This page records what was
actually true, so the reasoning is not re-derived — or re-broken — later.

## What was claimed, and what was true

| Claim that drove the migration | Reality |
|---|---|
| Outstand has a "hard ~7-connection cap" | **Real number, soft limit.** Plans carry an included-accounts quota (currently 10), but the dashboard states *"Additional accounts can be requested via support — no additional charge."* Free to raise. Not a ceiling on the marketplace. |
| Outstand has "effectively no analytics" | **False, and refuted by our own data.** Post `XDbxe` returned **1,388 views / 5 likes**, growing between the 24h and 72h snapshots. |
| Zernio is cheaper | **Inverted.** Outstand with Unlimited Posting is **flat**; Zernio bills per connected account, uncapped. |

## The cost shape is the whole argument

Outstand bills **activity** (posts). Zernio bills **supply** (connected accounts). DragonCandy's
account count grows with creators and businesses signing up; its revenue grows with businesses
*transacting*. Those are different curves, and Zernio's model taxes the one that grows first.

| connected accounts | Outstand (Unlimited Posting) | Zernio |
|---|---|---|
| 100 | ~$268 flat | $318 |
| 1,000 | ~$268 flat | $1,218 |
| 5,000 | ~$268 flat | $5,218 |
| 20,000 | ~$268 flat | $20,218 |

Zernio's graduated tiers (2 free, $6 for accounts 3–10, $3 for 11–100, $1 for 101+) converge
to ~$1/account. That is cheap per unit and unbounded in total. At Y1 ARR, 5,000 connected
accounts would have been **10–21% of revenue** — rivalling the 15%-of-revenue AI cap — with
the cost arriving alongside creator sign-ups and the revenue arriving later.

**Creator-package revenue does offset it**, but only for creators who transact: at a 10%
creator-absorbed fee, one $250 starter package covers a 2-account creator's entire year. The
residual is idle creators (5,000 at 20% transacting ≈ $96K/yr dead cost). Under Outstand's
flat model this whole problem disappears, which is why **no creator connection gate is being
built** — the requirement was deleted rather than engineered around.

## The two failures of reasoning worth remembering

**1. An asserted number became a sourced fact.** "~7-connection cap" appeared in exactly one
file — the spec that used it as justification. It was never traceable to a dashboard, a doc,
or a support reply. The wiki's own rule (*"Trace everything. Every claim traceable to a
source."*) would have caught it.

**2. Zero was read as unmeasurable.** [[Outstand]] concluded on 2026-06-11, from a single
YouTube post returning empty metrics, that our posts were "fundamentally unmeasurable" — two
bullets *after* correctly warning that an empty result is ambiguous. `XDbxe`, captured two
days later with real growing view counts, refuted it. Nobody re-checked, and the stale
conclusion was cited as a reason to migrate. **A post with no views returns 0; that is a
measurement, not a failure.**

Both errors share a shape: a plausible reading of thin evidence, recorded without its
provenance, then treated as settled. See [[Verify Before Reporting]].

## What is kept from the migration

The work is not wasted — it produced the thing that makes provider choice cheap:

- **`social-proxy`** — a provider-agnostic, op-dispatch gateway with tenant scoping enforced
  server-side from our own DB, independent of any provider's isolation model.
- **A second, proven adapter.** Zernio is fully implemented, live-verified (profiles, connect,
  analytics, webhooks) and dormant. Switching providers is now a row update on
  `business_outstand_accounts.provider`, not a rewrite.
- **Three real bug fixes** found along the way: `confirm-posting-schedule` picking accounts
  last-row-wins across a mixed provider set; `useDraftPosts` `.maybeSingle()`-ing a multi-row
  query and telling users with working accounts to reconnect; `MediaRef` missing the
  `contentType`/`size` that per-platform media validation gates on.

**Not done, deliberately:** the 37-file `@outstand-so/ui` SDK removal and the rebuild of seven
SDK components. That work existed only to escape Outstand. Staying makes it unnecessary.

## Open risk — ✅ CLOSED 2026-08-04

**Was:** quota raises are manual, with no self-serve path — another company's support queue
inside our onboarding flow.

**Outstand's reply closed it** (full text in `docs/runbooks/outstand-quota-request.md`):
**1,000 accounts pre-approved unprompted**, bumps *"within a day"*, **no upper bound that
"becomes a discussion about price"**, soft enforcement at the limit (hard restraint reserved
for abuse/DDoS patterns), and a usage endpoint to monitor —
`GET /v1/account/usage` → `socialAccounts:{current,limit,remaining}`.

**Do:** alert on `socialAccounts.remaining` so headroom is a monitored capacity metric rather
than something we hope to notice.

## Follow-ups the same reply opened

- **Analytics endpoints do NOT support tenant filtering** (posts and accounts do). Outstand
  offered to add it *"very soon"* on request. **This is load-bearing for Phase 4/6:** without
  it the analytics cron needs one call per account, and at 1,000 accounts that is 1,000 calls
  against a rate limit that itself scales with connected-account count. Ask for a
  tenant-scoped bulk analytics read.
- **BYOK for YouTube.** Google's quota is per-app, so on Outstand's shared keys our customers
  compete with every other Outstand customer for it. Outstand recommends bringing our own
  YouTube keys to get an isolated quota.
- **New Business plan, September** — higher post allowance at a lower fixed price, lower
  overage, SLA, priority support, and higher rate limits *customizable per customer request*.
  Worth evaluating against the current ~$268/mo.
- **Slack Connect channel** offered for direct support.

## Residual unknown

Instagram analytics have never been exercised on Outstand (all three measured posts are
YouTube), and `reach`/`engagement_rate`/`saves` were 0/null even on the working post —
plausibly because YouTube does not report reach. Confirm with one real Instagram post before
Phase 4 analytics work is built on the assumption.

Secondary: Instagram analytics have never been exercised on Outstand (all three captured
posts are YouTube), and `reach`/`engagement_rate`/`saves` were 0/null even on the working
post — plausibly because YouTube does not report reach. Worth one real Instagram post to
confirm before Phase 4 analytics work is relied upon.

## See Also

- [[Outstand]] — the entity page, including the settled analytics question
- [[Content Engine]] — the consumer of post-level analytics
- [[Donny AI]] — the reason analytics measurability is the deciding axis
