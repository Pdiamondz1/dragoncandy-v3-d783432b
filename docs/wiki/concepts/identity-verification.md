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
based on `origin/main` at `1ef6a534` — 27 commits, **11 migrations**, 256 test files / 2721 tests.
Full session detail: `docs/wiki/raw/sessions/2026-08-23-identity-verification.md`, whose ADDENDUM
covers the eight commits of review fixes that landed after the first knowledge-sync pass.

**Seven Codex rounds produced nine findings**, plus two earlier Codex P1s and three blocking defects
from an internal re-review of the fix for those P1s. Clean at round 7. Most of the durable material
on this page comes from that loop rather than from the original build.

## The core rule this slice enforces

**A verification signal is a timestamp written only by a server that proved something — never a
boolean, never client-writable.** Every column this slice adds
(`identity_verified_at`/`address_verified_at`/`phone_verified_at`, `tax_id_provided`,
`stripe_requirements_due`, `stripe_disabled_reason`) follows that shape: nullable, no default, no
backfill, and NULL means "we have not heard from the authority yet" — which the [[Account
Completeness Engine]] already renders as `unknown`, not a failure.

## A stamp must never outlive the fact it attests to

This slice hit that exact failure mode **five times**, closed by four different mechanisms because
the shape of "what invalidates this fact" differed each time. (This section said *four* until the
Codex second review found the fifth — see the note after the list, which is the part worth
remembering.)

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
5. **Identity, on AUTOMATIC Stripe detach.** `check-restaurant-payout-status` clears a stale Stripe
   reference when Stripe answers 404 / `account_invalid` — and cleared only `stripe_account_id` and
   `stripe_onboarding_complete`. All four Stripe-derived identity signals survived, so a business
   whose Stripe account had been **deleted** kept rendering as identity-verified. Found by the Codex
   second review, at round 5, *after* #3 had been fixed.

**That a fifth instance existed at all is the evidence, not a footnote.** Instances 1–4 were each
closed in isolation, and #5 exists precisely because #3 (the *manual* disconnect) was fixed without
anyone asking whether there was an automatic detach path too. **Fixing instances one at a time does
not close a class.** So the reset stopped being a column list written out at each site and became
`supabase/functions/_shared/stripe-identity-reset.ts` — one `STRIPE_IDENTITY_RESET` constant that
both detach paths spread into the same `.update()` that nulls `stripe_account_id`, so detach and
reset cannot half-apply and the next detach path inherits it rather than becoming a third copy that
drifts.

**The pattern repeating five times in one slice is itself the lesson**, not a coincidence to shrug
off: whenever a slice adds a "this was proven true" column, it also creates the obligation to find
and close every event that makes the proof stop being true — as a set, enumerated once, not
discovered one review round at a time. Adding the producer without a complete set of erasers is
exactly how #1, #3 and #5 above happened.

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

The RPC is where the decision lives now: `SECURITY DEFINER`, `search_path = public`, service-role
only, counting and inserting under two `pg_advisory_xact_lock`s taken in a **fixed order** (user key,
then ip key — a fixed order turns two callers sharing an IP into a queue rather than a deadlock
cycle). It mirrors `record_crew_activity`'s fix for the identical race shape (`20260710120010`). The
slot is reserved **before** Twilio is called, and if Twilio then fails the caller flips that same row
to `'rejected'` rather than deleting it, so a failed send still consumes quota — hence the count
predicate `outcome IN ('sent','rejected')`, never `'sent'` alone. `rateLimit.ts` now holds only the
three constants (passed to the RPC as parameters) and `isAllowedCountry`; its header says in as many
words not to re-add a TypeScript throttle helper, because a second decision site is a second answer.
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

## A brief that names one call site is a hypothesis, not an inventory — and the same enumeration failed three times

`OnboardingWizard.tsx` upserts `creator_profiles` **directly**, bypassing
`useCreatorProfileSubmit.ts` — the hook the plan's brief named as *the* creator save path. This gap
was found and closed twice in the same task: once for wiring `verify-address` into both paths (Task 7
round 1), and again for the change-detection guard that must fire only when the address actually
changed (Task 7 round 2) — the SAME call site catching the team out on the SAME defect class twice.

The `profiles` lockdown then failed the same way **three more times**, all by one enumeration:

1. `dismissed_coachmarks` (`Coachmark.tsx`) — missed by the write-lockdown grep, which assumed
   single-quoted `from('profiles')`. Fixed mid-slice by `20260824101000`.
2. `onboarding_completed_at` (`useTour.ts`) — missed by the *same* grep for the *same* reason, both
   call sites being double-quoted. Found by Codex round 1, fixed by `20260824170000`. Completing the
   product tour was 42501-ing on prod: the tour reported success, recorded nothing, and re-armed the
   next session.
3. `useProfileNames` — missed by the read lockdown's inventory, because it reads columns that do not
   exist at all (see the next section).

**All three failed SILENTLY, and for one shared reason: none of those call sites checks the error
Supabase returns.** A missing grant produces a 42501 that the app then discards, so the defect is
invisible in every signal the product emits — which is why a human grep is not a control here even
when it is careful. The durable half of the fix is `src/lib/profilesWriteGrants.test.ts`: it
re-derives the write surface from `src/` **quote-agnostically** on every CI run and asserts each
written column appears in the granted set **parsed out of the migrations** — never a copy of the
list, because a copy is a third enumeration to keep in sync, which is the original problem. Round 4
extended it to SELECT. A completeness claim built on one search or one named site is a claim about
the search, not about the code; the only durable version of such a claim re-derives itself.

## A finding can be right in its conclusion and wrong in its mechanism

Codex round 4 flagged the SELECT lockdown as breaking `useProfileNames`, which selects
`first_name, last_name, username`. The hook **is** broken and silently so — and the lockdown neither
caused it nor worsened it. Those three columns **do not exist on `profiles` and never have**:
verified three independent ways before acting (no migration creates them; absent from the regenerated
types; absent from the read lockdown's own column inventory). PostgREST rejected the whole query with
42703 every time it ran, the hook discarded `error` and fell back to `data ?? []`, and every caller
silently got an empty map and rendered truncated user ids.

The distinction was not academic. **Codex's proposed remedy — grant SELECT on those three columns —
would have failed the migration outright.** Fixed to `full_name` instead, with the error thrown
rather than swallowed, so a query that *cannot* answer stops being indistinguishable from one that
answered "nobody has a name". **Verify the mechanism, because the remedy follows from the mechanism,
not from the conclusion.**

Extending the grants test to SELECT immediately found a second one: `AuthContext`'s connection probe
ran `select('count', { count: 'exact', head: true })`, where `count` is a PostgREST idiom and not a
column — a probe that runs on every profile fetch and **throws** on failure, sitting directly in
front of auth for every user. Now counts `id`, a real granted column.

## Ask which gate, not whether it is green

Two failures of this shape, one slice:

- `check-restaurant-payout-status` is on `.typecheck-ignore`, so the "68 functions clean" result said
  **nothing at all** about the round-5 change to that file. Checked directly with `deno check`: 4
  errors, pre-existing at lines 199–200 and untouched — which is why the file is ignored. **A green
  gate that does not cover the file you changed is not evidence about your change.**
- "typecheck clean" was reported truthfully and was true — of `tsc -p tsconfig.app.json`, which
  covers `src/` only and never looks at edge functions. `npm run typecheck:functions` (CI,
  `ci.yml:51`) was simultaneously **red with 11 errors, all in `verify-phone`** — a function this
  branch introduces, so relative to `main` this branch is what turns CI red. "Pre-existing on the
  branch that introduced the file" is not pre-existing. Fixed properly rather than by adding a new
  security-sensitive function to `.typecheck-ignore` (all 11 had one cause:
  `ReturnType<typeof createClient>` resolves a generic function's type parameters to their
  *constraints* — `unknown`/`never` — not their defaults; the bare imported `SupabaseClient` type is
  the pattern `outstand-proxy` and others already pass under). **Two different gates share one word.**

## A destructive write needs an ANSWER, not merely a non-error

Three findings in this slice are the same shape: something that is not an answer was being treated as
one, and the code then wrote on it.

- **Google Geocoding signals almost every failure as HTTP 200 with a JSON `status`**, so the `resp.ok`
  check caught essentially nothing. `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `INVALID_REQUEST` and
  `UNKNOWN_ERROR` all fell through as "no result" — and no result writes
  `address_verified_at`/`lat`/`lng` = null. A quota blip would have revoked still-true verifications
  for every caller who saved during it; a misconfigured key would have revoked verification
  platform-wide until someone noticed. Only `OK` and `ZERO_RESULTS` are answers *about the address*;
  every other status is a fact about **us**. `ZERO_RESULTS` deliberately stays on the write path —
  "does not resolve" is a real answer and clearing the stamp is the correct response to it. Extracted
  as `isGeocodeAnswer`; a missing or unrecognised status is refused, never assumed OK.
- **A comment of ours was itself the defect.** When the `org_units` address pre-read fails we do not
  know whether the address changed, and the code argued that re-verifying anyway "errs toward the
  conservative direction, since a redundant geocode only costs a request". Backwards: the verify path
  is **destructive**, so speculative re-verification is the damaging direction. Now tracked as
  `previousAddressKnown` and skipped when unknown. **Slice 1's "`unknown` never blocks" governs
  DISPLAY; it does not license a WRITE.**
- **A Supabase query resolves with `{ error }` rather than rejecting**, so `stripe-webhook`'s
  `await Promise.all([...])` succeeded even when every mirror write inside it had failed — and Stripe
  was told the signal was mirrored when it was not. Stripe emits `account.updated` only **on change**,
  so there may be no later event to repair it. Both batches now go through `assertNoWriteErrors`,
  which throws so Stripe's own retry becomes the repair path — deliberately the opposite policy from
  the pending-balance flush directly below it, which stays non-fatal because it has the
  onboarding-return poll as a backstop and this mirror has none.

Related, and the same instinct one level up: `stripe_requirements_due` mirrors *every* outstanding
Stripe requirement, so payment-setup items (`external_account`, `tos_acceptance`) were rendering as
"Verify your identity" — mislabelling the task, duplicating `deriveStripe`, and blocking actions on a
`required` tier for a banking issue. Filtered through `identityRequirements`, a **denylist** of
non-identity prefixes rather than an allowlist of known identity keys, because the two fail in
opposite directions on a Stripe key nobody has seen before: an allowlist ignores it and renders
"identity verified" while identity work is outstanding — a false positive on a fraud signal — where a
denylist over-reports unmet, which is annoying, visible and safe. **This slice exists for fraud
prevention, so an unknown key must never resolve toward "verified".**

## "Unmet for effectively every account" is a finding, not a reassurance

It appeared twice in this one slice, and was misread as reassurance the first time.

1. **Ruling 9.** The `required` identity tier was reasoned inert because `READINESS_GATE_ENABLED` has
   no `feature_flags` row — true of `ReadinessGate`, false of `AccountChecklistRows` /
   `MissionChecklist`, which consume the engine directly with no flag at all.
2. **Codex round 6.** `address` is `required` and derives from `address_verified_at`, a column added
   with **no backfill**, so every pre-existing location starts NULL. The round-1 change-guard —
   correct in itself — then removed the only way out, by making a re-save of an unchanged address a
   no-op. `useUpdateOrgUnit` now also fires verification when a location has **never** been verified,
   even with the address unchanged: safe for exactly the reason the guard exists, since a row with no
   stamp has nothing to lose. Verified rows keep the protection; unverified rows get the path back.

Shipped with #2: all three address requirements relabelled **"Add your address" → "Confirm your
address"**. They derive from a *stamp*, not from whether an address exists, so a business that filled
its address in months ago still reads unmet — and telling it to "add" one is false on its face and
sends the user hunting for a field they already completed.

## Re-run the reviewer after every fix round — a fix is not inert

Two of the nine Codex findings were defects **our own previous fix in the same loop had introduced**:
the "conservative direction" comment above (round 2), and the change-guard that removed the only way
to satisfy a required item (round 6). A third, larger instance sits just before the loop: the first
`verify-address` forgery fix introduced the two silent permanent failures described below. A fix
changes the system, so it deserves the same independent look the original code got.

Related and recorded: the Codex round-2 P1 (the `verify-phone` throttle race) **overturned a call
that had been explicitly made and written down** — an internal reviewer raised the read-then-insert
race and it was parked as non-blocking, on the grounds that the bypass is "bounded by concurrency".
That is not a bound: the attacker chooses the concurrency, and each request is a billed SMS. **The
error was grading the finding on how hard it is to exploit rather than on what it costs when
exploited** — for a financial control those are different questions, and only the second one decides
whether it blocks a merge. Two independent reviewers reached the same finding; the first was
overridden, and the second ran only because CLAUDE.md makes the Codex pass mandatory rather than
discretionary.

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

## A probe that cannot distinguish "absent" from "unmatched" is not evidence

Verifying the deploy prerequisites produced a cleaner version of the standing rule *when a probe
returns zero, prove it could have returned non-zero* — because this time a control caught the probe
lying in the other direction.

Checking whether `reserve_phone_verification_send` existed on prod, a `POST /rpc/…` with an empty
body returned **PGRST202, "no matches were found in the schema cache"** — the identical response an
invented function name gives. Read naively that says the migration never applied. It does not. The
function takes **five required parameters**, and PostgREST resolves overloads by argument names, so a
zero-argument call can never match it whether or not it exists. The result was an artefact of the
question asked.

Re-probed with the real five-argument signature it returned **42501, permission denied** — it exists
and is correctly revoked from `anon` — while the same five-argument shape against an invented name
still returned PGRST202. Only the second pairing is evidence, because only there does the control
differ from the subject in exactly one respect: existence.

The generalisation worth keeping: **a negative result is only informative if the probe could have
produced a positive one for the thing you are asking about.** "Returns the not-found error" is not
the same claim as "is not there", and the gap between them is where a false all-clear lives. The
sibling instances are [[Domain Migration .io → .com]]'s SMTP `RCPT TO` probe (250 for real and
nonsense addresses alike — *change instrument*) and this page's own [[Ask which gate, not whether it
is green]].

## The doc was the reviewer's source, and the doc was stale

The mandatory pre-deploy `edge-function-reviewer` pass filed a **high-severity** finding: that
migration `20260824110000` had not been applied, so `stripe-webhook` would hard-throw on its first
Connect webhook and Stripe would retry-storm the endpoint. The reasoning was sound and the premise
was false. The reviewer had no database access, so it did what a careful reader does — it read
`PROJECT_CONTEXT.md`, found a `**Pending:**` clause saying the migration had not run, and reported
it. That clause was hours stale.

Two things follow. First, the finding was still worth its cost: it forced a verification pass that
produced controls, and one of those controls caught the false negative described above. **A refuted
finding that makes you prove something is not a wasted finding.** Second, `PROJECT_CONTEXT.md`'s
own header warns that a `**Pending:**` clause is a claim with an expiry date — and a *reviewing
agent* is exactly the reader least able to know the date has passed. Stale prose in a context file
does not merely fail to help; it actively manufactures confident, well-argued, wrong findings.

## A remedy nobody has opened the console to confirm is a hypothesis

`verify-address` shipped with no throttle. That was recorded as acceptable because a compensating
control existed: *set a daily quota cap on Geocoding in the Google Cloud console.* The sentence was
written into this page and into `PROJECT_CONTEXT.md`, twice, each time as "the only bound on that
spend."

**The control does not exist.** Opening the console to set it, 2026-08-23: the Geocoding API's *v3
requests per day* quota reads **Unlimited**, its edit control is disabled with the tooltip **"Quota
is not adjustable"**, and a usage *alert* cannot be attached either — **"Alerts can not be generated
for unlimited quotas from the table."** Google removed per-day caps for Maps Platform. Only a
per-minute limit (3,000) remains, and a per-minute limit bounds burst rate, not daily spend; at
3,000/min a runaway loop is bounded at a number with no practical meaning.

What was actually bounding spend was **the $300 / 90-day free trial** on the billing project
(`forward-deck-506417-g9`), which Google does not auto-charge past. That is a real hard stop, and it
is also not a control anyone chose, does not survive clicking **Activate**, and would have been
credited to a console setting that was never there.

Two things generalise past Geocoding:

1. **A compensating control is not a control until someone has performed it.** "We'll cap it in the
   console" is a plan; the console is the only place that can confirm it is possible. Writing the
   plan down twice, in two files, produced two citations of the same unverified claim and made it
   read as established.
2. **The remedy and the defect must be checked in the same pass.** The defect (no throttle) was
   found by review and correctly described. The remedy was assumed in the same breath and never
   opened. Reviewing the code but not the mitigation leaves the finding *closed on paper* — which is
   worse than leaving it open, because an open finding still attracts attention.

Closed by mirroring what `verify-phone` already had: `reserve_address_verification`
(migration `20260825100000`), an atomic count-and-reserve under advisory locks, called immediately
before the billed request. Three dimensions rather than phone's two-plus-cooldown — per-user daily,
per-user burst, per-IP daily — because the abuse shape differs: a geocode is ~1/1000th the unit cost
of an SMS, so volume matters more than spacing, and a cooldown would mostly punish the one
legitimate pattern phone does not have (a business saving several locations in a sitting, each save
firing its own verification).

One deliberate divergence worth carrying: the counting predicate is an **exclusion**
(`outcome <> 'throttled'`) where phone uses an inclusion list. The two fail in opposite directions
when a future outcome is added and this file is forgotten — an inclusion list silently stops
counting it (under-throttles, costs money), an exclusion list counts it (over-throttles, annoys one
user). Fail closed toward the attacker.

The frontend needed **no change**, which is worth stating rather than leaving implicit:
`verifyAddress.ts` is deliberately fire-and-forget and its header already names "rate limit" among
the failures it must swallow. A 429 must never surface as "your save failed", because the save
succeeded. The user's checklist simply continues to show the address unconfirmed — which is true —
and the next save re-fires verification.

## Known Issues / Pending

- **The functions are live; the providers are still unexercised.** All five deployed and
  boot-verified 2026-08-23, and the three secrets are provisioned and two proven by digest against
  the live Twilio account. But **no real SMS has been sent and no real address geocoded** — the
  Twilio path is proven against a stubbed provider and nothing else. Twilio's **Primary Compliance
  Profile** is a separate gate from funding the account and is not complete. Treat every claim about
  end-to-end behaviour as reviewed, not exercised.
- **`verify-address`'s throttle is CLOSED** (`feat/verify-address-throttle`) — see the section below
  for why the remedy this bullet used to name was fiction. Built, reviewed, **not yet deployed**:
  migration `20260825100000` is unapplied and the function is undeployed, so the cap is not yet in
  force on prod.
- **`send-promotion-notification` reads the three Twilio secrets that were overwritten** with the new
  account's credentials, and has not been re-checked since. It is the one other consumer of
  `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER`.
- **Two functions answer 500 where 401 is correct** — `disconnect-stripe-account` and
  `check-restaurant-payout-status` throw missing/invalid-auth into a generic catch-all. Confirmed
  live during boot verification. Pre-existing, not a leak, and deliberately not folded into a deploy;
  it needs its own change.
- **`READINESS_GATE_ENABLED` is now coupled to a secret, not just to a founder decision.** The
  `address` requirement is `required` and derives from a stamp, and until
  `GOOGLE_MAPS_SERVER_API_KEY` exists **no address can be verified at all** — so the requirement is
  display-only, which is safe, and would stop being safe the instant the gate is armed. Nothing may
  arm that flag until the key is provisioned **and** existing locations have actually been verified.
  (Existing accounts do now have a path — `useUpdateOrgUnit` re-fires verification for a location
  that has never been verified even when the address is unchanged — but the path leads to a 503
  until the key lands.)
- **Two migrations were added after the first knowledge-sync pass**: `20260824160000`
  (`reserve_phone_verification_send`, recorded explicitly as NOT applied) and `20260824170000` (the
  `onboarding_completed_at` grant-back, with no record either way — verify before assuming). Total on
  the branch is 11.
- **The merge-time deploy list has five functions, not four.** `check-restaurant-payout-status`
  now imports `_shared/stripe-identity-reset.ts`, so it deploys alongside `verify-phone`,
  `verify-address`, `stripe-webhook` and `disconnect-stripe-account`.
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
