# Session: onboarding slices 3 and 4 — the wizard, and the depth dimensions

Date: 2026-08-24
Branch: `feat/onboarding-slice-3` (carries both slices)

## What was asked

"Let's finish the onboarding — start with slices 3 and 4", then narrowed by the founder to
"we need a restyled wizard with slides to represent each phase of the onboarding", then
"continue into slice 4 on the same branch".

Three decisions taken before building: social login is built flag-off (the founder
configures the consoles later), slice 3 goes first, and the wizard carries required
requirements in-flow with optional ones on a closing slide.

## Slice 3 — the wizard

`src/components/onboarding/steps.ts` is new and declarative: `ROLE_STEPS` per role,
`STEP_PHASE` splitting slides into collect / service / ready, and `REQUIREMENT_STEP`
mapping a requirement key to the slide that satisfies it. A test asserts the wizard
carries a slide for every `required` requirement, with a forced control proving the test
can fail.

**The core save moved to the collect/service boundary**, not the end. Every slide after it
acts on rows that must already exist — `verify-address` reads the stored address back
rather than trusting the client, and Stripe Connect needs a profile to attach an account
to. It also closed an abandonment bug: someone who quits on the payments slide now has a
complete profile and a working dashboard instead of an account that captured nothing.

`usePhoneVerification` is the first caller of `verify-phone` in `src/`, and pins two
contract traps: a wrong code returns **HTTP 200** with `{status:'unmet'}`, and non-2xx
bodies live in `error.context`, not `data`.

## Slice 4 — depth

Locations, team and Outstand linking, checked against production rather than assumed.

- **Locations.** The `address` requirement is `required`, resolves to the Locations page,
  and is unmet for every business on the platform (30 org units, 4 with any address, 0
  verified). The page said nothing about addresses. Each card now carries its status with
  a hint for the two states that are not done, and saving waits for verification instead
  of racing it.
- **Team.** `deriveTeam` counted only active members, so inviting someone left "Invite your
  team" reading exactly as before. It now returns `pending` while an invitation is
  outstanding. Nothing on production is in that state (26 orgs, 26 members, all active,
  zero invited) — which is why nobody noticed: the honest state was unreachable.
- **Social.** Already complete end to end. `outstand-proxy` writes the mirror row,
  `?section=social` opens the right accordion in both settings pages. Verified, not
  changed.

## Two requirements no brand could ever satisfy

Found while checking slice 4's dimensions against production.

**`address`.** The spec says in as many words (§4.4) that `address` is business-only,
because a brand's primary `org_unit` is a `product` and demanding a street address of it
"would be a requirement no brand can meaningfully satisfy". Slice 1 obeyed it; slice 2 added
the row back with no note. Production: 7 brand units, all products, zero addresses, and the
page the row pointed at offers a Website URL field. Removed, and pinned by a test with a
control.

**`stripe`.** There is no brand Connect path at all: both restaurant functions filter
`account_type = 'restaurant'` on every statement, and brand settings has never rendered
StripeConnectSetup — its "Payments" section is a budget-range field. 6 brands, 0 Stripe
accounts. The new payments slide would have been the first place a brand was offered
Stripe, and it would have silently done nothing. Slide removed for brands; the requirement
stays on the checklist, recorded rather than faked, because brands genuinely do need to
fund sponsorships and `publish_campaign` demands it.

## The Codex loop — ten rounds, twelve findings, all real, all mine

Worth recording because the shape repeats: nearly every finding was a consequence of a
change made earlier in the same session, not of the original code.

1. The org query is a separate React Query cache from AuthContext's profile, so a new
   business kept `{ org: null }` and the address slide could never resolve a location.
2. `coreSaved` was a one-way latch — going back, editing a field and continuing showed the
   edit and discarded it.
3. Brands routed to a Stripe flow filtered to restaurants.
4. Stripe's return URLs are built server-side and leave the wizard.
5. The closing slide filtered on "maps to no slide" rather than "this role has no such
   slide", so `address` vanished from a creator's onboarding entirely.
6. Past the bounded wait, nothing noticed when the abandoned verification landed.
7. `1 (201) 555-0134` became `+112015550134` — a shape `isE164` accepts and Twilio rejects.
8. A new business could reach the address slide before its auto-created location loaded.
9. The loading guard folded "failed" into "loading", disabling the button forever under a
   message about progress that was not happening.
10. Moving the save earlier let it beat `useAutoDetect`, so a creator who tapped through
    quickly saved nulls and nothing ever asked again.
11. The delayed re-save watched the whole fingerprint and fired on every keystroke.
12. It also reran the whole `saveCore`, persisting half-edited form values and retrying a
    failed write on every render.

## Three method notes worth keeping

**A forced control changed a conclusion twice.** The double-tap test passes with either
guard removed and fails only with both — so it pins the pair, not the ref, and the comment
now says so, because "the suite still passes" is exactly the argument that would delete the
half doing the work. The retry-loop test first asserted against elapsed time and its
control passed: the retry needs a re-render to re-run the effect, and the harness was
providing none.

**The registry drifted from its spec twice, silently, in the same direction.** Both times a
later slice added a requirement the spec had explicitly excluded, with no note. Comments
beside the entry did not hold; tests do.

**Prod answered questions the code could not.** Whether brands have addresses, whether any
org has a second member, whether a brand has ever held a Stripe account — each was one
query, and each changed what got built.
