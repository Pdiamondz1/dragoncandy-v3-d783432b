# Supabase Database Schema

## Key Relationships

* `profiles` is the central user table — always join through here for user info
* `campaigns` → `campaign_applications` → `campaign_collaborations` is the core marketplace flow
* `conversations` + `conversation_participants` + `messages` power the chat system
* `file_uploads` are the primary content deliverable mechanism between creators and brands

> **`updated_at` now works — `handle_updated_at()` was a no-op stub on prod until 2026-08-07.**
> **RESOLVED** (PR #385, migration `20260807233200`). For years the shared trigger function's entire
> body on prod was `-- Function logic here` / `RETURN NEW;` — it never assigned `NEW.updated_at`, so
> all **35 triggers across 31 tables** fired and changed nothing. This was **prod drift, not repo
> state**: both repo definitions (`20250616011059`, `20250617123640`) always said
> `NEW.updated_at = now()`. Same "recorded ≠ actual" class as the collaboration state machine
> ([[Content Delivery State Machine]], PR #325). Restored and proven by a rollback-wrapped live
> round-trip on `feature_flags`: `updated_at` moved to `now()`.
>
> **What this means for you now:** `updated_at` is a valid *modification* timestamp on these tables
> going forward. It is **still not a status/completion signal** — it moves on *any* write, so a title
> edit is indistinguishable from a status change. For "when did this happen", use a purpose-built
> anchor stamped by its own narrow trigger. The full set:
>
> | Anchor | Table | Stamped on |
> |---|---|---|
> | `content_submitted_at` | `campaign_collaborations` | transition into `content_status='submitted'` |
> | `payout_executed_at` | `campaign_collaborations` | the instant money moves |
> | `status_changed_at` | `campaign_collaborations` | transition of `status` **or** `content_status` (`20260808020000`) |
> | `completed_at` | `campaigns` | transition into `status='completed'` (`20260807233000`) |
> | `escrow_status_changed_at` | `campaigns` | transition of `escrow_status` **only** (`20260808020000`) |
>
> **Why `campaigns` has an escrow-specific anchor and `campaign_collaborations` has a combined one
> is not an inconsistency — it is driven by the consumer.** `donny-analytics-alerts` reports escrow
> state for campaigns, so an anchor that also moved on a `status` change would announce an escrow
> event that never happened (Codex caught exactly that in review). The collaborations alert labels
> `content_status || status`, so either transition is an event it genuinely reports. **The test for
> a new anchor is never "how many columns" — it is "does every column this stamps on produce an
> event the reader actually reports".** See [[Updated-At Trigger Drift]].
>
> Both `20260808020000` columns are **nullable with no backfill**: `NULL` means "predates the
> migration and hasn't changed since", and `.gte()` excludes NULL, which is the intended
> conservative behaviour. The backfill was deliberately omitted because an `UPDATE` on these tables
> fires `handle_updated_at` (live again) plus `enforce_single_slot_campaign`, which can `RAISE`.
> Note also that `DEFAULT now()` is set **after** `ADD COLUMN` in that migration — putting a
> volatile default inside `ADD COLUMN` evaluates it for every existing row.
>
> **Legacy `updated_at` is unreliable in BOTH directions — don't infer history from it.** A
> pre-2026-08-07 row where `updated_at == created_at` means *"no explicit writer touched it"*, **not**
> "never modified" — the stub swallowed every trigger-driven touch. But the converse doesn't hold
> either: tables with an application-level writer moved anyway. Measured on prod 2026-08-08:
> `campaign_collaborations` has **10 of 16** pre-Aug-7 rows with `updated_at != created_at` (written
> by `useProjectComplete.ts` on the completion path — note the 3-digit-millisecond JS timestamps
> versus `now()`'s microseconds), and `organizations` **7 of 24**; `campaigns` and `conversations`
> are **0**. And any legacy row updated *after* the restore now moves normally. So a backfill or
> "stale rows" sweep spanning that date can be wrong either way — verify per table before relying on
> it.
>
> Enumerate the trigger set with:
> `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where p.proname='handle_updated_at' and not t.tgisinternal;`
> (Four tables — `beta_feedback`, `feature_flags`, `onboarding_steps`, `user_onboarding_progress` —
> carry *two* triggers bound to this function; both assign the same `now()` in one transaction, so
> the duplication is idempotent.) See [[Updated-At Trigger Drift]].

## User & Auth

| Table | Purpose |
|-|-|
| `profiles` | Core user profiles (linked to Supabase auth). Includes `first_run_missions` JSONB for onboarding state (narrowed 2026-08-23 — see the note below), plus `phone` / `phone_verified_at` / `dismissed_requirements` for the account completeness engine. |
| `creator_profiles` | Extended profile data for content creators |
| `business_profiles` | Extended profile data for brands/businesses |
| `profile_views` | Tracks who viewed which profiles |
| `onboarding_steps` | Defines onboarding flow steps |
| `user_onboarding_progress` | Tracks per-user onboarding completion |
| `email_verification_tokens` | Email verification flow |
| `feature_flags` | Per-user or global feature toggles |
| `user_roles` | RBAC role assignments (`app_role` enum). Queried via the `has_role()` security-definer function so RLS policies stay non-recursive. |
| `phone_verification_attempts` | Per-user + per-IP `verify-phone` (Twilio Verify) send/check audit log — service-role only, no client access. See the identity-verification note below. |

> **Account completeness columns (`20260823120000`, applied to prod 2026-08-23).** Three nullable
> `profiles` columns, no default and no backfill — a volatile default would rewrite every row, and
> `NULL` is a meaningful "never set". See [[Account Completeness Engine]].
>
> | Column | Type | Meaning |
> |---|---|---|
> | `phone` | `text` | Captured number. OTP now has a provider (`verify-phone`, Twilio Verify — slice 2, see below), but its two secrets are unprovisioned so nothing has verified a real number yet. |
> | `phone_verified_at` | `timestamptz` | The instant phone ownership was **proven**. `NULL` = not verified. Never a boolean set optimistically. Server-write-only since `20260824100000`; cleared on any `phone` change not paired with a new stamp in the same statement (`20260824120000`) — see [[Identity & Address Verification]]. |
> | `dismissed_requirements` | `text[]` | Requirement keys the user dismissed. **Recommended tier only** — a required item is never dismissible. |
>
> **`dismissed_requirements` is deliberately NOT the existing `dismissed_coachmarks` column.** Both are
> arrays of opaque string keys, so sharing one means a coachmark key colliding with a requirement key
> silently dismisses the wrong thing, with **no type error** to catch it.
>
> **`phone_verified_at` is a timestamp, not a flag, for the same reason every other anchor in this file
> is** — a boolean can be set by anything optimistic; an instant records that something was proven.
> Confirm no public view exposes either phone column before adding one: `phone` is contact PII, and the
> `public_*` views are anon-reachable.
>
> **`first_run_missions` narrowed in the same work.** Only four keys are still written and only they
> count toward `areMissionsComplete`: `browse_inspiration`, `view_campaigns`, `select_style`,
> `browse_creators` — pure "did the user look at this once" events with no row anywhere to derive from.
> Everything else (`setup_payments`, `add_portfolio`, `create_campaign`, `apply_campaign`, …) is now
> **derived** and **no derived requirement may read the blob** (enforced by test). The column stays;
> legacy rows keep reading fine. **Those four keys are load-bearing:** `isFirstRun` never consults the
> engine, so `completed_at` — and therefore leaving first-run mode — depends entirely on them.

> **Identity, tax and address verification columns (slice 2, [[Identity & Address Verification]]).**
> Migration `20260824110000` adds 12 nullable columns across three tables (16 counting the four
> `profiles` columns above), no default, no backfill — `NULL` means "we have not heard from the
> authority (Stripe/geocoder) yet", which the readiness engine renders as `unknown`, never a failure.
> **No tax ID number is ever stored** — both Connect accounts are Express, so Stripe collects and
> verifies the tax ID and never exposes it to the platform; these columns mirror the SIGNAL only.
>
> | Column | On | Meaning |
> |---|---|---|
> | `identity_verified_at` | `creator_profiles`, `business_profiles`, `org_units` | Stripe reported `verification=verified` (or, for company accounts, `payouts_enabled && !disabled_reason` — see below). Server-write-only. |
> | `tax_id_provided` | `creator_profiles`, `business_profiles`, `org_units` | Stripe holds a tax ID. Never the number. Server-write-only. |
> | `stripe_requirements_due` | `creator_profiles`, `business_profiles`, `org_units` | `text[]`, mirrors Stripe's outstanding requirements. Server-write-only. |
> | `stripe_disabled_reason` | `creator_profiles`, `business_profiles`, `org_units` | Mirrors Stripe's `disabled_reason` (e.g. `rejected.fraud`). Server-write-only; **outranks a surviving `identity_verified_at` stamp** in the readiness derivation — revocation must win over history. |
> | `address_verified_at` | `creator_profiles`, `org_units` | The instant `verify-address` (Google Geocoding) confirmed the address. **Not** on `business_profiles` — a business's address is per-location and lives on `org_units`; `business_profiles` is the account. Server-write-only; cleared on any address-field change not paired with a new stamp in the same statement (`20260824150000`). |
> | `lat` / `lng` | `creator_profiles` only (`org_units` already had them) | City/postal **centroid**, never a street address; creator coordinates are rounded to 2 decimal places (~1.1km) at write time. **NOT guarded by the server-write-only trigger below** — a client can PATCH these directly. Bounded because the readiness engine keys off `address_verified_at` alone, but "Find Creators near me" ranks on proximity without consulting the stamp, so planted coordinates can place a creator in a city search they aren't in. Parked, not fixed. |
>
> **Server-write-only enforcement is a `BEFORE INSERT OR UPDATE` trigger per table, deliberately NOT
> the `profiles` grant-based pattern.** `creator_profiles`/`business_profiles`/`org_units` each have at
> least one write path that is a runtime-computed object (`useOrgData.ts`'s caller-supplied partial via
> `useUpdateOrgUnit`), so an explicit column-grant list is a silent-`42501`-in-production trap for the
> next call site nobody enumerated. Instead, `guard_creator_profiles_verification_columns()` /
> `guard_business_profiles_verification_columns()` / `guard_org_units_verification_columns()`
> (`20260824110000` UPDATE-only, widened to also cover INSERT by `20260824111000` after a reviewer
> proved live on prod that delete-then-reinsert forged `identity_verified_at`/`tax_id_provided`) raise
> `verification columns are server-write-only` unless
> `current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'`. Plain `INVOKER`
> (not `SECURITY DEFINER` — the functions only read a session GUC and compare NEW/OLD, no privileged
> access needed). Trigger firing order is load-bearing: these `guard_*` triggers sort before the
> `trg_clear_*` re-verification triggers below (alphabetical, same table), so the guard always sees the
> client's ORIGINAL row before either clearing trigger has touched it — reversed, a legitimate client
> address/phone edit would hard-fail with the same exception.
>
> **Re-verification (clearing) triggers — a stamp must never outlive the fact it attests to.**
> `trg_clear_phone_verification` (`20260824120000`, on `profiles`) and the `org_units`/
> `creator_profiles` address triggers (`20260824150000`) share one shape: `NEW.<fact> IS DISTINCT FROM
> OLD.<fact> AND NEW.<stamp> IS NOT DISTINCT FROM OLD.<stamp>` — clears the stamp when the underlying
> fact changes UNLESS the stamp is being set in the SAME statement (the real verify-phone/verify-address
> write shape: `update ... set phone = $1, phone_verified_at = now()`). Without the dual condition, that
> single-statement composite write would see `phone` changed and null the very stamp it was just handed
> — verification would appear to succeed and silently never record. **`identity_verified_at` has no
> trigger equivalent** — there is no single column whose change should invalidate it; instead the
> detach paths clear all four Stripe-derived columns explicitly (an application action, not a column
> change), because a reconnected account can be a different legal entity and a stale stamp would vouch
> for one Stripe never verified. **There are TWO such paths, not one**: the manual
> `disconnect-stripe-account`, and the automatic `check-restaurant-payout-status`, which clears a stale
> reference when Stripe answers 404 / `account_invalid`. The second was found by the Codex second review
> only because the first had been fixed in isolation — so both now spread the shared
> `STRIPE_IDENTITY_RESET` constant (`supabase/functions/_shared/stripe-identity-reset.ts`) into the same
> `.update()` that nulls `stripe_account_id`, and detach and reset cannot half-apply. Any future detach
> path must do the same.
>
> **`phone_verification_attempts`** (`20260824130000`) — per-user and per-IP SMS-send throttle audit
> log for `verify-phone` (`id`, `user_id` FK `auth.users` ON DELETE CASCADE, `ip_hash`, `action` ∈
> `start`/`check`, `outcome` ∈ `sent`/`approved`/`rejected`/`throttled`/`blocked_country`,
> `created_at`). No client access at all — RLS enabled, `service_role`-only policy, `revoke all …
> from public, anon, authenticated`. The throttle **fails CLOSED** (refuses the send) on any error —
> the opposite default from the readiness engine's "`unknown` never blocks", because here the risk of
> a false "allow" is our own carrier bill, not a user's blocked action.
>
> **`reserve_phone_verification_send(p_user_id uuid, p_ip_hash text, p_limit int, p_window_seconds
> int, p_cooldown_seconds int) returns jsonb`** (`20260824160000`, SECURITY DEFINER,
> `search_path=public`, `revoke execute … from public, anon, authenticated` + `grant … to
> service_role`) — the throttle DECISION, moved out of application code. `verify-phone` originally
> read this table, decided in TypeScript (`exceedsSendLimit` / `withinCooldown`), then called Twilio
> and inserted the `'sent'` row afterwards: a check-then-act race in which N concurrent `start`
> requests all read the same pre-limit history and all sent, bypassing both the daily cap and the
> cooldown on a function whose threat model is SMS-pumping fraud. Raised by an internal review and
> parked as non-blocking; raised again independently as a **Codex P1**, which was right. Both helpers
> are now **deleted** — `rateLimit.ts` keeps only the three constants (passed in as the `p_limit` /
> `p_window_seconds` / `p_cooldown_seconds` parameters) and `isAllowedCountry`.
>
> The RPC counts and inserts **atomically** under two `pg_advisory_xact_lock`s taken in a **fixed
> order** (user key, then ip key), mirroring `record_crew_activity`'s fix for the same race shape
> (`20260710120010`); the fixed order makes two callers sharing an IP a queue rather than a deadlock
> cycle. It reserves the `'sent'` row **before** Twilio is called; if Twilio then fails, the caller
> flips that same row to `'rejected'` via a plain service-role UPDATE rather than deleting it, so a
> failed send still consumes quota — hence the count predicate is `outcome IN ('sent','rejected')`,
> **never `'sent'` alone**. `'throttled'` and `'blocked_country'` are excluded from the count: neither
> ever reserved a slot, and both are written by the CALLER, not by this function (its decline branches
> return without writing anything). Returns `{reserved, reason}` plus `attempt_id` on success; a null
> or errored result refuses the send with a 503.
>
> **It has no automated test, and cannot have one under Vitest** — the decision is now SQL and needs a
> database. Proven only by a hand-run, rolled-back prod script across five scenarios (service-role
> guard enforced; 3 reservations then a refused 4th with zero extra rows; back-to-back cooldown
> declines; a 2-minute-old cooldown allows; two users sharing one `ip_hash` throttle on the IP
> dimension independently of their per-user counts), confirmed absent afterward with zero rows leaked.
>
> **`get_org_members_roster(p_org_id uuid)`** (`20260824135000`, SECURITY DEFINER, `search_path=public`,
> revoked from `public, anon`, granted to `authenticated`) — replaces a direct client SELECT of
> `profiles.email` for the org-member roster feature, which the read lockdown below makes unreachable
> from the base table. Identity from `auth.uid()` only (no id parameter to point at someone else);
> raises `forbidden: not an active member of this organization` unless the caller has an
> `invitation_status='active'` row in `org_members` for `p_org_id`. Returns the roster INCLUDING invited
> (not just active) members — who may CALL it and which rows it SHOWS are deliberately different
> questions.
>
> **Two `profiles` PII lockdowns — write and read are separate problems, closed separately.**
> 1. **Write** (`20260824100000` + `20260824101000` + `20260824170000`): `revoke update, insert on
>    public.profiles from authenticated, anon`, then `grant update (<cols>)` / `grant insert (<5 cols>)`
>    — an explicit list enumerated from every client write site in `src/`. Closes `phone_verified_at`
>    client self-stamping.
>
>    **That enumeration then failed TWICE, identically, and both failures were silent.** The grep
>    assumed single-quoted `from('profiles')` and both missed call sites use double quotes:
>    `dismissed_coachmarks` (`Coachmark.tsx`), which broke a live UI mutation and was closed by the
>    follow-up `20260824101000`; and `onboarding_completed_at` (`useTour.ts`), found by the Codex second
>    review and closed by `20260824170000`. Neither call site checks the error Supabase returns, so each
>    surfaced as a 42501 that the app discarded — `useTour.completeMutation` reported success, recorded
>    nothing, and re-armed the tour next session. Each fix is a NEW migration; the applied ones are never
>    edited.
>
>    **A human grep that has failed twice the same way is not a control**, so the durable half lives in
>    `src/lib/profilesWriteGrants.test.ts`: it re-derives the write surface from `src/`
>    **quote-agnostically** on every CI run and asserts every written column appears in the granted set
>    **parsed out of these migrations** — deliberately not a copy of the list, since a copy is a third
>    enumeration to keep in sync. Extended to cover SELECT (the read lockdown below) after a third
>    instance of the same class: `useProfileNames` selected `first_name, last_name, username`, columns
>    that **do not exist on `profiles` and never have** — a 42703 the hook swallowed via `data ?? []`.
>    Note the corollary for that column list: `onboarding_completed_at` exists (created by
>    `20260427110000_tour_coachmark_state.sql`) but is **absent from
>    `src/integrations/supabase/types.ts`**, so a "does this column exist" check against the generated
>    types alone will get it wrong. Regenerate types before trusting them for that question.
> 2. **Read** (`20260824140000`, applied AFTER the Vercel deploy of the code that depends on it — see
>    below): `revoke select on public.profiles from anon, authenticated`, then `grant select (<15
>    cols>)` omitting `email` and `phone`. RLS has no column granularity — the "View messaging
>    participants profiles" policy grants the WHOLE ROW to any messaging counterparty, so with
>    `authenticated` holding table-wide SELECT that included `email` and (the moment `verify-phone`
>    shipped) `phone`. **This is the 4th recorded instance of a column-level `REVOKE` being a
>    documented no-op against an outstanding table-wide `GRANT`** — two historical `REVOKE SELECT
>    (email) …` statements (`20260507130028`, `20260523234847`) ran successfully and changed nothing.
>    The migration's header explicitly states what it does NOT close: two `SECURITY DEFINER` functions
>    still reach `profiles.email` by design or as a pre-existing hole — `get_recipient_email` (a
>    deliberate feature) and `get_user_conversations` (a live, unauthenticated IDOR, verified on prod,
>    left out of scope for this slice — needs an owner).
>
> **Apply-order note, since it inverts this project's usual migration-before-code rule:** `20260824140000`
> is backward-INCOMPATIBLE with the frontend running on prod at merge time (which still selects `email`
> directly), so it must apply only after Vercel finishes deploying the new code — the reverse of Tasks
> 2/3/4's additive migrations, which were safe to apply on the spot. `20260824135000` (the RPC) is
> backward-COMPATIBLE and applies BEFORE merge, since the new frontend needs it to exist the instant it
> deploys. See [[Identity & Address Verification]] for the full merge-time runbook.
>
> **The slice ships 11 migrations in total** (`20260824100000`, `101000`, `110000`, `111000`, `120000`,
> `130000`, `135000`, `140000`, `150000`, `160000`, `170000`) — the last two added by the Codex second
> review. `140000`, `150000` and `160000` are confirmed **not applied**; `170000` has no record either
> way, so verify before assuming. The merge-time deploy list is five
> edge functions: `verify-phone`, `verify-address`, `stripe-webhook`, `disconnect-stripe-account` and
> `check-restaurant-payout-status` (which gained `_shared/stripe-identity-reset.ts` at Codex round 5).

## Campaigns & Marketplace

| Table | Purpose |
|-|-|
| `campaigns` | Brand-created campaigns seeking creators |
| `campaign_applications` | Creator applications to campaigns |
| `campaign_collaborations` | Active collaborations between brands and creators |
| `campaign_invitations` | Direct invites from brands to creators. **A creator's UPDATE is decline-only (2026-08-08).** See the invitation-integrity note below. |
| `campaign_matches` | Matched brand/creator pairings |
| `campaign_sponsorships` | Sponsorship arrangements within campaigns |
> **Invitation & application integrity — migrations `20260808010000` + `20260808020000`, applied
> and proven red→green on prod 2026-08-08.** Two live holes, both demonstrated by impersonating a
> real user inside a rolled-back transaction (never assumed):
>
> 1. **`campaign_invitations` UPDATE had `USING (auth.uid() = creator_id)` and NO `WITH CHECK`.**
>    Postgres defaults an omitted `WITH CHECK` to the `USING` expression, so `creator_id` *was*
>    pinned (reassignment blocked — verified) — but nothing else was. A creator could **forge
>    `status='accepted'`** without applying (making the owner's card read "Applied — review them"
>    with no application behind it) and could **repoint the row at another `campaign_id`**, which
>    manufactures apply rights because an *invited* creator may apply to a campaign that has left
>    `published`. Now: policy `USING (creator AND status='pending')` / `WITH CHECK (creator AND
>    status='declined')`, **plus** `revoke update … from authenticated, anon` then
>    `grant update (status) to authenticated` — because RLS `WITH CHECK` sees only the NEW row
>    (there is no `OLD` in a policy), so "campaign_id must not change" is inexpressible as a policy
>    and column privileges are the correct tool. The migration self-asserts the resulting grant set
>    is exactly `authenticated:status`, and the filter includes **`PUBLIC`** — a table-wide
>    `GRANT … TO PUBLIC` is recorded under that grantee, so omitting it would make the assertion
>    unfailable. The one legitimate client write, `useDeclineInvitation`, still works.
> 2. **`apply_to_campaign` checked eligibility ONLY on the `group_id IS NOT NULL` branch.** For an
>    ordinary campaign it fell through to the INSERT with no status and no role check, and being
>    `SECURITY DEFINER` it bypassed the `campaign_applications` INSERT policy that carries exactly
>    those rules via `can_create_application`. Proven: a creator with no invitation applied to an
>    **`active`** campaign. The non-group branch now calls `can_create_application` itself — the
>    same predicate as the policy, not a re-invented one — OR-ed with "an existing non-`rejected`
>    application", because the RPC is an upsert and that is how counter-offers amend a row the
>    creator already legitimately holds. `anon` EXECUTE revoked (it was already stopped by the
>    `auth.uid()` guard). Verified after: applying to a closed campaign now raises *"Not eligible
>    to apply to this campaign"*, applying to a published one still succeeds.
>
> **Lesson worth keeping: a `SECURITY DEFINER` RPC silently opts out of the RLS policy protecting
> the table it writes.** Whenever one exists, check that it re-asserts the policy's predicate —
> here the policy was correct the whole time and the RPC simply never consulted it.

| `application_counter_offers` | Negotiation counter-offers on applications. Written via the `create_counter_offer` SECURITY DEFINER RPC (authorization-hardened 2026-07-20: identity + participant + role-integrity guards, writes the server-derived `sender_id`/`sender_role`, `anon` EXECUTE revoked) or the direct-insert apply-time path; the INSERT RLS policy pins `sender_role` to the caller's derived role. See [[Service-Role Data Exposure]]. |
| `content_disputes` | Dispute record opened when a business rejects content after max revisions (`reject-content` inserts `collaboration_id`/`initiated_by`/`reason`, `status=open`) and resolved by `resolve-dispute` (`status=resolved`, `outcome ∈ refund/partial_payment/approved`). Participant-SELECT RLS (creator or campaign owner) + a service-role FOR-ALL policy. **Restored to prod 2026-07-23 (PR #325)** — it, and the whole collaboration state machine, were recorded in `schema_migrations` but MISSING from prod (see below). |

> **`campaigns.deadline` is a `date`, not a `timestamptz` — do not compare it as an instant.**
> Verified against prod `information_schema` 2026-08-09. Supabase therefore returns it as
> `"YYYY-MM-DD"`, and `new Date("2026-08-10")` parses to **UTC midnight** — an instant, in a
> timezone the user does not live in. Subtracting a mid-day `now` from a midnight instant floors
> **downward in every timezone**, so a "due today" check is unreachable for the whole day. In
> America/New_York (UTC−4/−5, where the company is) UTC midnight of day D is 8pm local on D−1, so
> *tomorrow's* deadline also reads as "today" until it vanishes at 8pm. Compare **local calendar
> days**: build the deadline from its parts (`new Date(y, m-1, d)`) and floor `now` with
> `setHours(0,0,0,0)`, then **round** the day difference rather than flooring — a calendar day is 23
> or 25 hours across a DST transition, and a floored 25-hour "tomorrow" reads as "today". Found by
> Codex after eight internal reviews missed it; see [[Donny-First Dashboard]].
> (`campaigns.created_at` / `completed_at` **are** `timestamptz`; only `deadline` is date-only.)

> **Collaboration state machine (`campaign_collaborations.content_status`) — restored 2026-07-23
> (PR #325, [[Content Delivery State Machine]]).** The `20260425000000_collaboration_state_machine`
> migration was recorded as applied but its objects were absent from prod (`recorded ≠ actual`):
> the `transition_content_status(p_collaboration_id, p_new_status, p_actor_id, p_reason)` RPC
> (SECURITY DEFINER, **service-role-only** — `REVOKE`d from `public/anon/authenticated` to close a
> cross-actor IDOR; `service_role` keeps its own direct grant), `content_disputes`, the
> `enforce_revision_limit` + `recompute_final_approval` triggers, `increment/decrement_budget_spent`
> + **`campaigns.budget_spent`**, and the expanded 9-value `content_status` CHECK
> (`pending/in_progress/submitted/revision_requested/approved/auto_approved/rejected/disputed/resolved`)
> were all re-created idempotently. **Auto-approval** (`auto-approve-content` cron) now times the
> review window off **`content_submitted_at`** (the `set_content_submitted_at` trigger-stamped anchor),
> NOT `submitted_at` (which the client submit paths never set) — and is finally scheduled
> (`pg_cron` job `auto-approve-content`, `*/15`). Verify object existence directly (`pg_proc` /
> `information_schema` / `pg_trigger`), not just `schema_migrations`.

> **Payout durable re-entrancy (`release-creator-payout`) — 2026-07-23, [[Payout Finalization & Re-entrancy]].**
> `campaign_collaborations` gained two nullable columns: **`payout_executed_at timestamptz`** and
> **`stripe_transfer_id text`** (migration `20260723160000`). `payout_executed_at` is the **durable
> re-entry marker — set the instant money moves (Stripe transfer OR pending-balance credit), so
> "marker set ⇒ money moved" holds by construction**; `release-creator-payout`'s early guard short-circuits
> any re-invocation with the marker set to finalize-only (no re-credit / re-transfer). The pending-balance
> path now credits + marks atomically in **`credit_pending_balance_for_payout(p_collaboration_id, p_user_id,
> p_amount)`** (migration `20260723170000`; SECURITY DEFINER, `search_path=public`, **service-role only** —
> REVOKE public/anon/authenticated + in-body `request.jwt.claims->>'role'='service_role'` guard; row-locks
> the collaboration `FOR UPDATE`, `RAISE`s if no `creator_profiles` row or if `p_user_id` ≠ the row's
> `creator_id`), **replacing the non-idempotent `increment_pending_balance`** on this path. A `*/15`
> reconciliation sweep in `auto-approve-content` re-drives finalize-only for marked-but-unfinalized rows
> (5-min min-age guard).

> **Durable pending-balance flush ledger (`pending_balance_flushes`) — 2026-07-24, [[Payout Finalization &
> Re-entrancy]] (stage 1 of the wallet-first fix).** New table **`pending_balance_flushes`** (migration
> `20260723180000`) makes the shared wallet→Stripe flush (`_shared/flush-pending-balance.ts`)
> **exactly-once**: one row per flush, whose id **is** the Stripe idempotency key `flush_${id}` — replacing
> the colliding `withdraw_${user}_${cents}` key that under-paid two identical-cents flushes. Columns: `id`,
> `user_id` (FK `auth.users` ON DELETE CASCADE), `profile_type` (`creator`/`business`), `stripe_account_id`,
> `amount_cents`, `source` (`manual`/`autoflush`), `status` (`claimed`/`succeeded`/`failed`/`stuck`),
> `stripe_transfer_id`, `attempts`, `last_error`, `created_at`/`updated_at`. Partial index
> `idx_pbf_claimed_created ON (created_at) WHERE status='claimed'` (the only rows the reconcile scan reads).
> RLS: internal-`SELECT` (`is_internal_user()`) + service-role `FOR ALL`; **no client write path** — all
> writes go through four SECURITY DEFINER, `search_path=public`, **service-role-only** RPCs (in-body
> `request.jwt.claims->>'role'='service_role'` guard + REVOKE public/anon/authenticated + GRANT service_role,
> same lockdown as `credit_pending_balance_for_payout`): **`claim_pending_balance_flush`** (row-locks the
> profile `FOR UPDATE`, verifies `round(pending_balance*100)=cents`, zeroes the balance, inserts a `claimed`
> row → its id; NULL on mismatch/no-row ⇒ caller throws `BALANCE_CHANGED`), **`confirm_pending_balance_flush`**
> (`claimed→succeeded` + records the transfer id; **`RETURNS boolean`** = did *this* call transition the row,
> so an overlapping reconcile whose `confirm` is a no-op skips the duplicate ledger write — migration
> `20260723200000`), **`fail_pending_balance_flush`** (`claimed→failed`; if
> restore, adds back exactly `amount_cents::numeric/100` — the `::numeric` cast avoids an integer floor to 0),
> **`bump_flush_attempt`** (increments `attempts`; flips `claimed→stuck` at the cap; returns `'stuck'` on
> **exactly** the transition, giving file-once alerting). Re-driven by the new **`reconcile-pending-flushes`**
> edge fn on a `*/15` pg_cron (migration `20260723190000`; `verify_jwt=false` + `isAuthorizedIngest`, Vault
> `reconcile_pending_flushes_url` URL + shared `aios_ingest_key` bearer — mirrors `auto-approve-content`),
> which scans `claimed` rows >5 min old through the shared `executeFlushTransfer`. Stage 2 (the
> `release-creator-payout` onboarded-path reroute) is deferred.

## Creator Groups (Crews)

A business's standing private roster of creators; a campaign scoped to a crew is visible only to its
active members, who one-tap apply with no payment (free `fixed_price=0`). See
`docs/wiki/concepts/creator-groups.md`. All `user_id`/`owner_id`/`creator_id` reference `profiles(id)`
(consumer feature). Crews are anchored on the **business user** (`owner_id = auth.uid()`), mirroring
`brand_shortlists`.

| Table | Purpose |
|-|-|
| `creator_groups` | A crew: `owner_id` (business user), `name`, `description`. Owner-manage RLS + active-member SELECT |
| `creator_group_members` | Membership with invite→accept lifecycle `status ∈ invited/active/declined/removed` (mirrors `org_members.invitation_status`), `invited_by`, `UNIQUE(group_id, creator_id)`. Owner manages; creator reads/updates own rows (accept/decline only via RPC) |
| `crew_activity` | **Phase 2** per-crew lifecycle event log (`group_id`, `campaign_id`, `actor_id`, `participant_id`, `event_type` ∈ 7 events, `visibility` ∈ `business`/`crew`, `metadata`). **SELECT-only for clients**; all writes via the `record_crew_activity` RPC. Asymmetric RLS: owner sees all (`is_creator_group_owner`); creator sees `(visibility='crew' AND is_active_group_member) OR participant_id = auth.uid()` |

> **`campaigns.group_id`** — `uuid REFERENCES creator_groups(id) ON DELETE RESTRICT` (RESTRICT, never
> SET NULL — SET NULL would flip a private campaign public). Non-null ⇒ a private crew campaign; every
> public path is gated on `group_id IS NULL`, so existing rows (all NULL) are byte-unchanged.
>
> **Functions (SECURITY DEFINER, `search_path=public`, mirror `has_collaboration_on_campaign`):**
> `is_active_group_member(group_id, creator_id)` — **stays anon-executable** (used in the
> anon-reachable `campaigns` SELECT policy); `is_creator_group_owner(group_id, user_id)`,
> `respond_to_group_invitation(group_id, accept)` (creator-only accept/decline), and
> `get_creator_pending_group_invitations()` (an invited creator reads their own pending invites WITH
> crew+business name; gated on `creator_id = auth.uid()`) — all **revoked from anon**. Trigger
> `enforce_campaign_group_ownership` (`BEFORE INSERT OR UPDATE OF group_id`) forbids targeting a crew
> the campaign owner doesn't own. Single-winner uses the existing `enforce_single_slot_campaign`, which
> reads `(ai_analysis->>'creator_count')` — there is **no top-level `campaigns.creator_count` column**.
>
> **More DB-enforced crew invariants:** `campaigns_group_free` CHECK (`group_id IS NULL OR
> COALESCE(fixed_price,0)=0` — crew campaigns are always free); `reject_group_campaign_invitation`
> (`BEFORE INSERT` on `campaign_invitations` — no invite for a crew campaign; members-only);
> `forbid_application_campaign_change` (`BEFORE UPDATE` on `campaign_applications` — `campaign_id` can't
> change, closing a raw-UPDATE injection); `cgm_owner_insert`/`cgm_owner_update` RLS restrict owner
> writes to `invited`/`removed` (activation is creator-only via `respond_to_group_invitation`). The
> generic `send-campaign-publish-notifications` edge fn early-returns for group campaigns (a private
> crew campaign is never broadcast platform-wide).
>
> **Phase 2 — crew activity + team notifications.** `record_crew_activity(p_campaign_id, p_event_type,
> p_collaboration_id?)` (SECURITY DEFINER, `search_path=public`, revoked from anon → `authenticated`)
> is the **only** writer of `crew_activity`: a per-event authz matrix on `auth.uid()`, server-derived
> `participant_id`/`visibility`/metadata, no-op (NULL) off the crew path. Idempotency is server-side —
> a **cycle anchor** `campaign_collaborations.content_submitted_at` (nullable; stamped by trigger
> `trg_set_content_submitted_at` **only on the transition into `content_status='submitted'`**, because
> `updated_at` moves on *any* write and so cannot mark a state transition — originally because the
> table's `handle_updated_at` trigger was a no-op stub, and still true now that it is restored)
> suppresses a
> replayed `content_submitted` while allowing a resubmit-after-revision; **one-shot** dedup covers
> `campaign_posted`/`application_received`/`hired`/`completed`; a `pg_advisory_xact_lock` on
> `(campaign, event, participant)` makes each check-and-insert **atomic**. `completed` additionally
> requires `status='completed'`. The one emailed event is `content_submitted → owner`, pinned to
> category **`campaigns`** (so the high-signal email sends by default) via the `crew_content_submitted`
> template. See [[Creator Groups (Crews)]].

## Payments & Promotions

| Table | Purpose |
|-|-|
| `promotions` | Promotional offers or deals |
| `promotion_submissions` | Creator submissions for promotions |
| `discount_codes` | Discount/promo codes |

> **Stripe:** Payments via Stripe Connect (currently in **test mode**). Logic lives in `src/integrations/`. Never switch to live keys without explicit confirmation.

## Messaging & Realtime

| Table | Purpose |
|-|-|
| `conversations` | Conversation threads |
| `conversation_participants` | Users in each conversation |
| `messages` | Individual messages |
| `messages_with_profiles` | View joining messages with sender profile data |
| `message_reactions` | Emoji reactions on messages |
| `user_presence` | Online/offline status (realtime) |
| `push_notifications` | Push notification records. Written **only** by the service role, via `create-notification` — which until 2026-08-08 performed **zero authorization** (see below). |
| `notification_preferences` | Per-user notification settings |

> **`can_notify_user(p_actor, p_recipient)` — migration `20260808030000`, applied to prod
> 2026-08-08.** `create-notification` inserts `push_notifications` with the **service role**, so RLS
> never applied to it — and the function authenticated its caller with `auth.getUser()` and then
> **never referenced the `user` object again**. Every field written, `recipientId` and `actorId`
> included, came from the request body, and for types in `NOTIFICATION_TYPE_TO_EMAIL_TYPE` it also
> sent a real email. Any authenticated user could put arbitrary text and an arbitrary in-app link
> into **any** other user's feed, attributed to **any** actor.
>
> `can_notify_user` is `SECURITY DEFINER`, `language sql stable`, `search_path=public`, **service-role
> only** (`revoke execute … from public, anon, authenticated`; `grant … to service_role`). It returns
> true when actor and recipient share one of six **live** relationships: self, campaign (owner ↔
> applicant/collaborator/invitee, either direction), conversation (`left_at IS NULL` on both sides),
> crew, org (`invitation_status='active'` on both sides), or **sponsorship**.
>
> **The sponsorship clause carries a trap worth reading before editing it:**
> `campaign_sponsorships.brand_id` / `.restaurant_id` are FKs to **`business_profiles.id`, NOT
> `auth.users`** — they must be resolved through `business_profiles.user_id`, which is what the call
> sites actually notify. Comparing the raw columns to a user id never matches, and fails *silently*
> as a 403 nobody can explain.
>
> The clause set is not guessed. It was **backtested** against all 91 actor-bearing
> `push_notifications` rows (18 types, May–Aug 2026) → 89/91, **and** cross-checked by enumerating
> all 32 client call sites — which is the only reason sponsorship is in the list, since no
> sponsorship notification has ever fired on prod. The 2 backtest misses are `content_liked`, which
> the edge function authorizes against the **referenced `dragonshare_posts` row** instead (a liker
> legitimately has no prior tie to the poster) and for which the server composes the copy.
>
> Cold contact from a public profile needs **no** exemption: `ContactCreatorModal` /
> `ContactRestaurantModal` both `await` conversation creation *before* notifying, so the
> `conversation_participants` rows already exist. There is deliberately **no "open type" branch** —
> but that rests on an **ordering dependency**, so if the sequencing is ever inverted, cold contact
> starts silently 403ing and this is where to look.

## File Management

| Table | Purpose |
|-|-|
| `file_uploads` | Uploaded files (content deliverables, assets) |
| `file_versions` | Version history for uploaded files |
| `file_permissions` | Access control on files |
| `file_comments` | Comments on files |
| `file_tags` | Tag definitions |
| `file_tag_assignments` | Tags assigned to files |

## Reviews & Analytics

| Table | Purpose |
|-|-|
| `project_reviews` | Reviews of completed collaborations |
| `review_responses` | Responses to reviews |
| `beta_feedback` | Beta user feedback submissions |
| `analytics_events` | Custom event tracking |
| `pricing_funnel_events` | Pricing page conversion funnel tracking |

## Campaign Extensions

| Table | Purpose |
|-|-|
| `campaign_brief_generations` | AI-generated campaign briefs |
| `campaign_media` | Media assets attached to campaigns |
| `campaign_social_hooks` | Social media hooks for campaigns |
| `campaign_deliverables` | Deliverable specifications and tracking |
| `campaign_templates` | Reusable campaign templates |

## Donny AI

| Table | Purpose |
|-|-|
| `donny_actions` | Tracked Donny AI actions and their outcomes |
| `donny_campaign_previews` | Donny AI campaign preview data |
| `donny_conversations` | Donny AI conversation threads |
| `donny_messages` | Individual messages in Donny conversations. `rich_card` (jsonb, singular) + `rich_cards` (jsonb, nullable — a LIST of cards, e.g. the web-chat `find_creators` avatar cards; additive, internal Donny leaves it null) |
| `donny_draft_publications` | Append-only marker — a Donny social draft card (`draft_id`) was published by `user_id` at `published_at`. See the note below. |
| `donny_help_logs` | Help requests and resolutions via Donny |
| `donny_knowledge` | Donny's knowledge base entries (RAG) |
| `donny_nudges` | Proactive nudge definitions and delivery tracking |
| `donny_tool_executions` | Tool call logs from Donny. Columns are `message_id` · `user_id` · `tool_name` · `input` · `output` · `status` (`pending`/`success`/`error`) — **not** `tool_input`/`tool_output`/`is_error`; writing those names is how `donny-orchestrator` silently logged nothing for its entire life. `message_id` is **nullable** (2026-07-18): a streaming caller has no assistant-message id at log time because the client persists the message. Read by `bug-sweep-agent` (`status=eq.error`) — note an empty table is indistinguishable from "no errors". See [[Reading Agent Traces]]. |
| `donny_oauth_clients` | OAuth client registrations for Donny API |
| `donny_oauth_codes` | OAuth authorization codes |
| `donny_oauth_tokens` | OAuth access/refresh tokens |
| `donny_scheduled_posts` | Cross-platform posting schedule (auto cross-scheduling). Per-platform caption/media/hashtags, `scheduled_at`, status lifecycle, and `ai_suggested_time`/`ai_reasoning` for Donny-proposed slots. |
| `donny_cost_ledger` | Per-call **runtime** AI-spend ledger (Donny/Dezzy generation + RAG embeddings) — the source of truth for the ≤15%-of-revenue AI kill-switch (NOT the total Anthropic/OpenAI invoice, which is mostly founder dev spend/opex). Written only by `_shared/cost-ledger.ts`. `user_id` is **nullable** (system/anonymous calls log `NULL`; the FK to `auth.users` is kept); `tier` ∈ `T0`–`T3`, `'embedding'`, or `'web_search'`/`'web_extract'` (Donny web tools — the ledger rows double as the daily web-search rate counter; see `docs/wiki/concepts/donny-web-access.md`). Summed MTD by the `aios_cost_stats()` RPC (see `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`). |

> **`donny_draft_publications` — the once-only guard on Donny's social draft card.** Migration
> `20260809193254`, applied and verified on prod 2026-08-09. Columns: `draft_id uuid`, `user_id uuid
> REFERENCES auth.users(id) ON DELETE CASCADE`, `published_at timestamptz default now()`, primary key
> **`(user_id, draft_id)`**.
>
> **Why it exists:** Donny proposes a post as a rich card and the owner taps to publish. That card is
> persisted verbatim into `donny_messages.rich_cards` and re-rendered on every conversation load, so
> "already sent" could not live in component state — reopening the conversation re-armed the button on
> a draft already live on a public feed, and a second tap posted a duplicate.
>
> **Why not an UPDATE policy on `donny_messages`:** that table has exactly two policies (SELECT own,
> INSERT own) and **no UPDATE for any surface** — verified against `pg_policies` on prod. Adding one so
> the client could rewrite `rich_cards` would hand every user write access to the stored text of what
> Donny said, to fix a UI-state problem. And RLS `WITH CHECK` sees only the NEW row, so "only
> `rich_cards` may change" is **not expressible as a policy** — it would need column GRANTs on top
> (the same lesson as `campaign_invitations`, `20260808010000`). A separate append-only marker is
> smaller, enforced by a primary key rather than policy gymnastics, and leaves `donny_messages`
> byte-unchanged.
>
> **The PK is composite on purpose.** `draft_id` alone would let anyone who learned another user's
> draft id squat the row, making the real owner's marker insert fail *after* their post had gone out.
> A draft belongs to exactly one user, so per-user is the correct grain.
>
> **RLS:** own-row SELECT + own-row INSERT, `TO authenticated`. **Deliberately no UPDATE or DELETE
> policy** — a publication is a fact about something that already happened in public, and un-marking it
> re-arms the button on a live post. Account deletion is unaffected: the FK cascade operates
> independently of GRANTs and RLS. Grants are locked down table-level (`revoke all … from public, anon,
> authenticated`, then `grant select, insert … to authenticated`) — a *column*-level revoke is a
> documented no-op against Supabase's ambient table-wide grant.
>
> **Verified red→green on prod, every write rolled back:** grants are exactly `authenticated:
> INSERT,SELECT` (no `anon`, no `PUBLIC`); a cross-user INSERT raises **42501**; an own INSERT succeeds
> and sees its own rows; DELETE raises **42501** (no grant); a duplicate raises **23505**, which
> `useRecordDraftPublication` treats as success — the key firing means the draft was already recorded,
> which is the state the write was trying to reach.
>
> **Ordering is the invariant:** the marker is written **after** the publish succeeds, so "row exists ⇒
> it went out" (the same rule as `campaign_collaborations.payout_executed_at`). A pre-claim would leave
> a draft marked published that never posted — permanently un-postable, with nothing on the feed to
> explain why. See [[Donny Social Tools]].

> **Strategy library (`internal_docs`)** — the AIOS strategy/wiki docs surfaced at `/internal/strategy`;
> a projection of git files synced by `donny-knowledge-sync` and the source of Donny's internal RAG
> (`donny_knowledge`, scope `internal`) + Dezzy's `get_internal_doc`. Columns: `path` (unique key),
> `title`, `content_md`, `tags`, `source_hash` (sha256 of `content_md`, for exact-dup detection), plus
> **`is_core`** (Core-File protection — seeded true on non-`docs/wiki/%` paths; a `BEFORE INSERT`
> trigger keeps future top-level docs protected) and the reversible-archive triple `archived_at` /
> `archived_by` / `archive_reason`. Internal-only `SELECT` RLS; all mutations via SECURITY DEFINER
> RPCs: `internal_doc_archive(path,reason)` / `internal_doc_unarchive(path)` (admin-gated — archive
> refuses a core doc + deletes the `donny_knowledge` row, and the archive-aware sync keeps it out of
> the RAG) and `dedup_candidate_pairs(threshold)` / `internal_doc_exact_dupes()` (service-role,
> audit-only, consumed by the monthly `strategy-library-audit-agent`).

## DragonShare

| Table | Purpose |
|-|-|
| `dragonshare_boosts` | Boost payments from restaurants to creators (Stripe Connect, 80/20 split) |
| `dragonshare_engagement` | Engagement tracking on shared content (schema only, not populated) |
| `dragonshare_events` | DragonShare lifecycle events (data flywheel for future AI training) |
| `dragonshare_payouts` | Creator payouts from DragonShare boosts |
| `dragonshare_posts` | Creator-submitted content posts. `post_url`/`platform` nullable (direct uploads). `content_file_path` for uploaded content. `flagged_at`/`flagged_by` for report mechanism. Default status: `verified` (trust-then-flag model) |

## Dragon Rewards (DRE)

Dragon Rewards Engine v1 — see `docs/wiki/concepts/dragon-rewards-engine.md`. All `user_id` FK
`profiles(id)` (consumer feature). Written only by the service-role `dre-award-engine` edge fn;
clients read their own rows (`auth.uid() = user_id`).

| Table | Purpose |
|-|-|
| `dre_config` | Admin-tunable JSONB config — `point_values`, `tier_thresholds`, `go_live_at` (retune without a deploy). Authenticated-read, `has_role('admin')`-write |
| `dragon_point_events` | Append-only Dragon Points ledger. `UNIQUE (user_id, event_type, source_id)` = idempotency key. `multiplier_applied` reserved (always `1.0` in v1) for Phase-3 boosts |
| `dragon_point_balances` | Materialized cache, recomputed from the ledger (sum). Holds `balance`, `tier`, `last_activity_at`; `streak_*`/`total_redeemed` reserved for Phases 3/5 |

> RPCs (SECURITY DEFINER, `service_role`-only): `dre_pending_events()` (anti-join — source rows
> lacking a ledger row) and `dre_user_aggregates(uuid[])` (balance + completed-campaign count +
> avg rating for tier resolution).
>
> **`dre_my_standing()`** (migration `20260807120000`, [[Dragon Rewards Engine (DRE)]] — DC
> Points visibility) — a **caller-scoped** SECURITY DEFINER RPC wrapping `dre_user_aggregates`,
> for the `/rewards` page and Donny's `rewards_agent`. Takes **no arguments**; identity comes
> only from `auth.uid()`, and it `raise`s `forbidden: authentication required` if that's null —
> so there is no parameter an id could ever be pointed at. `revoke ... from public, anon` +
> `grant ... to authenticated` (the Supabase default-privilege gotcha above — a bare `revoke
> from public` does not lock down a definer function). Applied + verified on prod: impersonated
> creator returns exactly 1 own row; empty `auth.uid()` raises the forbidden exception.

## Payments & Revenue

| Table | Purpose |
|-|-|
| `payment_events` | Payment lifecycle events (ledger) |
| `stripe_webhook_events` | Raw Stripe webhook event log |
| `rush_surcharge_log` | DragonDash rush surcharge records |

## Organizations

| Table | Purpose |
|-|-|
| `organizations` | Parent organization entities |
| `org_units` | Organizational units (locations/divisions) |
| `org_members` | Organization membership records |

> **`org_units` also carries the identity/tax/address verification columns** documented under User &
> Auth above (`identity_verified_at`, `tax_id_provided`, `stripe_requirements_due`,
> `stripe_disabled_reason`, `address_verified_at`) — [[Identity & Address Verification]]. The org
> roster UI reads `profiles.email` via **`get_org_members_roster(p_org_id)`** (SECURITY DEFINER,
> caller must be an ACTIVE `org_members` row for that org), not a direct client SELECT, since
> `20260824140000` makes `profiles.email` unreachable from the base table for `authenticated`.

## Account Management

| Table | Purpose |
|-|-|
| `account_deletion_requests` | User account deletion requests (GDPR) |

## Marketing & Leads

| Table | Purpose |
|-|-|
| `leads` | Public landing-page lead capture (the "Contact" form). **Private** — internal-team read/update RLS via `is_internal_user()`, and **no anon/authenticated INSERT or SELECT policy** (holds contact PII). Rows are inserted by the `capture-lead` edge function with the service-role key (bypasses RLS); the edge fn enforces a honeypot + a fail-open per-IP throttle and Resend-notifies the team. `audience` ∈ business/brand/creator/other; `status` new→contacted→qualified→…; `metadata jsonb` (user_agent, ip). |

## Synthetic Weight Engine

Safety spine for synthetic ("bot") users minted on prod (Phase 0). Kill switch
`SYNTHETIC_BOTS_ENABLED` (feature_flags, default off, fail-closed). Every synthetic row is tagged
and excluded from founder metrics + the data-flywheel moat via a two-sided **actor-OR-parent**
predicate. See `docs/wiki/concepts/synthetic-weight-engine.md`.

| Table | Purpose |
|-|-|
| `synthetic_users` | Registry of bot accounts (`user_id` PK → `auth.users` ON DELETE CASCADE, `cohort`, `persona`). Auto-filled by the extended `handle_new_user` trigger when a `bot…@synthetic.dragoncandy.test` account signs up (email is the source of truth). RLS: internal-`SELECT` only, no client write policy (writes via service_role / SECURITY DEFINER). |
| `sim_load_snapshots` | Per-run load metrics (`active_connections`/`max_connections`/`reserved_headroom`/`avg_query_ms`/`error_rate`, `run_label`, `notes` jsonb) for the load-ramp / tier-scaling proof. Written **only** by the service-role `capture_sim_load_snapshot` RPC (Phase A), sampled **concurrently with the in-flight load wave** (a post-drain snapshot would see only the RPC's own connection). Internal-`SELECT` RLS; read by `/internal/simulation`'s load-curve table (`useSimLoadSnapshots`). |

> **Phase A load/economics RPCs** (migration `20260724170000`, both SECURITY DEFINER · `search_path=public`
> · revoked from public/anon/authenticated · granted `service_role` only): `seed_synthetic_cohort(p_n,
> p_cohort, p_creator_split)` → `{seeded,skipped}` bulk-inserts the **depth pool** (`botseed_<cohort>_<i>`
> — never authenticates; deterministic id via `extensions.uuid_generate_v5` + `on conflict do nothing`;
> relies on the `handle_new_user` trigger to tag `synthetic_users`; role only `content_creator`/`business_client`);
> `capture_sim_load_snapshot(p_run_label, p_error_rate, p_notes)` → one `sim_load_snapshots` row (reads
> `pg_stat_activity` + cross-schema `pg_stat_statements` via `to_regclass`, degrading `avg_query_ms` to NULL
> if absent). The `load` driver reads only session-capable bots (live `bot0##` + active `botla*`), never the
> depth pool. See `docs/wiki/concepts/synthetic-weight-engine.md` (Phase A).

> **Runner-matrix (Slice 1) RPCs** (migrations `20260724181500`/`182000`/`183000`, all SECURITY DEFINER
> · `search_path=public`): `seed_synthetic_content(p_campaigns,p_posts,p_creator_split)` (service_role
> only) — layers public-free **draft** campaigns + DragonShare video posts + `file_uploads` + one
> synthetic org + avatars/geo onto the `botla%`/`botseed_%` load cohort (NEVER the live `bot0##` 25);
> guard-raises if no load-cohort business bot exists. `purge_synthetic_load_cohort()` (service_role only)
> — the **scoped** teardown for the matrix: deletes ONLY `botla%`/`botseed_%` (spares the live 25),
> leaf-deleting the NO-ACTION `push_notifications.actor_id` + crew tables + telemetry before cascading
> the users, then the non-cascading synthetic org; returns a `residual_*` report. `get_sim_load_matrix_summary(p_run_label)`
> — **granted `authenticated`** (revoked anon/public) with an in-body `is_internal_user()` guard (DEFINER
> bypasses the `sim_load_snapshots` RLS), rolls a multi-shard run's per-shard **latest-`captured_at`**
> snapshots into one summed row (Σ concurrency/requests/`media_*`, MAX p95 + DB peaks, latest
> `platform_weight.storage_bytes`) for the `/internal/simulation` "Matrix run (summed)" card. `sim_load_snapshots.notes`
> gains `shard`/`media_requests`/`media_bytes` keys in matrix mode. **Slice 2** (migration `20260725140000`,
> **applied to prod 2026-07-26**, recorded under version `20260726024318`) `create or replace`s this RPC to add an overlap-honest event-sweep
> `honest_peak_concurrency` + `max_concurrent_shards` + `media_errors` + `media_ms_p95_peak` alongside the
> existing naive Σ `offered_concurrency`, so staggered/queued shards can't inflate the reported peak. See
> `docs/wiki/concepts/synthetic-weight-engine.md` (Slice 2).

> **Denormalized `is_synthetic boolean default false`** added (nullable) to 5 rootless/telemetry
> tables — `payment_events`, `analytics_events`, `dragonshare_events`, `pricing_funnel_events`,
> `donny_cost_ledger` — stamped by `BEFORE INSERT` triggers (payment = actor-OR-campaign; dragonshare
> = actor-OR-org-owner; the rest single-party by `user_id`). This is the column a future training
> export keys on. `platform_weight` also gained `users_total_real` + `row_counts_real` (synthetic-
> excluded parallel counts; the physical totals stay synthetic-inclusive by design — real disk/rows
> drive scaling decisions, so `/internal/weight` shows totals with a "real" subcount).
>
> **Functions (SECURITY DEFINER, `search_path=public`):** `is_synthetic(uuid)` /
> `is_synthetic_campaign(uuid)` / `is_synthetic_org(uuid)` (exists-in-registry / campaign-owner /
> org-owner) — **service_role only** (revoked from public/anon/authenticated). `get_simulation_stats()`
> — the ONE surface that intentionally SHOWS synthetic (internal-gated, authenticated+service_role;
> aggregate counts only). `purge_synthetic_data()` — service_role-only leaf-first teardown (deletes
> rootless ledgers before `auth.users`; explicitly deletes the non-cascading synthetic org rows —
> `organizations`/`org_units` have no `auth.users` FK, ownership only via `org_members.role='owner'`;
> **also leaf-deletes the NO-ACTION `push_notifications.actor_id`** the matrix notify-leg creates — Task 3.3).
> `aios_platform_stats`/`aios_revenue_stats`/`aios_cost_stats` + `capture_platform_weight` were
> rewritten to exclude synthetic (actor-OR-parent). The extended `handle_new_user` **preserves** the
> `account_scope='internal'` guard + `ON CONFLICT DO UPDATE` refresh (a corrective migration restored
> these after the initial spine migration reverted them — caught by the Codex second review).

## Social & Outstand Integration

| Table | Purpose |
|-|-|
| `business_outstand_accounts` | Outstand.so account links for businesses |
| `business_contexts` | Business context data for AI matching |
| `creator_automation_preferences` | Creator automation and posting preferences |
| `delegated_posting_permissions` | Permissions for delegated social posting |
| `social_post_log` | Log of social media posts — the enumeration surface `content-performance-capture` measures from. `UNIQUE (outstand_post_id, platform)` + nullable dimension columns (`hashtags`, `caption`, `format`, `scheduled_at`, `published_at`, `creator_id`). **Only rows carrying `verified_at` are measured**, and only server-side code sets it. Has SELECT + INSERT RLS policies and **no UPDATE policy** — so a client upsert must use `ignoreDuplicates` (`ON CONFLICT DO NOTHING`); a `DO UPDATE` branch would need a privilege the client role has never been granted. See [[Social Measurement Spine]]. |
| `outstand_post_ownership` | **Server-established** binding: Outstand post id → the authenticated user who created it. Written ONLY by `outstand-proxy` / `social-proxy` (service role) on a 2xx `POST /posts`, from `ctx.userId` (`auth.getUser()`) and the **provider's own** response id — neither half client-assertable. Read by `outstand-webhook` + `reconcile-social-posts` to decide `social_post_log.user_id`. See the blockquote below. |
| `triple_post_sessions` | Multi-platform posting session tracking |
| `brand_shortlists` | Brand-curated creator shortlists |

> **Server-established post ownership (`outstand_post_ownership`) — 2026-08-06, migration
> `20260806184500`, [[Social Measurement Spine]].** Both `outstand-webhook` and the new
> `reconcile-social-posts` sweep used to decide **who owns a published post** by joining
> `donny_scheduled_posts` on `metadata->>'outstand_post_id'`. **That column is client-writable.**
> Verified on prod, not assumed: `information_schema.column_privileges` shows `authenticated` **and
> `anon`** holding INSERT *and* UPDATE on **every** column of `donny_scheduled_posts` (`metadata`
> included — there is no column-privilege lockdown migration for that table), and `pg_policies` shows
> the INSERT policy as `WITH CHECK (user_id = auth.uid())` with **nothing constraining `metadata`**.
> So any authenticated user could plant a row claiming any post id, have `verified_at` stamped on it,
> and let `content-performance-capture` spend the **org-wide** `OUTSTAND_API_KEY` filing another
> tenant's metrics under their own row — mis-filing the victim's measurement at the same moment.
> Provider ids are 5 characters and low-entropy, so guessing beats knowing.
>
> Columns: `outstand_post_id text PRIMARY KEY` (text, not uuid — real ids are 5-char opaque strings),
> `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `created_at`. Index
> `idx_outstand_post_ownership_user_id` exists only for the reverse direction (forgery investigation),
> not either consumer's hot path.
>
> **Lockdown — `revoke all on public.outstand_post_ownership from public, anon, authenticated` +
> `grant all to service_role`, at TABLE level.** A *column-level* REVOKE is a **documented no-op**
> against Supabase's ambient table-wide GRANT (the same lesson `20260804174854` and `20260805163247`
> record). Nothing in `src/` reads or writes this table, so the client grant set is **empty**, not
> merely reduced. RLS is enabled with a `service_role`-only policy and **deliberately no policy for
> anon/authenticated**, so client statements are denied by grants *and* by RLS-with-no-policy even if
> a future migration re-grants. The migration ends with an `information_schema.role_table_grants`
> verification query — expected result is exactly one row (`service_role`); any `anon`/`authenticated`
> row means the REVOKE did not take. **Verify after applying; never trust "the migration succeeded."**
>
> Consumers are asymmetric by design: `reconcile-social-posts` is **strict** (no binding → counter
> `unbound`, skip — it is new, so this costs nothing), `outstand-webhook` is **permissive** (retains
> the schedule-row match for the legacy population, counted `ownership=legacy_schedule` so that
> population is measurable rather than assumed). A binding that cannot be **read** refuses rather than
> falling back, tolerating only the table-not-yet-existing case — which surfaces as PostgREST
> **`PGRST205`**, *not* SQLSTATE `42P01`, because PostgREST resolves tables from its own schema cache
> and 404s before the query reaches Postgres. Binding/schedule-row disagreement is rejected **per row,
> not per post** (per-post would let a planted row take the victim's real row down with it).
>
> **`donny_scheduled_posts_platform_check` widened** (migration `20260806090000`, applied 2026-08-06):
> adds `'x'` while **keeping** `'twitter'`. The two tables' platform vocabularies were disjoint on
> exactly that value — `business_outstand_accounts` allows `x`, `donny_scheduled_posts` allowed
> `twitter` — and Outstand's own network value is `x`, so `donny_scheduled_posts` was the outlier.
> `twitter` is retained for existing rows (removing a CHECK value is forbidden); `x` is canonical going
> forward.

## Help & Support

| Table | Purpose |
|-|-|
| `help_articles` | Help center articles |
| `help_article_feedback` | User feedback on help articles |

## Views

| View | Purpose |
|-|-|
| `messages_with_profiles` | Messages joined with sender profile data |
| `message_participant_profiles` | Conversation participants with profiles |
| `public_business_profiles` | Public-facing business profile data |
| `public_creator_profiles` | Public-facing creator profile data |
| `public_organizations` | Public-facing organization data |
| `safe_profiles` | Sanitized profile view (no sensitive fields) |
| `public_dragon_tiers` | Public Dragon-tier exposure — `user_id, tier` ONLY (never `balance`), granted to anon; lets the tier badge render on public profiles under the own-row `dragon_point_balances` RLS |
