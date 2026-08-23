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
