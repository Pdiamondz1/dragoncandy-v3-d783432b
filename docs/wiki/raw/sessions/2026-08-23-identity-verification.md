# Session: Identity & Verification (slice 2 of 4, onboarding redesign)

**Branch:** `feat/identity-verification`, based on `origin/main` at `1ef6a534`
**Spec:** `docs/superpowers/specs/2026-08-23-identity-verification-design.md`
**Plan ledger:** `.superpowers/sdd/2026-08-23-identity-verification/progress.md` (1258 lines, 20 rulings)
**Commits:** 19 on the slice (plus a merge of 3 unrelated `origin/main` commits mid-flight)
**Tests:** 2598 → 2658 across 247 → 252 files; typecheck/lint/build clean throughout

Slice 1 (the account completeness engine — `deriveReadiness`, the four-state model, the action
registry) merged earlier as #472/#473. This slice gives the engine's `phone_verified`,
`identity_verified` and `address` requirement keys **real writers** for the first time, and closes
several PII-exposure holes discovered along the way.

## What shipped

**New verification columns (migration `20260824110000`):**
- `creator_profiles`: `identity_verified_at`, `tax_id_provided`, `stripe_requirements_due`,
  `stripe_disabled_reason`, `address_verified_at`, `lat`, `lng`
- `business_profiles`: `identity_verified_at`, `tax_id_provided`, `stripe_requirements_due`,
  `stripe_disabled_reason`
- `org_units`: `identity_verified_at`, `tax_id_provided`, `stripe_requirements_due`,
  `stripe_disabled_reason`, `address_verified_at`

All nullable, no default, no backfill. `NULL` means "we have not heard from Stripe/never geocoded",
which the engine already renders as `unknown` rather than a failure.

**Server-write-only enforcement, two different mechanisms depending on the write surface:**
- `profiles.phone` / `phone_verified_at` — table-wide REVOKE + explicit column GRANT-back
  (`20260824100000`, `20260824101000`). Safe here because every client write to `profiles` passes a
  literal object (grep-enumerable).
- `creator_profiles` / `business_profiles` / `org_units` verification columns — a `BEFORE INSERT OR
  UPDATE` trigger per table (`20260824110000` UPDATE-only, widened to INSERT by `20260824111000`)
  that raises unless the caller is `service_role`. Grant-based lockdown was **rejected** for these
  three tables (Ruling 12) because at least one write path per table is a runtime-computed object
  (`useOrgData.ts`'s caller-supplied partial), so an explicit grant list is a silent-`42501` trap
  waiting for the next call site nobody enumerated.

**Stamp-invalidation triggers (a verification stamp must not outlive the fact it attests to):**
- `20260824120000` — clears `profiles.phone_verified_at` when `phone` changes, EXCEPT when both are
  written in the same statement (the real verify-phone shape). Uses the dual condition from Ruling 4:
  `NEW.phone IS DISTINCT FROM OLD.phone AND NEW.phone_verified_at IS NOT DISTINCT FROM
  OLD.phone_verified_at`.
- `20260824150000` — the same shape for `address_verified_at`/`lat`/`lng` on `creator_profiles` and
  `org_units`, clearing on any address-field change unless the verify-address write lands in the same
  statement. Trigger name sorts (`guard_...` before `trg_...`) so Task 3's write-only guard sees the
  client's original row and does not fire on a legitimate address edit — documented as a real
  ordering dependency, not asserted-safe boilerplate.
- `disconnect-stripe-account` (application-level, not a trigger — the invalidating event is an
  action, not a column change) now clears all four Stripe-derived columns on disconnect, not just the
  three it touched before. A stamp earned by a disconnected Stripe account must not vouch for
  whatever entity reconnects next.

**New table:** `phone_verification_attempts` (`20260824130000`) — per-user and per-IP SMS-send
throttle audit log. Service-role only, RLS with no client policy.

**New edge functions:**
- `verify-phone` — Twilio Verify (not Programmable Messaging; the two are different products and
  only Verify's secret, `TWILIO_VERIFY_SERVICE_SID`, was ever going to work). Two-client split (anon
  client validates the caller's JWT only; service-role does every table read/write). Fail-closed
  throttle on both per-user and per-IP dimensions, NANP exclusion set for Caribbean/territory premium
  overlays, SHA-256+salt IP hashing (refuses to run without the salt secret).
- `verify-address` — Google Geocoding, city/postal-centroid precision for creators (coordinates
  rounded to 2 decimal places, ~1.1km, so precision is structural rather than dependent on which
  Google match type comes back), org-membership-checked writes for `org_units` (no body-supplied id
  treated as a grant).

Both functions **503 by design** — their required secrets (`TWILIO_VERIFY_SERVICE_SID`,
`PHONE_VERIFY_IP_SALT`, `GOOGLE_MAPS_SERVER_API_KEY`) are unprovisioned, so nothing is verifiable
end-to-end yet. That is deliberate, not an oversight — see Ruling 5/10 below.

**`stripe-webhook` mirrors Stripe's identity/KYC signal** (`identitySignals.ts`) into the four columns
above, written in a SEPARATE `Promise.all` from the existing three current-state mirrors, gated
`.is('identity_verified_at', null)` per row, so a later `account.updated` event that proves nothing
cannot erase a stamp already earned (Ruling 7). For **company** accounts (the normal case for a
restaurant onboarding as an LLC), Stripe has no `company.verification.status` field at all — only
`individual.verification.status`, which is null unless `business_type === 'individual'`. Fixed
(Ruling 16) by deriving company identity from `payouts_enabled === true && !disabled_reason`: Stripe
does not enable payouts on an entity it hasn't verified, which is what this column is defined to
record even though it isn't labelled that for companies.

**`get_org_members_roster(p_org_id)` RPC** (`20260824135000`) — replaces a direct client SELECT of
`profiles.email` for the org-roster feature, gated on the caller being an ACTIVE member of the org.
Needed because the PII lockdown below makes `email` unreadable via the base table.

**Two `profiles` PII lockdowns, not one:**
1. `20260824100000`/`101000` — WRITE lockdown (revoke UPDATE/INSERT on `profiles`, grant back an
   explicit column list). Closes `phone_verified_at` self-stamping.
2. `20260824140000` — READ lockdown (revoke table-wide SELECT, grant back 15 columns excluding
   `email` and `phone`). Closes a live hole found mid-slice: the "View messaging participants
   profiles" RLS policy grants the WHOLE ROW (RLS has no column granularity) to any messaging
   counterparty, and with `authenticated` holding table-wide SELECT that included `email` and — the
   moment `verify-phone` shipped — `phone`. Proven on prod: impersonating a real counterparty
   returned a real email; an unrelated control uuid returned 0 rows.

## Readiness-engine wiring (`e2ec0492`)

`RequirementKey` gains `identity_verified`. `phone_verified` and `address` already existed from
slice 1 (as impossible-to-satisfy rows — see Finding A below) and are amended, not duplicated
(Ruling 1). Per spec §6, `phone_verified` moves `required` → `recommended` (Ruling 10).
`deriveIdentityVerified` checks `disabled_reason`/`requirements_due` BEFORE the historical stamp, so
Stripe revoking verification (e.g. `rejected.fraud`) outranks a stamp earned earlier — closed as part
of the final blocking-fix commit, `d85b5874`.

## Findings that predate this slice, surfaced while investigating it

- **Slice 1 shipped two `required` checklist rows nothing could ever satisfy** — `address` (0 of 30
  `org_units` had lat/lng) and `phone_verified` (wired, no writer). Not a lockout (the gate flag
  didn't exist), but exactly the "UI says one thing, truth says another" failure this whole project
  exists to delete — shipped in slice 1, missed by nine task reviews and a Codex pass.
- **A live, pre-existing, UNAUTHENTICATED IDOR**: `public.get_user_conversations(user_uuid,
  p_org_unit_id)`. `prosecdef = true`, body never references `auth.uid()`, every filter runs on the
  caller-supplied parameter, EXECUTE held by PUBLIC/anon/authenticated with no REVOKE. Verified with
  controls: a caller whose own list is 1 row read 13 rows belonging to two other users; a nonexistent
  uuid returned 0 (rules out "ignores the parameter"); `set local role anon` with NO JWT still
  returned 13 rows. One `NULL full_name` away from also leaking raw email addresses (currently
  latent — all 45 profiles have a `full_name` today). **Out of scope for this slice, not fixed, needs
  an owner.**
- **Two column-level `REVOKE SELECT (email)` statements on `profiles`** (`20260507130028`,
  `20260523234847`) have always been no-ops against the table's ambient table-wide GRANT — the
  fourth recorded instance of this exact mistake in this codebase.
- **Twilio SMS is live, reachable code that has never once fired** on prod (`send-promotion-notification`
  triggers on promotion approval; only 1 discount code has ever issued and it carried no phone
  number). Account funding is a founder-only open item, not attempted.
- Two pre-existing schema-drift reads that silently swallow errors: `useProfileNames.ts` (selects
  `first_name`/`last_name`/`username`, none of which exist) and `donny-oauth-userinfo` (`display_name`,
  doesn't exist). Not fixed here.
- `useTour.ts:28` writes `profiles.onboarding_completed_at`, a column that does not exist — dead
  since before this branch, 42703 on every call, not fixed here.
- `Coachmark.tsx`'s dismiss mutation swallows errors (no `onError`, no `.error` check) — real, not
  fixed here (separate concern from the grant fix that made it visible).

## The 20-ruling decision ledger — corrections and reversals, recorded honestly

Three of twenty rulings were later judged wrong or half-wrong by review, and are recorded as such
rather than quietly edited:

- **Ruling 9 (WRONG).** Reasoned that Task 8's `required` tiers were inert because
  `READINESS_GATE_ENABLED` had no `feature_flags` row, so `ReadinessGate` passes children through
  unconditionally. True of `ReadinessGate` — **false of the engine itself**.
  `AccountChecklistRows`/`MissionChecklist` consume `useAccountReadiness` **directly**, with no flag,
  and both render unconditionally on `/dashboard/business` and `/dashboard/creator`. The actual
  mechanism: `useAccountReadiness.ts` coerced `stripe_requirements_due ?? []` and
  `stripe_disabled_reason ?? null`, collapsing "Stripe has never reported" into "Stripe reported
  nothing outstanding" — so a NULL column (every account, day one) derived `unmet`, not `unknown`.
  Consequence if shipped as-was: all 36 prod accounts get a permanent, non-dismissible "Verify your
  identity" row the instant Vercel deploys, including 5 accounts that are fully Stripe-onboarded and
  can never clear it (Stripe only emits `account.updated` on change). This was the exact defect the
  slice was scoped to fix, re-shipped by the slice itself — caught only by the final whole-branch
  review, fixed in `d85b5874` by extracting the mapping into a tested `toIdentityContext` seam that
  had previously had zero test coverage.
- **Ruling 15 (HALF WRONG).** Ruled the entire `20260824140000` migration must apply only after the
  Vercel deploy (READ lockdown removes access live code depends on). Correct for the SELECT revoke
  half. Wrong to bundle the whole file: `get_org_members_roster` is backward-**compatible** and the
  new frontend needs it to exist the moment it deploys — as one file there was no apply order without
  a broken window. Split into `20260824135000` (RPC, applied before merge) and `20260824140000`
  (revoke, applied after).
- **Ruling 5 (recorded, never executed).** Ruled that `withinCooldown` needed a test. The ruling was
  right; nobody actually wrote the test. A count-based check ("7 tests claimed, 7 present") reconciled
  by coincidence once the NANP fix round added 2 more tests (9 total) — the guard function is still
  untested. Carried to the founder as a real gap, not silently dropped.

Two rulings drew mild dissent from the reviewer that the controller accepted as fair without acting on:
Ruling 18 (the `lat`/`lng` marketplace-integrity risk deserves a date, not just a park) and Ruling 3
(taking the new-edge-function branch for `verify-address` doubled the unprovisioned-secret surface).

## The pattern that repeated four times: a stamp outliving its fact

1. **Phone** — closed by a DB trigger (`20260824120000`) clearing the stamp on any `phone` change not
   paired with a new stamp in the same statement.
2. **Address** — closed by a DB trigger (`20260824150000`), same dual-condition shape.
3. **Identity, on Stripe disconnect** — `disconnect-stripe-account` cleared 3 of 4 Stripe-derived
   columns and missed `identity_verified_at` + the tax/requirements columns entirely. A
   reconnected Stripe account can be a **different legal entity**, so the stale stamp would vouch for
   an entity Stripe never verified. Closed application-level (no single column-change event to
   trigger on — the invalidating event is the disconnect action itself), commit `8db1269a`.
4. **Identity, on Stripe revocation** — `deriveIdentityVerified` checked the historical stamp before
   checking `disabled_reason`, so an account Stripe disabled for `rejected.fraud` still rendered
   "identity verified" in the UI. Closed by re-ordering the derivation (revocation checked first),
   commit `d85b5874`. Fraud prevention is the stated reason this slice exists.

Same underlying rule stated four different ways; closed by three different mechanisms (two DB
triggers, one application-level clear on a discrete action, one derivation-order fix) because the
shape of "what invalidates this fact" differed each time — a single column change, a single column
change, an application action with no column-change signature, and a value already present but
mis-prioritized.

## Fail-open vs fail-closed — stated precisely

Slice 1's rule ("`unknown` never blocks") is right for **readiness display**, where the risk of
degrading toward "allow" falls on the user (a spurious blocked action). The `verify-phone` throttle
initially inherited that instinct and was wrong to: on any read error against
`phone_verification_attempts`, it logged and returned `[]`/`undefined`, which reads as "allow" — so a
transient blip, a future RLS change, or a connection cap would silently disable the only defense
against SMS-pumping while still returning 200s. Fixed to fail CLOSED (refuse the send) because here
the risk falls on **us** (the carrier bill), not the user. Same word, opposite correct default
depending on who bears the cost of being wrong. The IP-salt fallback got the identical fail-closed
treatment for the identical reason (Ruling 10): the reviewer found the "fallback" was a literal
committed string, making the SHA-256 hash one cheap offline precomputation from full recovery: refuse
`start` entirely until the real secret exists, rather than silently degrade the throttle.

## Column-level REVOKE is a documented no-op — 4th recorded instance

`20260824140000`'s header names the pattern explicitly: two historical `REVOKE SELECT (email) ...`
statements on `profiles` (`20260507130028`, `20260523234847`) ran successfully and changed nothing,
because a column-level REVOKE cannot override an outstanding table-wide GRANT in Postgres. Same shape
as `20260804174854`, `20260805163247`, and `outstand_post_ownership`. The fix in this slice revokes
at TABLE level first, then grants back an explicit column list — and ends with an
`information_schema` assertion block proven failable (the spec reviewer rebuilt the migration with
`dismissed_coachmarks` deliberately stripped and confirmed the assertion raised).

## Process incident: a reviewer destroyed an implementer's in-flight work

The Task 7 fix re-reviewer, investigating a typecheck failure it did not cause, ran `git stash` on
four `src/lib/accountReadiness/*` files while the Task 8 implementer was actively editing those same
files in the SAME worktree, then dropped the stash. The reviewer's "verified byte-identical
restoration before dropping the stash" was true of what it stashed and false of the net effect,
because the tree kept changing underneath it. Task 8 detected the loss independently (`git diff` came
back empty despite a passing test run), redid every edit with per-edit `git diff --stat` verification,
and committed clean (`e2ec0492`) — verified independently by the controller (`npm run typecheck` exit
0, 68/68 readiness tests). The controller's own fault, not the reviewer's: it ran a read-only reviewer
and a file-writing implementer concurrently in one worktree without telling the reviewer the tree was
live. CLAUDE.md's rule against bare `git stash` names cross-worktree collisions; this was a
same-worktree collision between two of the controller's own agents, which the rule as written did not
name. New rule for the rest of the plan: never run a file-writing agent concurrently with any agent
that might touch the same paths, and tell every reviewer explicitly the tree may be live and it must
not stash/revert/checkout anything.

## Other durable lessons from the ledger

- **A verification signal is a timestamp written only by a server that proved something — never a
  boolean, never client-writable.** Every column added this slice follows that shape.
- **Spec compliance is not correctness.** Three defects this slice originated in the plan/spec text
  and were reproduced faithfully by implementers, passing per-task spec review each time:
  `company.verification.status` (does not exist in the Stripe API — Ruling 16), the Ruling-2-then-9
  grandfather-arm reasoning about which accounts a required tier would lock out, and the
  merge-into-bulk-update shape that would have erased the identity stamp on every `account.updated`
  event (Ruling 7).
- **A brief that names one call site is a hypothesis, not an inventory.** `OnboardingWizard.tsx`
  bypasses `useCreatorProfileSubmit.ts` and upserts `creator_profiles` directly — found once for the
  address-verification wiring (Task 7 round 1) and again for the change-guard (Task 7 round 2), the
  same call site catching the team out twice in one task.
- **`now()` is the TRANSACTION timestamp.** A prod proof of the address-invalidation trigger failed
  on first attempt because the setup and the composite-write test both used `now()` in the same
  transaction, so `NEW.address_verified_at IS NOT DISTINCT FROM OLD.address_verified_at` was
  trivially true and the guard fired when it shouldn't have. Re-run with two distinct literal
  timestamps, it passed. In production this cannot happen — the address write and the verify-address
  write are genuinely separate transactions.
- **When a probe returns zero, prove it could have returned non-zero — and the converse.** Used
  repeatedly: the `get_user_conversations` IDOR proof included a nonexistent-uuid control (0 rows)
  specifically to rule out "the function ignores its parameter"; the profiles-email probe included an
  unrelated-uuid control (0 rows) to prove the messaging-counterparty read wasn't a fluke.

## What is NOT verifiable yet

`verify-phone` and `verify-address` both 503 by design — `TWILIO_VERIFY_SERVICE_SID`,
`PHONE_VERIFY_IP_SALT`, and `GOOGLE_MAPS_SERVER_API_KEY` are all unprovisioned. Nothing in this slice
has sent a real SMS or made a real geocode call. `identity_verified` is `unmet` (not `unknown`) for
0-of-20 `business_profiles`, 0-of-16 `creator_profiles`, 0-of-30 `org_units` with a stamp — i.e. every
account — until Stripe's `account.updated` webhook actually fires for each; the checklist row is
inert only until `READINESS_GATE_ENABLED` gets a `feature_flags` row, which is a deliberate separate
act the PR flags to the founder.

## Merge-time runbook (deliberately out of the normal migration-before-code order)

1. Merge → wait for Vercel to finish deploying `main` (~1–3 min).
2. THEN apply `20260824140000` (the profiles SELECT revoke) + its ledger row.
3. THEN `supabase gen types` (the new RPC is behind an `as never` cast until this runs).
4. Verify: table-wide SELECT gone on `profiles`, `email`/`phone` absent from column grants, org roster
   still loads.
5. Also apply `20260824150000` (the address trigger, currently unapplied) and deploy the four pending
   edge functions/webhook update — `verify-phone`, `verify-address`, `stripe-webhook`,
   `disconnect-stripe-account` — flagged by the final whole-branch review as a release-process gap the
   original runbook omitted.

`20260824100000`, `101000`, `110000`, `111000`, `120000` and `130000` were applied to prod and
independently verified during the branch's development (ledger row + object existence + live
before/after probes, not just "the migration succeeded"). `20260824135000` (the org-roster RPC) was
written to be applied before merge per its own header comment, but the ledger has no record that this
actually happened yet — verify before relying on it. `20260824140000` (the profiles SELECT revoke)
and `20260824150000` (the address re-verification trigger) are confirmed **not yet applied** —
both were proven correct only inside rolled-back transactions, deliberately, per Ruling 15 and the
merge-time runbook above.

---

# ADDENDUM (2026-08-23, later the same day): the review loop that ran AFTER this file was written

Everything above was written at commit `e9e71096` — the knowledge-sync commit — and is preserved
verbatim as the record of the slice as it stood at that moment. **Eight further commits landed after
it**, and parts of the text above describe mechanisms that no longer exist. This addendum is the
correction; where it contradicts the sections above, the addendum is the current state and the
contradiction is named rather than edited away.

**Branch state at the end:** 27 commits, 11 migrations, 256 test files / 2721 tests passing,
typecheck / `typecheck:functions` (68 functions) / lint / build all clean. Ledger now 1372 lines and
28 rulings (was 1258 / 20).

## The review sequence, in order

| Commit | Source | Findings |
|---|---|---|
| `44a9dc11` | Codex P1 pass | 2 (verify-address forgery, verify-phone throttle race) |
| `39205a42` | internal re-review of that fix | 3 blocking (verify-address CAS, CI typecheck gate) |
| `63548867` | Codex round 1 | 3 (1 P1, 2 P2) |
| `3fc30644` | Codex round 2 | 2 (1 P1, 1 P2) |
| `09fb7538` | Codex round 3 | 1 (P2) |
| `3497a2ce` | Codex round 4 | 1 (P1) — which immediately exposed a second |
| `249b409d` | Codex round 5 | 1 (P1) |
| `658c411d` | Codex round 6 | 1 (P1) |
| — | Codex round 7 | clean |

Nine findings across the seven Codex rounds, every one real, every one ours. Two of the nine (round 2
P2, round 6 P1) were **defects our own previous fix in the same loop had introduced**.

## What the sections above now get wrong, and the correction

**1. `exceedsSendLimit` / `withinCooldown` no longer exist.** The "Fail-open vs fail-closed" section
describes an application-code throttle decision taken over a prior read of
`phone_verification_attempts`. That shape was the bug, not just its fail-open default: read-then-act
is a check-then-act race, so N concurrent `start` requests all read the same pre-limit history and
all sent. The threat model this function states is SMS-pumping fraud, so the quantity being bypassed
is billed carrier charges.

The decision moved into SQL. `reserve_phone_verification_send` (migration `20260824160000`,
`SECURITY DEFINER`, `search_path = public`, service-role only) counts and inserts **atomically**
under two `pg_advisory_xact_lock`s taken in a fixed order (user key, then ip key — a fixed order
turns two callers sharing an IP into a queue rather than a deadlock cycle). It mirrors
`record_crew_activity`'s fix for the identical race shape (`20260710120010`). The reservation happens
**before** Twilio is called; if Twilio then fails, the caller flips that same row to `'rejected'`
rather than deleting it, so a failed send still consumes quota — fail closed toward our own bill. The
count predicate is therefore `outcome IN ('sent','rejected')`, never `'sent'` alone.
`exceedsSendLimit` and `withinCooldown` were **deleted** along with their three tests;
`rateLimit.ts` now holds only the three constants (which index.ts passes to the RPC as parameters)
and `isAllowedCountry`.

Proven on prod inside `begin; … rollback;` across five scenarios — service-role guard enforced, 3
reservations then a refused 4th with zero extra rows, back-to-back cooldown declines, a 2-minute-old
cooldown allows, and two users sharing one `ip_hash` throttle on the IP dimension independently of
their per-user counts. Confirmed absent afterward, zero rows leaked.

**2. `verify-address` no longer takes address fields from the caller at all.** The first forgery fix
conditioned the write on the fields the CALLER submitted. That closed the attack and opened two
silent, permanent failures, because the caller's copy and the stored row are produced by different
code paths that normalize differently: `OnboardingWizard.tsx` upserts `{city, country, timezone}`
with no `postal_code`, leaving a stored `'07030'` behind while the client verified with
`postalCode: null`; and `useCreatorProfileSubmit.ts` / `useOrgData.ts` store city/country/address
**untrimmed** while the client helper sent them trimmed. Either disagreement yields zero matched
rows, which the code correctly treats as "not an error" — so the account becomes permanently
unverifiable with no user-visible signal.

The remedy is deliberately not a field-by-field patch. The server now **reads the stored row,
geocodes exactly what it read, and conditions the write on those exact stored values** — a
compare-and-set of the row against itself. The request body carries only `{role}` (plus `orgUnitId`
for a business, which names a row and is then authorized against active owner/admin org membership).
The address fields were **removed** rather than accepted-and-ignored: a field that is parsed but
unused invites the next edit to trust it again. That also closes the original forgery *structurally*
— a caller who cannot name an address cannot cause one to be geocoded — rather than by comparison.
The planning half is a pure, unit-tested module (`verify-address/storedAddress.ts`): predicate values
verbatim, geocode query text trimmed, a missing row distinguished from a blank address, and
`.is(col, null)` chosen from what is stored rather than from whether a request field was omitted.

**3. The stamp/fact rule hit FIVE times, not four.** The fifth is the **automatic** Stripe detach
path: `check-restaurant-payout-status` clears a stale Stripe reference when Stripe answers 404 /
`account_invalid`, but cleared only `stripe_account_id` and `stripe_onboarding_complete`. All four
Stripe-derived identity signals survived, so a business whose Stripe account had been **deleted**
kept rendering as identity-verified.

That a fifth instance existed at all is the evidence that fixing instances one at a time does not
close a class: instances 1–4 were each closed in isolation, and the manual disconnect path was fixed
without anyone noticing there was an automatic one. So the reset became
`supabase/functions/_shared/stripe-identity-reset.ts` — a single `STRIPE_IDENTITY_RESET` constant
both paths spread into the same `.update()` that nulls `stripe_account_id`, so detach and reset
cannot half-apply and the next detach path inherits it instead of becoming a third copy.

## The other findings, and what each one teaches

**The same enumeration failed three times, always silently.** The `profiles` write-lockdown grant-back
list was built by grepping for `from('profiles')` in single quotes. It missed `dismissed_coachmarks`
(`Coachmark.tsx`, fixed by `20260824101000` mid-slice) and then missed `onboarding_completed_at`
(`useTour.ts`, Codex round 1, fixed by `20260824170000`) — both double-quoted. Then the SELECT
lockdown's inventory missed `useProfileNames`, a query reading columns that do not exist. All three
failed silently, for one shared reason: **none of those call sites checks the error Supabase
returns**, so a missing grant produces a 42501 and no signal at all. `useTour.completeMutation`
reported success, recorded nothing, and re-armed the tour next session.

A human grep that has failed twice identically is not a control, so the durable half of the fix is
`src/lib/profilesWriteGrants.test.ts`: it re-derives the write surface from `src/` quote-agnostically
on every CI run and asserts each written column appears in the granted set **parsed out of the
migrations**, rather than duplicating the list (a copy would be a third enumeration to keep in sync).
Round 4 extended it to SELECT.

**A finding can be right in its conclusion and wrong in its mechanism — and the remedy follows from
the mechanism.** Codex round 4 flagged the SELECT lockdown as breaking `useProfileNames`, which
selects `first_name, last_name, username`. The hook is indeed broken and silently so — but it has
been since it was written, because **those three columns do not exist on `profiles` and never have**.
Verified three independent ways before acting: no migration creates them, they are absent from the
regenerated types, and they are absent from the read lockdown's own column inventory. PostgREST
rejected the whole query with 42703 every time it ran; the hook discarded `error` and fell back to
`data ?? []`, so every caller silently got an empty map and rendered truncated user ids. Codex's
proposed remedy — grant SELECT on those columns — **would have failed the migration outright**.
Fixed to `full_name`, with the error now thrown rather than swallowed.

Extending the grants test to SELECT then immediately found a second one: `AuthContext`'s connection
probe ran `select('count', { count: 'exact', head: true })`, where `count` is a PostgREST idiom and
not a column. That probe runs on every profile fetch and **throws** on failure, so it sat directly in
front of auth for every user. Now counts `id`, a real granted column.

**A green gate that does not cover the file you changed is not evidence about your change.**
`check-restaurant-payout-status` is on `.typecheck-ignore`, so the "68 functions clean" result said
nothing whatsoever about the round-5 fix. Checked directly with `deno check`: 4 errors, all
pre-existing at lines 199–200 (`balance.pending.reduce`) and untouched — which is why the file is
ignored in the first place. `disconnect-stripe-account` is not ignored and is covered.

A related distinction, from `39205a42`: the implementer reported "typecheck clean" truthfully, and it
was clean — of `tsc -p tsconfig.app.json`, which covers `src/` only and does not look at edge
functions at all. `npm run typecheck:functions` was simultaneously **red with 11 errors, all in
`verify-phone`** — a function this branch introduces, so relative to `main` this branch is what turns
CI red. "Pre-existing on the branch that introduced the file" is not pre-existing. Fixed properly
rather than by adding a new security-sensitive function to `.typecheck-ignore`; all 11 had one cause
(`ReturnType<typeof createClient>` resolves a generic function's type parameters to their
*constraints*, `unknown`/`never`, not their defaults — the bare imported `SupabaseClient` type is the
pattern `outstand-proxy` and others already use). **Two different gates share one word: ask which
gate, not whether it is green.**

**Google Geocoding signals almost every failure as HTTP 200 with a JSON `status`**, so the `resp.ok`
check caught essentially nothing. `OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `INVALID_REQUEST` and
`UNKNOWN_ERROR` all fell through as "no result" — and the write path stores
`address_verified_at`/`lat`/`lng` = null on no result. A quota blip would therefore have revoked
still-true verifications for every caller who saved during it, and a misconfigured key would have
revoked verification platform-wide until someone noticed. Only `OK` and `ZERO_RESULTS` are answers
**about the address**; everything else is a fact about us. `ZERO_RESULTS` deliberately stays on the
write path — "does not resolve" is a real answer and clearing the stamp is the correct response.
Extracted as `isGeocodeAnswer`; a missing or unrecognised status is refused, never assumed OK.

**A comment of ours was itself a defect (round 2, P2).** When the `org_units` address pre-read fails
we do not know whether the address changed, and the previous commit's comment argued that
re-verifying anyway "errs toward the conservative direction, since a redundant geocode only costs a
request". That is backwards: the verify path is **destructive**, so speculative re-verification is
the damaging direction. With the modal resubmitting an unchanged address, a failed pre-read plus an
unresolved geocode revokes a valid stamp during a plain rename. Now tracked as
`previousAddressKnown` and skipped when unknown. Slice 1's "`unknown` never blocks" governs
**display**; it does not license a **write**.

**A Supabase query resolves with `{ error }` rather than rejecting (round 1, P2).** So
`await Promise.all([...])` in `stripe-webhook` succeeded even when every mirror write inside it had
failed, and Stripe was told the signal was mirrored when it was not — and Stripe emits
`account.updated` only **on change**, so there may be no later event to repair it. Both batches now
go through `assertNoWriteErrors`, which throws so Stripe's own retry becomes the repair path. This is
deliberately the opposite policy from the pending-balance flush directly below it, which stays
non-fatal because it has the onboarding-return poll as a backstop and this mirror has none.

**Payment requirements were reading as identity failures (round 3, P2).** `stripe_requirements_due`
mirrors *every* outstanding Stripe requirement, so a missing bank account (`external_account`) or an
unaccepted ToS rendered as "Verify your identity" — mislabelling the task, duplicating `deriveStripe`,
and, because identity is a `required` item, blocking actions for a banking issue. Filtered through
`identityRequirements`, a **denylist** of non-identity prefixes rather than an allowlist of known
identity keys. The two fail in opposite directions on a Stripe key we have never seen: an allowlist
ignores it and renders "identity verified" while identity work is outstanding — a false positive on a
fraud signal — whereas a denylist over-reports unmet, which is annoying, visible and safe. This slice
exists for fraud prevention, so an unknown key must never resolve toward "verified". Prefix matching
respects the dot boundary so `external_account_holder_identity` is not swallowed by `external_account`.

**"Unmet for effectively every account" is a finding, not a reassurance — and it appeared twice.**
The first time was Ruling 9 (the `required` tier read as inert because `READINESS_GATE_ENABLED` has
no flag row — true of `ReadinessGate`, false of the checklist components that consume the engine
directly). The second was Codex round 6: `address` is `required` and derives from
`address_verified_at`, a column added with **no backfill**, so every pre-existing location starts
NULL — and the round-1 change-guard, correct in itself, removed the only way out by making a re-save
of an unchanged address a no-op. `useUpdateOrgUnit` now also fires verification when a location has
**never** been verified, even if the address is unchanged; that is safe for exactly the reason the
guard exists, since a row with no stamp has nothing to lose. Shipped with it: all three address
requirements relabelled **"Add your address" → "Confirm your address"**, because they derive from a
stamp rather than from whether an address exists, and telling an account that typed its address
months ago to "add" one is false on its face.

## Corrections to the record above

- **The four-times framing is now five.** Sections "What shipped", "The pattern that repeated four
  times", and the ruling ledger all say four. The fifth is identity-on-auto-detach, above.
- **`withinCooldown` is no longer the coverage gap.** The accurate gap is broader and worse: the
  **whole** send throttle is now SQL and has **no automated test**, because Vitest cannot reach a
  database. It is proven only by the hand-run, rolled-back prod script described above.
  `rateLimit.test.ts` still covers `isAllowedCountry`, the only pure decision left. The three
  `exceedsSendLimit` tests were deleted with their subject rather than kept green against code
  nothing calls.
- **The Wiki log's flagged item (3) is wrong.** It records `useTour.ts`'s `onboarding_completed_at`
  as "a pre-existing dead-code write to a nonexistent column". The column **does exist** — migration
  `20260427110000_tour_coachmark_state.sql` adds it. What is true is that it is absent from
  `src/integrations/supabase/types.ts`, i.e. the generated types are stale, which is how it read as
  nonexistent. The write was real, and the write lockdown broke it; `20260824170000` grants it back.
  (Flagged item (2), `useProfileNames.ts`, was correct and is now fixed rather than merely recorded.)
- **Migration count is 11, not 9.** Added since: `20260824160000` (the reserve RPC, recorded
  explicitly as NOT applied) and `20260824170000` (the `onboarding_completed_at` grant — no record of
  application either way; verify before assuming).
- **The deploy list gained a fifth function.** `check-restaurant-payout-status` now imports
  `_shared/stripe-identity-reset.ts` and must deploy alongside `verify-phone`, `verify-address`,
  `stripe-webhook` and `disconnect-stripe-account`.
- **The address `required` item is now satisfiable by an existing account**, via the `neverVerified`
  branch — but only once `GOOGLE_MAPS_SERVER_API_KEY` exists. Until then no address can be verified
  at all, so the requirement is display-only. That is safe, and would stop being safe the moment
  `READINESS_GATE_ENABLED` is armed. Nothing may arm that flag until the key is provisioned **and**
  existing locations have actually been verified.

## The standing note on the loop itself

Nine findings across seven rounds, every one real. Two of them were defects introduced by our **own**
prior fix inside the same review loop — which is the argument for re-running an independent reviewer
after every fix round, rather than assuming a fix is inert. And the round-2 P1 overturned a call that
had been explicitly made and recorded (the throttle race, parked as non-blocking on the grounds that
the bypass was "bounded by concurrency"). It is not a bound: the attacker chooses the concurrency,
and each request is a billed SMS. **The error was grading a finding on how hard it is to exploit
rather than on what it costs when exploited** — for a financial control those are different
questions, and only the second decides whether it blocks a merge. Two independent reviewers reached
that finding and the first was overridden; the second only ran because CLAUDE.md makes the Codex pass
mandatory rather than discretionary.
