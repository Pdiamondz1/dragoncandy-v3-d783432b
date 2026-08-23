---
title: Identity & Address Verification
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: [2026-08-23-identity-verification.md]
tags: [onboarding, readiness, stripe, verification, rls, security, twilio, geocoding]
---
# Identity & Address Verification

Slice 2 of 4 in the signup/onboarding redesign (slice 1: [[Account Completeness Engine]]). Gives the
readiness engine's `phone_verified`, `identity_verified` and `address` requirement keys real writers,
and closes several PII-exposure holes discovered while doing it. Branch `feat/identity-verification`,
based on `origin/main` at `1ef6a534`. Full session detail: `docs/wiki/raw/sessions/2026-08-23-identity-verification.md`.

## The core rule this slice enforces

**A verification signal is a timestamp written only by a server that proved something — never a
boolean, never client-writable.** Every column this slice adds
(`identity_verified_at`/`address_verified_at`/`phone_verified_at`, `tax_id_provided`,
`stripe_requirements_due`, `stripe_disabled_reason`) follows that shape: nullable, no default, no
backfill, and NULL means "we have not heard from the authority yet" — which the [[Account
Completeness Engine]] already renders as `unknown`, not a failure.

## A stamp must never outlive the fact it attests to

This slice hit that exact failure mode **four times**, closed by three different mechanisms because
the shape of "what invalidates this fact" differed each time:

1. **Phone.** A DB trigger (`20260824120000`) clears `phone_verified_at` when `phone` changes —
   *except* when both are written in the same statement, which is how the real verify-phone write
   works. The naive version (clear on every `phone` change, full stop) would have silently broken
   verification itself: a `BEFORE UPDATE` trigger runs once over the composed NEW row, so a single
   `update ... set phone = $1, phone_verified_at = now()` would see `phone` changed and null the very
   stamp it was just handed — the user told "you're verified" while the column disagrees. The fix is
   a dual condition: `NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone_verified_at IS NOT DISTINCT
   FROM OLD.phone_verified_at`. When both columns move together the second half is false and nothing
   clears; when only `phone` moves (any other writer) the clear fires as intended.
2. **Address.** The identical dual-condition trigger shape (`20260824150000`) on
   `creator_profiles`/`org_units`. Trigger execution order matters here in a way the migration
   originally denied in its own comment: Postgres fires triggers on the SAME table in **name-sort
   order**, so `guard_...` (Task 3's server-write-only guard) sorting before `trg_clear_...` (this
   trigger) is load-bearing — the guard sees the client's original row before this trigger has
   touched it. Reversed, a legitimate client address edit would hard-fail with "server-write-only"
   every time. A migration asserting "ordering doesn't matter" when it structurally does is how the
   next person "simplifies" a working system into a break.
3. **Identity, on Stripe disconnect.** `disconnect-stripe-account` cleared `stripe_account_id`,
   `stripe_onboarding_complete` and `disconnected_stripe_account_id` — and missed
   `identity_verified_at`/`tax_id_provided`/`stripe_requirements_due`/`stripe_disabled_reason`
   entirely, because those columns didn't exist when that function was last touched. Since
   disconnect-then-reconnect is a real supported flow and the reconnected Stripe account can be a
   **different legal entity**, the stale stamp would vouch for an entity Stripe never verified. No
   trigger fits — the invalidating event is an application action (a disconnect), not a single
   column's change — so this one is a plain addition to the existing `.update()` call, clearing all
   four columns together.
4. **Identity, on revocation.** `deriveIdentityVerified` checked the historical `verifiedAt` stamp
   BEFORE checking `disabledReason`/`requirementsDue`, so an account Stripe disabled for
   `rejected.fraud` still rendered "identity verified" in the checklist. Fixed by re-ordering the
   derivation so revocation outranks the stamp — the one-line fix that matters most, since fraud
   prevention is the stated reason this slice exists.

**The pattern repeating four times in one slice is itself the lesson**, not a coincidence to shrug
off: whenever a slice adds a "this was proven true" column, it also creates the obligation to find
and close every event that makes the proof stop being true. Adding the producer without the eraser is
exactly how #1 and #3 above happened.

## Fail open toward the user, fail closed toward the attacker

[[Account Completeness Engine]] established "`unknown` never blocks" for **readiness display** — a
degraded read should never lock a real user out of an action they've earned. This slice needed the
opposite default in the same codebase for a different surface, and getting the two confused is a real
risk, not a hypothetical one.

`verify-phone`'s throttle initially inherited the display instinct: any read error against
`phone_verification_attempts` logged and returned `[]`/`undefined`, which the then-live
`exceedsSendLimit([])` resolved as "allow". A transient blip, a future RLS change, or a connection
cap would silently disable the *only* defense against SMS pumping while still returning 200s. Fixed
to refuse the send on any read error instead. **That whole read-then-decide shape is now gone** —
the Codex P1 pass replaced it with the atomic `reserve_phone_verification_send` RPC (migration
`20260824160000`), and `exceedsSendLimit` / `withinCooldown` were **deleted**, not left orphaned.
The fail-closed rule survived the move intact: a failed or null RPC result refuses the send with a
503. The IP-salt fallback got the identical treatment for the identical reason:
the "fallback" salt was a literal string committed to the repo, so hashing IPs against it was one
cheap offline precomputation from full recovery — refuse `start` entirely until the real secret
exists, rather than silently run the throttle in a state where it protects nothing.

**The rule: fail open toward the USER (readiness display, where a false block costs a real person a
real action), fail closed toward the ATTACKER (a throttle protecting a bill we pay).** Same word
("unknown"/error path), opposite correct default, decided by who bears the cost of being wrong.

## Column-level REVOKE is a documented no-op against a table-wide GRANT — 4th recorded instance

`20260824140000`'s header names this explicitly as precedent, not a one-off: two historical
`REVOKE SELECT (email) ...` statements on `profiles` (`20260507130028`, `20260523234847`) both ran
successfully on prod and changed nothing, because in Postgres a table-level GRANT subsumes column
privileges — a column-level REVOKE against an outstanding table-wide GRANT carves out nothing. Same
mistake, same shape, as `20260804174854`, `20260805163247`, and `outstand_post_ownership`'s lockdown
(see [[Service-Role Data Exposure]]). The working pattern, used correctly here and in every migration
this slice ships: `revoke <priv> on <table> from anon, authenticated` at the TABLE level first, THEN
`grant <priv> (<enumerated column list>) to <role>` — and end with an `information_schema` assertion
block proven capable of failing (the reviewer rebuilt `20260824140000` with `dismissed_coachmarks`
deliberately stripped from the grant-back list and confirmed the assertion raised, rather than
trusting that it would).

## Two lockdowns on `profiles`, not one — write and read are separate problems

1. **Write lockdown** (`20260824100000`/`101000`) — `authenticated` held UPDATE/INSERT on
   `phone_verified_at`, so any signed-in user could self-stamp "verified" without an SMS ever going
   out. Closed with the grant-back pattern above, since every client write to `profiles` passes a
   literal object (grep-enumerable — unlike the other three verification tables; see below).
2. **Read lockdown** (`20260824140000`) — found mid-slice, not planned. RLS has no column
   granularity: the "View messaging participants profiles" policy grants the WHOLE ROW to any
   messaging counterparty, and with `authenticated` holding table-wide SELECT that included `email`
   and — the moment `verify-phone` shipped — `phone`. Proven on prod (impersonation + a control uuid
   returning 0 rows). The `phone` half was caught **before** it ever went live: `verify-phone` is the
   FIRST writer of that column, so the exposure was closed in the same PR that would have created it.
   The `email` half was already live and pre-existing — a real address came back in the probe.

**Grants are the right tool exactly where the write surface is enumerable, and the wrong tool where
it isn't.** `profiles` uses grant-based lockdown because every write is a literal object. The other
three tables (`creator_profiles`, `business_profiles`, `org_units`) use a `BEFORE INSERT OR UPDATE`
trigger instead, because at least one write path per table is a runtime-computed object
(`useOrgData.ts`'s `useUpdateOrgUnit({ id, ...updates })`, where `updates` is a caller-supplied
partial). An explicit grant list against a write surface that cannot be enumerated by grep is a
silent-`42501`-in-production trap for the next call site nobody listed — which is exactly how the
`dismissed_coachmarks` regression happened on the `profiles` table itself (a grep that used
single-quoted `from('profiles')` missed two double-quoted call sites, breaking a live UI mutation for
one fix round before it was caught).

Read `20260824140000`'s "What this does not close" block before citing it as the fix for
`profiles` PII: it closes the table-wide path only. Two `SECURITY DEFINER` functions still reach
`profiles.email` by design or as a live pre-existing hole — see below.

## A live, pre-existing, unauthenticated IDOR found and left out of scope

`public.get_user_conversations(user_uuid uuid, p_org_unit_id uuid)` — `prosecdef = true`, body never
references `auth.uid()`, every filter runs on the caller-supplied `user_uuid`, EXECUTE held by
PUBLIC/anon/authenticated with no REVOKE. Verified with controls, not assumed: impersonating a user
whose own list is 1 row and passing a different user's id returned **13 rows**; a nonexistent uuid
returned 0 (rules out "ignores the parameter"); `set local role anon` with **no JWT at all** still
returned 13 rows — the anon key ships in the frontend bundle, so this needs no account. Returns
conversation ids, campaign ids, unread counts, and `other_participant_name`
(`COALESCE(creator_name, business_name, p.full_name, p.email, ...)`) — currently latent for the email
fallback only because all 45 prod profiles have a non-null `full_name`; one NULL away from also
leaking raw addresses.

**Deliberately not fixed in this slice** — found while enumerating `profiles.email` readers for the
read lockdown above, it is out of scope, and the migration that closes the table-wide path was
corrected mid-review specifically so its header does not overstate what it closed (see the section
above). Needs an owner.

## Spec compliance is not correctness

Three defects this slice originated in the **plan or spec text itself** and were reproduced
faithfully by implementers, passing per-task spec-compliance review each time:

- The spec's reference code checked `company.verification.status`, a field that **does not exist**
  in the Stripe API (only `individual.verification.status` exists, null unless
  `business_type === 'individual'`). Every restaurant onboarding as an LLC or corporation — the
  normal case — would have permanently failed identity verification no matter how completely Stripe
  verified them. Closed by deriving company identity from `payouts_enabled === true &&
  !disabled_reason` instead: Stripe does not enable payouts for an entity it hasn't verified, which
  is what the column is defined to record even though Stripe doesn't label it that way for companies.
- The plan's Task 6 instruction said to merge the identity signal into the same bulk `.update()` as
  the other Stripe mirrors — which would spread `identity_verified_at: null` into every
  `account.updated` event for a non-verified account, erasing any stamp a PRIOR event had legitimately
  earned. Caught before merge by reading the plan's own two contradictory sentences four lines apart.
- An early plan draft's "grandfather arm" for `address` (Ruling 2: treat existing lat/lng as evidence
  even without a stamp, to avoid regressing complete businesses) turned out to be defending an empty
  set — 0 of 30 `org_units` had coordinates — and was correctly dropped (Ruling 9-of-the-address-track,
  distinct from the later Ruling 9 that was wrong). Recorded as a near-miss: the instinct to protect
  existing users was right, the specific mechanism would have shipped dead code.

**A per-task spec-compliance check answers "does this match the plan", not "is the plan correct".**
All three needed a reviewer (or the controller) to check the plan/spec against the actual API or the
actual runtime semantics, not just check the diff against the plan.

## A brief that names one call site is a hypothesis, not an inventory

`OnboardingWizard.tsx` upserts `creator_profiles` **directly**, bypassing
`useCreatorProfileSubmit.ts` — the hook the plan's brief named as *the* creator save path. This gap
was found and closed twice in the same task: once for wiring `verify-address` into both paths (Task 7
round 1), and again for the change-detection guard that must fire only when the address actually
changed (Task 7 round 2) — the SAME call site catching the team out on the SAME defect class twice.
The precedent this echoes: the `dismissed_coachmarks` write-lockdown regression happened because a
grep for `from('profiles')` with single quotes missed two double-quoted call sites — different
mechanism, same root cause (a completeness claim built on one search or one named site is a claim
about the search, not about the code).

## Compare the row against ITSELF, never against the caller's copy of it

`verify-address`'s first fix for the stamp-an-address-nobody-checked forgery conditioned the final
UPDATE on the fields the CALLER submitted (`.eq('city', submittedCity)` …). That closed the attack
and opened two silent, permanent failures, because the caller's copy and the stored row are written
by different code paths that normalize differently:

- `OnboardingWizard.tsx` upserts `{city, country, timezone}` with **no `postal_code`**, so a postal
  code saved earlier through the full profile editor survives the upsert — then the client asked to
  verify with `postalCode: null`, the predicate took its `.is('postal_code', null)` branch, and the
  stored `'07030'` did not match. Zero rows, no stamp, `200 {verified:false}` — and since
  `addressChanged` will not re-fire, that account was **permanently unverifiable with no
  user-visible signal**. (Note this is the wizard being a second writer *again* — the third time on
  this branch. See the section above.)
- `useCreatorProfileSubmit.ts` and `useOrgData.ts` store city/country/address **untrimmed** while
  the client helper sent them **trimmed**, so a pasted `'Hoboken '` never matched `'Hoboken'`.

The fix was not to patch the predicate field by field. `verify-address` now **reads the stored
address row server-side, geocodes exactly what it read, and conditions the write on those exact
stored values** — a genuine compare-and-set of the row against itself. The request body carries no
address fields at all any more (only `role`, and `orgUnitId` for a business), so the caller cannot
influence what gets geocoded — which closes the original forgery *structurally*, upstream of any
predicate, rather than by comparison. The planning half is pure and unit-tested
(`supabase/functions/verify-address/storedAddress.ts`): predicate values are verbatim, geocode query
text is trimmed, and a missing row is distinguished from a blank address.

**The generalizable rule: a compare-and-set is only sound when both sides of the comparison come
from the same read.** Two normalizations of "the same" value are two values.

## `now()` is the transaction timestamp

A prod proof of the address-invalidation trigger failed on its first attempt, and the failure was the
test, not the trigger: both the setup row and the composite-write test used `now()` inside the same
transaction, so both writes produced the **identical** value, `NEW.address_verified_at IS NOT
DISTINCT FROM OLD.address_verified_at` was trivially true, and the guard fired and nulled the stamp
it was supposed to leave alone. Re-run with two distinct literal timestamps, it passed — and in real
usage this can't happen, because the address write and the verify-address write are genuinely
separate transactions. Worth keeping because the wrong conclusion ("Ruling 4's dual condition doesn't
work") was one careless step away, and would have looked like a real defect in a change that was
actually correct.

## Process: never run a writing agent and a reviewing agent on the same paths, in the same worktree

A reviewer investigating an unrelated typecheck failure ran `git stash` on four
`src/lib/accountReadiness/*` files while a different agent was actively editing exactly those files
in the same worktree, then dropped the stash. The reviewer's own verification ("byte-identical
restoration before dropping") was true of the moment it stashed and false of the net effect, because
the tree kept changing underneath it while it worked. The implementer detected the loss on its own
(a passing test run with an empty `git diff`) and redid the work with per-edit verification.
CLAUDE.md's existing rule against bare `git stash` names cross-**worktree** collisions; this was a
collision between two agents in the SAME worktree, which the rule as written didn't cover. New rule:
never run a file-writing agent concurrently with any agent that might touch the same paths, and tell
every reviewer explicitly that the tree may be live and it must never stash, revert, or checkout
anything.

## Known Issues / Pending

- **Nothing is verifiable end-to-end.** `verify-phone` and `verify-address` both 503 by design —
  `TWILIO_VERIFY_SERVICE_SID`, `PHONE_VERIFY_IP_SALT`, and `GOOGLE_MAPS_SERVER_API_KEY` are all
  unprovisioned. No real SMS or geocode call has ever been made by this code.
- **`identity_verified` reads `unmet` (not `unknown`) for effectively every account** until Stripe's
  `account.updated` webhook fires per account. Inert only until `READINESS_GATE_ENABLED` gets a
  `feature_flags` row — a deliberate separate act the PR must flag to the founder, since turning that
  flag on before addressing this blocks existing users from gated actions all at once.
  `deriveIdentitySignals` was fixed (the final blocking finding) to correctly distinguish "Stripe has
  never reported" (`unknown`) from "Stripe reported nothing outstanding" (`met`), but the volume of
  accounts still awaiting a first `account.updated` event is unmeasured going into merge.
- **The verify-phone send throttle has NO automated coverage at all** — not just the cooldown. This
  entry used to name `withinCooldown` alone; that function no longer exists. The whole decision
  (daily cap, cooldown, and the reserving INSERT) now lives in the
  `reserve_phone_verification_send` RPC, which needs a database to exercise and therefore runs under
  no CI test. It is proven only by a hand-run, rolled-back prod script (4 concurrent calls → 3
  reserved, 4th declined, 3 rows actually inserted). `rateLimit.test.ts` still covers
  `isAllowedCountry`, which is the only pure decision left in that function. The three
  `exceedsSendLimit` tests were deleted with their subject rather than kept green against code
  nothing calls — a suite that passes while its subject moved is worse than a known gap.
- **`lat`/`lng` are client-writable directly** on `creator_profiles`/`org_units` — only
  `address_verified_at` is guarded. Bounded (the readiness engine keys off the stamp alone, so a
  forged coordinate proves nothing there, and the re-verification trigger nulls `lat`/`lng` alongside
  the stamp on the next legitimate address edit) but real: "Find Creators near me" ranks on proximity
  without consulting the stamp, so planted coordinates place a creator in a city search they aren't
  in. Marketplace-integrity risk, not a data-exposure one — parked, not fixed, no date attached (a
  reviewer's dissent on record: it deserves one).
- **The NANP exclusion set for `verify-phone` is a hand-maintained blocklist**, which is fail-open by
  construction against future NANPA allocation changes — narrower in blast radius than the original
  finding but the same shape one layer down. Twilio Verify's own **Geo Permissions**, configured on
  the Verify Service console, is the intended authoritative gate; the local list is deliberately kept
  as cheap defense-in-depth on top of it, not instead of it.
- **`get_user_conversations` unauthenticated IDOR** — see above, needs an owner, not part of this
  slice's scope.

## See Also

- [[Account Completeness Engine]] — slice 1; the four-state model and the "`unknown` never blocks"
  rule this slice's fail-closed exception deliberately departs from, and why.
- [[Service-Role Data Exposure]] — the broader pattern of RLS-bypassing reads/writes this slice's
  column-lockdown work sits alongside.
- [[Updated-At Trigger Drift]] / [[Content Delivery State Machine]] — other instances of "recorded ≠
  actual" this slice's stamp-invalidation triggers are the same family as.
