---
title: Onboarding Wizard & Depth
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-onboarding-wizard-and-depth.md]
tags: [onboarding, readiness, wizard, stripe, brand, verification]
---
# Onboarding Wizard & Depth

Slices 3 and 4 of the signup/onboarding redesign, built on one branch. Slice 3 rebuilt the wizard as
slides driven by [[Account Completeness Engine]]'s registry; slice 4 gave the depth dimensions —
locations, team, social — surfaces that can actually satisfy them.

## The wizard is declarative, and the registry is its authority

`src/components/onboarding/steps.ts` holds three tables: `ROLE_STEPS` (which slides a role gets),
`STEP_PHASE` (collect / service / ready), and `REQUIREMENT_STEP` (which slide satisfies which
requirement key). A test asserts every `required` requirement has a slide, and carries a forced
control — it gutts a role's slides and checks the comparison fails.

**Collect slides gather values; service slides talk to somebody else.** Phone verification, address
geocoding and Stripe Connect are all somebody else's answer, so they never block: the forward button
on an incomplete service slide reads "Skip for now", never "Continue", because labelling it Continue
would imply the step had been done.

## The core save runs at the collect/service boundary

Not at the end. Every slide after it acts on rows that must already exist — `verify-address` reads
the stored address back rather than trusting the client, and Stripe Connect needs a profile to attach
an account to. It also closed an abandonment bug: someone who quits on the payments slide now has a
complete profile and a working dashboard, instead of an account that captured nothing.

**Moving it forward created three problems, all found by review, all worth knowing:**

1. **The org query is a separate cache.** `useOrgFromProfile` runs on mount and caches `{org: null}`
   for a new business; the core save is what fires `trg_auto_create_org`. `refreshProfile()` does not
   touch React Query, so the address slide could never resolve a location. The save now refetches
   that query and awaits it.
2. **It can beat auto-detection.** `useAutoDetect` waits out a geolocation timeout, so a creator who
   tapped through quickly saved null city/country/timezone and nothing ever asked again — losing the
   location nearby matching runs on. The fingerprint now carries the detected values, and an effect
   writes **only those three columns** when detection lands late.
3. **It made `goNext` async.** Two clicks ran two saves and two `setCurrentIndex(prev => prev + 1)`
   calls, advancing two slides and skipping phone verification entirely.

## Dirtiness is a fingerprint, not a flag

The save was first gated on a "have we saved once" boolean, so going back, correcting a name or
cuisine, and continuing showed the edit and discarded it — the recorded-vs-actual split the readiness
engine exists to close, reproduced inside its own onboarding.

`coreFingerprint` compares the values instead. **Not a dirty flag wired into every setter**: a missed
setter fails silently and looks exactly like working code, where a field missing from the fingerprint
is one place to look and is pinned per-field by a test. It is captured at the start of the save and
stored on success, so a field edited while a save is in flight stays dirty rather than being marked
clean by a save that never saw it. Chip order and surrounding whitespace are deliberately not edits;
the avatar contributes its file identity, so re-selecting the same picture is not worth another
upload.

## The delayed location write touches only the location

The late-detection path first reran the whole `saveCore`, which was wrong twice: it writes the entire
profile from live form state, so detection settling while someone was mid-edit on a collect slide
would persist that half-finished value (an emptied name stored as `full_name: ''`) bypassing the
validation Continue enforces; and it left the key unchanged on failure while toggling `loading`, an
effect dependency, so a persistent failure retried on every render.

It now updates city, country and timezone and nothing else, records the attempted key **before** the
await so a failure is attempted once, and fails silently to the console — nobody asked for this
write, and losing it costs nothing the checklist does not already show.

## Locations: the address requirement finally has a surface

`address` is `required` for business, resolves to `/dashboard/business/locations`, and was unmet for
every business on the platform — 30 org units, 4 with any address, 0 verified. The page said nothing
about addresses.

**Three states, because the database holds two facts.** The address string and the server-written
`address_verified_at` stamp, and nothing meaning "a geocode is in flight" — a fourth state would be
invented. `unconfirmed` deliberately does not mean wrong: the column shipped with no backfill, so
every location predating it reads unconfirmed however correct its address is, and the copy has to
survive that.

**Saving waits for verification instead of racing it.** `onSuccess` invalidates the units query
immediately, so a fire-and-forget geocode lost that race every time — the refetch landed before the
stamp was written and the owner's only evidence that anything had happened was that nothing had. The
wait is bounded (`functions.invoke` carries no timeout of its own) and the helper resolves on every
path, so a Google outage still leaves the address saved. Past the bound, an invalidation is attached
to the abandoned request, because "the next refetch picks it up" assumes a next refetch and the user
is sitting on the page.

**Creating a unit stays fire-and-forget**, and the asymmetry is deliberate: that path navigates to
Settings, so nobody is watching the badge when the geocode lands.

## Team: invited is `pending`, not `unmet`

`deriveTeam` counted only `invitation_status='active'`, so sending an invitation changed nothing on
the checklist — it kept asking someone to do what they had just done. The engine's `pending` state
is exactly for this, and it was unreachable because the context carried one number where two facts
existed. The two counts are read as separate queries so an unreadable invited count leaves met/unmet
answerable from the active count. The ordering is load-bearing and pinned: the invited branch runs
only where nobody has joined, so an org that already has a team stays met when it invites a fourth
person.

## Two brand requirements no brand could satisfy

See [[Account Completeness Engine]] for the detail. In short: `address` was removed (the spec had
excluded it and slice 2 silently reversed that), and `stripe` was kept but its wizard slide removed,
because no brand Connect path exists at all and presenting a setup flow that silently does nothing is
worse than not offering it.

**`publish_campaign` demands `stripe` and lists `brand` among its roles. It has no call site today.
The day it gets one, every brand is blocked** — this is the thing to check before wiring that gate.

## Phone: two contract traps and a formatting one

`usePhoneVerification` is the first caller of `verify-phone` in `src/`. Two server behaviours are
pinned by tests because neither is guessable: a wrong code returns **HTTP 200** with
`{status:'unmet'}`, and `supabase.functions.invoke` puts non-2xx bodies in `error.context` (a
`Response`), not `data`.

And one of ours: `1 (201) 555-0134` is an ordinary way to write a US number, and blindly prefixing
`+1` produced `+112015550134` — a shape the E.164 check accepts and Twilio rejects, so the code never
arrived and nothing on screen explained why. The de-duplication is NANP-specific and gated on the
NANP default, because `1` is a legitimate first digit of a subscriber number elsewhere.

## Known Issues

- **VERIFIED ON PRODUCTION 2026-08-24** — this bullet read "Nothing here has been verified against
  production by a human" until the founder drove a real creator signup end to end while an agent
  watched the database. The gap slices 1 and 2 recorded is closed for the creator path: signup,
  email verification, phone verification and Stripe Connect account creation all exercised against
  prod. Still unexercised: the creator address slide, the ready slide, and the entire restaurant
  flow. See [[Onboarding Resume & Post-Login Routing]].
- **The brand `stripe` requirement remains unsatisfiable by design** — see above.
- **Stripe NO LONGER leaves the wizard (PR #521).** This bullet said the client "cannot influence
  them without an edge-function change" — which was true, and was the change that got made. The
  caller now sends a PATH (never a URL; the origin stays server-side) resolved against an exact
  allow-list in `_shared/connect-return.ts`, and the wizard rehydrates and resumes on return.
  **The return path could not ship alone**: the wizard remounts blank and the creator write is an
  upsert with no `ignoreDuplicates`, so Continue would have overwritten name, bio and skills with
  empty strings — worse than the bug it fixed. The core save still running before the service slides
  remains the safety net for anyone who abandons inside Stripe; it is simply no longer the plan.
  See [[Onboarding Resume & Post-Login Routing]].
- **Social login is not built.** It is blocked on a `handle_new_user` migration: that trigger is the
  only one on `auth.users` and never sets `email_verified`, which defaults false, while `AuthPage`
  gates on it — so an OAuth user would be told to verify an email that is never sent. `authenticated`
  holds INSERT but no UPDATE on that column, so there is no client-side fix. Auth logic, so it needs
  confirmation before anyone touches it.

## See Also

- [[Account Completeness Engine]] — slice 1; the registry this wizard reads.
- [[Identity & Address Verification]] — slice 2; the writers behind phone, identity and address.
- [[Honest Analytics]] — the same refusal to report a result the data does not support.
- [[Updated-At Trigger Drift]] — the "recorded ≠ actual" class the fingerprint fix belongs to.
- [[Onboarding Resume & Post-Login Routing]] — the production test of this work, and the three
  defects it surfaced on the way in, out and back in.
- [[CSP Applies To Every Redirect Hop]] — why the wizard's auto-detected city and country were
  empty for every user, despite a fix that reported success.
