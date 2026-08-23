---
title: Account Completeness Engine
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: [2026-08-23-account-completeness-engine.md]
tags: [onboarding, readiness, stripe, fail-open, first-run, verification]
---
# Account Completeness Engine

One derived model answering "is this account ready to do X". Slice 1 of four in the signup/onboarding
redesign. Lives at `src/lib/accountReadiness/`; shipped in PR #472 (`8889baef`, 2026-08-23).

## Why it exists

Two half-systems tracked the same facts different ways and could disagree:

- `deriveReadiness` + `ReadinessGate` — live-derived, correct, but knew only about Stripe and social.
- `MissionChecklist` + `profiles.first_run_missions` — a stored JSONB blob of booleans, written
  optimistically by whichever page the user happened to visit.

A stored boolean that disagrees with live truth is this project's recurring failure class — see
[[Updated-At Trigger Drift]] and [[Content Delivery State Machine]], both "recorded ≠ actual". The
engine deletes the stored half for anything derivable.

## The four states, and why `unknown` is one of them

`met` · `unmet` · `pending` · `unknown`.

- **`met` requires a definitive positive.** Never show "done" on the strength of a source we could not
  reach.
- **`pending`** is submitted-and-waiting (Stripe verifying). The old model collapsed this into a
  blocking state whose copy read as an error to someone who had already done the work.
- **`unknown`** is loading, erroring, or absent. **It never blocks and never renders as a failure.**
  In the checklist it renders as a neutral "Checking…" row; it is excluded from `outstanding`, so the
  attention list shows nothing for it.

**The contract that matters: a total API outage must produce zero outstanding items and zero blocked
actions.** Never a user locked out of the product because a read failed.

## Two tiers

`required` and `recommended`. Recommended items never gate anything and are dismissible, persisted to
`profiles.dismissed_requirements`. Deliberately NOT the existing `dismissed_coachmarks` column — both
are arrays of opaque string keys, so sharing one means a coachmark key silently dismissing a
requirement, with no type error to catch it.

## The action registry

Actions declare which requirement keys they demand (`ACTION_REQUIREMENTS`) and which roles may perform
them (`ACTION_ROLES`). `ReadinessGate` takes `action="apply_campaign"` rather than
`require={{stripe:true}}`, so "what does this cost" lives in one table instead of at each call site.
A registry-consistency test enforces that every key an action demands exists in the requirement set
for a role that can perform it — without it, an action demanding a key its role never has is a
permanent, silent block.

## The read split — a deliberate asymmetry

The checklist reads the cheap mirrored `stripe_onboarding_complete` column. The gate pays for the
authoritative Stripe read (`liveStripe: true`). The cost of being wrong differs by orders of magnitude
between the two surfaces: a briefly stale checklist is harmless, a stale gate costs money.

Both share the `['payout-status', role, orgUnitId]` cache key that `StripeConnectSetup` invalidates on
completion, so the gate refreshes the moment a user finishes setup. **Same key requires same shape** —
the hook caches the full `PayoutStatusData` and derives the narrow `StripeFacts` locally, because two
different shapes under one key is a last-write-wins corruption trap.

## What stays in `first_run_missions`

Only four keys, all pure engagement events with no row anywhere to derive from:
`browse_inspiration`, `view_campaigns`, `select_style`, `browse_creators`. **No derived requirement may
read the blob** — enforced by test.

**These four are load-bearing and easy to delete by accident.** `isFirstRun` never consults the
engine; it ends only when `completed_at` is stamped, which happens only when all four (1 for business,
1 for creator, 2 for brand) flip true via page visits. A checklist rendering only derived rows would
let a user reach "5 / 5" and stay in first-run mode forever. The checklist therefore renders both
sources — they track genuinely disjoint facts.

## Known Issues

- `AccountChecklistRows` was initially stubbed wholesale in two dashboard test suites to satisfy
  `QueryClientProvider`, leaving the mount points unverified. The fix is to mock the
  `useAccountReadiness` hook and let the real component render. The `RatingPromptManager` stubbing
  precedent does not apply — those hit Supabase directly and have no hook seam.
- `email_verified` will read `met` for essentially every current user, because `AuthForm` blocks
  unverified login. It stays in the table because slice 3's OAuth paths break that guarantee.
- The gate has never actually run in production: `READINESS_GATE_ENABLED` does not exist in
  `feature_flags`, so both call sites have been rendering children unconditionally since they shipped.

## See Also

- [[Anon Key Is Not Authorization]] — same lesson shape: a check that looks like a gate but is not one.
- [[Updated-At Trigger Drift]] — the "recorded ≠ actual" class this engine removes for readiness.
- [[Honest Analytics]] — sample-size gating; the same refusal to assert on unreachable data.
