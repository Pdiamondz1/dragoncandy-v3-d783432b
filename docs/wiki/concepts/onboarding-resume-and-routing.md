---
title: Onboarding Resume & Post-Login Routing
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-onboarding-prod-test.md]
tags: [onboarding, auth, stripe, routing, readiness]
---
# Onboarding Resume & Post-Login Routing

How a user gets **into** onboarding, **out of** it, and **back into** it. Three defects on
that path shipped as PRs #521 and #523, all found by driving a real creator signup on
production on 2026-08-24 — none was reachable locally, because the edge-function CORS
allow-list admits only prod origins, `capacitor://localhost` and Lovable.

## 1. Leaving for Stripe left the wizard

`create-*-connect-account` hardcoded the hosted Connect link's `return_url`/`refresh_url` to
`${origin}/dashboard/<role>/settings`. Correct when the user started in settings; wrong on
**step 5 of 5**, where "Complete Setup" handed them to Stripe and Stripe handed them to
Settings. Onboarding was simply abandoned.

The clearest evidence was already in the code: the slide carried copy apologising for it
("Stripe takes over from here and returns you to your settings, not to this page") and a
comment asserting the client could not influence it. **When a component apologises for its
own behaviour, the behaviour is the bug.**

`_shared/connect-return.ts` now resolves the destination. **The caller never sends a URL** —
it sends a PATH, the origin is decided server-side, and they are joined inside the helper,
so no caller value can point at another host even in principle. On top of that the path must
**equal** an allow-list entry, so it is not a prefix check `/profile/setup/../../evil` could
escape. Two guards kept because they fail differently: one bounds the damage, the other
bounds the set. An unrecognised path falls back rather than erroring — failing a money flow
over a cosmetic field is the wrong trade — but is **logged as rejected**.

## 2. Returning to the wizard would have destroyed profiles

Hosted onboarding is a full navigation off-site and back, so `/profile/setup` remounts with
every field at its initial value and `currentIndex` at 0. The creator write is
`upsert(..., { onConflict: 'user_id' })` with **no `ignoreDuplicates`** — Continue on that
blank slide 1 would have written empty strings over name, bio and skills.

**The bug being replaced merely ended onboarding early and left the data intact.** Shipping
the return path alone would have turned it into onboarding destroying a profile. Hence
hydration + resume, which took three further review rounds, each a data-loss path of its own:

| Draft | Why it was still wrong |
|---|---|
| Treat a failed read like an absent row | Opposite cases. Absent = new signup, blank form correct. Failed = we do not KNOW, and blanks may overwrite. The comment justified it by reasoning about the first-time user, while the dangerous case is the returning one. |
| Restore the avatar into `avatarPreview` only | `saveCore` derives `avatarUrl` from a fresh upload, so a later save wrote `avatar_url: null` and deleted a picture visible on screen throughout. |
| Check a "hydration failed" flag | False while the read is still PENDING. A fast user saves before hydration lands. Fixed by **awaiting** the read, not by adding a second flag. |

Writing the test for the third exposed a fourth, in the fix itself: the effect's cleanup set
`cancelled` on **every re-render** while the once-only ref stopped it restarting, so the
single in-flight read aborted partway and resolved `{ ok: true }` having applied nothing.
The same data loss by a third route — invisible to any test that did not hold the read open.

## 3. `is_completed` means "the rows exist", not "onboarding is done"

`saveCore` sets `<role>_profiles.is_completed` when the user leaves the **last collect
slide** — before phone, address, payments or ready — and does so ON PURPOSE, so someone who
quits inside Stripe still has a working dashboard. `AuthPage` read the same column as
"onboarding is finished" and sent them to their dashboard.

**One column, two readers, two meanings** — the same class as `stripe_onboarding_complete`
having two disagreeing readers ([[Donny-First Dashboard]]) and the applied-vs-recorded
migration split ([[Updated-At Trigger Drift]]). Measured: `creator_done` was true twelve
minutes before the phone was verified.

`wizardResumeStep` answers the narrower question — *is there required, user-actionable work
left in the wizard, and which slide is it?* — derived from the registry the wizard renders
from (`ROLE_STEPS` + `REQUIREMENT_STEP`) rather than a hand-listed set, because that registry
has already drifted from its spec twice in the same direction.

**The opposite failure is the one to design against.** Routing on full readiness would trap a
user for as long as a third party takes to answer. Anything unreadable stays `undefined` →
`unknown` → never counts, so this can only fail to send someone back, never trap them. Given
the alternative failure is "user cannot reach their account", that is the right direction to
be wrong in.

### What "waiting on someone else" actually means

- `deriveStripe` returns **`pending`**, not `unmet`, for a connected-but-incomplete account —
  so the engine already excludes that case. `deriveIdentityVerified` returns a plain
  **`unmet`** in the equivalent state. *Two derivations, two different answers to what looks
  like the same question*; checked rather than assumed.
- **Anything Stripe still lists is the user's to supply.** `stripe_requirements_due` mirrors
  `currently_due`/`past_due` — fields Stripe wants FROM the user, identity documents
  included. An earlier draft excluded every identity-prefixed key and so sent exactly those
  people to the dashboard with an upload outstanding. Only an **empty** due list is Stripe's
  turn.
- **`maybeSingle()` on `org_units` errors once an org has a second location.** Swallowed,
  that left `orgUnits` undefined and exempted every multi-location business from the required
  address step.

## 4. Two smaller routing defects on the same path

**The effect fired twice.** Its deps include `searchParams` and two `useCallback`s whose
identities change as auth resolves. Two redirect chains racing through a `<Navigate>` hop
left the browser on a route rendering `null` — a blank page after login, reproduced on
production with a cold cache as two chains **135 ms apart**. Latched to fire once, and the
hop **deleted rather than sequenced**: straight to `/profile/setup` instead of bouncing
through `/profile/{creator,business,brand}`.

**The destination showed nothing.** Creators landed on `/dashboard/creator/campaigns`, but
the readiness checklist renders in `CreatorDonnyHome`/`FirstRunDashboard` — the dashboard
*home*. A half-onboarded creator saw a campaign list with required work outstanding and
nothing saying so.

The resume step travels as `?step=`. It arrives in a URL, so it is **untrusted**: honoured
only for a slide the role actually has, and never for `ready` — otherwise a hand-typed
`?step=ready` skips onboarding entirely, which is this very bug by a shorter route.

## Known limit

For the account that reported it, the routing change altered only the **destination**. Its
Stripe derives `pending`, its identity is unmet solely via `requirements.pending_verification`
(Stripe's verdict), and `address` is merely `recommended` for creators — so there is
genuinely nothing left to *do* in the wizard and `wizardResumeStep` correctly returns null.
Verified against the real row. What fixed that user's experience was seeing the checklist.

## See Also

- [[Onboarding Wizard & Depth]] — the wizard these fixes route into.
- [[Account Completeness Engine]] — the registry `wizardResumeStep` derives from.
- [[Identity & Address Verification]] — where the Stripe-derived columns come from.
- [[CSP Applies To Every Redirect Hop]] — same session, and why city/country were still null.
