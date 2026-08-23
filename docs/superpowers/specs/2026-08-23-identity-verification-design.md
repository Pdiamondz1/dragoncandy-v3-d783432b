# Identity & Verification — Design (slice 2 of 4)

> Slice 2 of the DragonCandy signup/onboarding redesign. Slice 1 shipped the account
> completeness engine (`docs/superpowers/specs/2026-08-23-account-completeness-engine-design.md`,
> PR #472). This slice fills that engine with real verification signals.
> **Date:** 2026-08-23

---

## 1. Why this slice exists

The founder's stated driver, verbatim: *"We need real verification of restaurants and
creators to collect real valuable data, prevent fraud and illegal activities, and
establish trust on the platform."* And on the mechanism: *"Stripe Connect is the spine
but we need to have those signals on the DragonCandy platform as well. That way its
proven on the app and matched with Stripe."*

Slice 1 built the frame that displays and gates on readiness. Today that frame is
mostly furnished with things that are not verification at all — a display name, an
avatar. This slice supplies the three signals that actually establish who someone is.

---

## 2. The governing rule

**A verification signal is a timestamp, written only by a server that proved
something.**

Not a boolean. A boolean can be set by anything optimistic, and the reader cannot tell
a proof from a guess. A timestamp records that a specific event happened at a specific
moment, and the natural question "who wrote this?" has exactly one acceptable answer:
a server that had evidence.

This is the same rule already load-bearing elsewhere in the schema —
`campaign_collaborations.payout_executed_at` ("marker set ⇒ money moved"),
`content_submitted_at`, `donny_draft_publications.published_at`. It is restated here
because slice 2 is where it starts guarding something an attacker wants.

**Corollary, and the reason §4 exists: the rule is a lie unless the client cannot write
the column.**

---

## 3. Scope

**In:**

1. Phone verification by SMS one-time code (Twilio Verify).
2. Identity and tax signals mirrored from Stripe Connect — **signals only, never
   numbers**.
3. Address captured and confirmed by successful geocode, for business locations **and**
   creators.
4. Three new requirement keys wired into the slice-1 engine.

**Out, deliberately:**

- Storing tax identification numbers. See §5.1.
- Cross-checking our address against Stripe's. Adds a reconciliation surface and a class
  of "these disagree" states with no decision attached to them yet.
- Any aggregate "verification score" or trust badge. A score invites a threshold, and no
  threshold has a decision behind it today.
- Document upload / ID photo review. Stripe already does this for Connect accounts and
  we would be duplicating a regulated process.
- Phone as a **login** method. Phone is a profile attribute here. Making it an auth
  factor changes the auth system, which `CLAUDE.md` forbids without explicit
  confirmation, and is not needed for any driver.

---

## 4. The hole this slice must close first

**`authenticated` currently holds `UPDATE` and `INSERT` on
`public.profiles.phone_verified_at`.** Verified against prod on 2026-08-23 via
`information_schema.column_privileges`.

So today any signed-in user can `update profiles set phone_verified_at = now()` on their
own row and appear phone-verified having never received an SMS. It is **inert right
now** — nothing consequential reads the column, and `READINESS_GATE_ENABLED` does not
exist in `feature_flags`, so the gate renders children unconditionally — but this slice
is precisely what makes it consequential. **Shipping phone verification without closing
this ships the appearance of verification, not verification.**

**The remedy, and why the obvious version does not work.** A *column-level* `REVOKE` is
a documented no-op against Supabase's ambient table-wide `GRANT` — this repo has learned
it twice already (`20260804174854`, `20260805163247`) and encoded it in
`DATABASE_SCHEMA.md`. The working pattern is the one `20260808010000` used for
`campaign_invitations`:

```sql
revoke update on public.profiles from authenticated, anon;
grant update (<explicit list of every legitimately client-writable column>)
  on public.profiles to authenticated;
```

Two consequences the implementation must respect:

- **The column list must be enumerated from the live table, not guessed.** Omitting a
  column the app legitimately writes breaks a working flow silently, and `profiles` is
  written from many places. The migration derives the list from `information_schema` and
  **asserts** the resulting grant set, failing loudly if it does not match.
- **The filter must include `PUBLIC`.** A table-wide `GRANT ... TO PUBLIC` is recorded
  under that grantee; omitting it makes the assertion unfailable — the same trap
  `20260808010000` documents.

The same treatment applies to every column this slice adds. Verification stamps are
**server-write-only** without exception.

---

## 5. The three dimensions

### 5.1 Tax & identity — mirror the signal, store no number

**Decision: mirror Stripe's signals; never store a tax identification number.**

Both Connect accounts are **Express** (`create-creator-connect-account:169`,
`create-restaurant-connect-account:263`). With Express, Stripe hosts onboarding and
collects and verifies the tax ID itself — SSN for individuals, EIN for businesses — and
**never exposes the number to the platform**. Storing our own copy would mean holding
the most sensitive PII a small company can hold, requiring encryption at rest,
restricted access, a retention policy and breach exposure, in order to duplicate a check
Stripe already performs and stands behind. The founder's requirement — *"proven on the
app and matched with Stripe"* — is satisfied by the signal, not the number.

**Mechanism.** `stripe-webhook` already handles `account.updated` (line 387) and already
mirrors `charges_enabled && payouts_enabled` into `creator_profiles`,
`business_profiles` and `org_units` by `stripe_account_id`. The same handler is
extended. No new webhook, no new event subscription, no new failure mode.

**A correction the current code invites.** `charges_enabled && payouts_enabled` is
**not** "identity verified". An account can be payouts-enabled while verification is
still pending, and can later become restricted with payouts nominally enabled until a
deadline passes. The honest signals are `requirements.currently_due`,
`requirements.past_due`, `requirements.disabled_reason` and the
`individual.verification.status` / `company.verification.status` fields. Mirroring those
is what lets the checklist say *what* Stripe is waiting for instead of a generic "finish
setup" — the difference between a user who can act and one who cannot.

**Columns** (added to `creator_profiles` and `business_profiles`; `org_units` gets the
same set because it mirrors a restaurant's per-location account):

| Column | Type | Meaning |
|---|---|---|
| `identity_verified_at` | `timestamptz` | Stripe reported verification `verified`. NULL = not verified. |
| `tax_id_provided` | `boolean` | Stripe holds a tax ID. **Never the number.** |
| `stripe_requirements_due` | `text[]` | `currently_due ∪ past_due`, so copy can name the blocker. |
| `stripe_disabled_reason` | `text` | Why Stripe has restricted the account, verbatim. |

All nullable, no default, no backfill. **NULL means "we have not heard from Stripe about
this account yet", which is a genuinely different state from "not verified"** — and the
slice-1 engine already renders that difference correctly, because an absent fact derives
`unknown` and `unknown` never blocks.

**Backfill is deliberately omitted.** Existing accounts populate on their next
`account.updated`. A one-shot reconcile script may be run later; it is not a
prerequisite, precisely because fail-open makes the absent state safe. This is the first
real dividend of having built the engine before the signals.

### 5.2 Phone — Twilio Verify

**Credentials already exist:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
`TWILIO_PHONE_NUMBER` have been set since 2025-12-10, and `send-promotion-notification`
already calls the Messages API. **Whether that account is live and funded is
unverified** — the secrets' existence proves they were set, not that they work. §10
probes this before anything is built on it. Same discipline as slice 1's open questions:
a claim about the outside world has an expiry date.

**Twilio Verify rather than hand-rolled codes on the Messages API.** Verify owns code
generation, expiry, attempt limiting and Fraud Guard. A hand-rolled OTP has to get
constant-time comparison, replay, expiry, attempt-cap and lockout right, and store codes
somewhere — every one of which is a way to be quietly wrong. One setup action is
required: create a Verify Service in the Twilio console and set
`TWILIO_VERIFY_SERVICE_SID`. **The function is fail-closed without it** — an unset
service SID refuses to start a verification rather than silently falling back to
Messages.

**Threat model — SMS pumping is the actual risk.** An attacker triggers large volumes of
OTPs to premium-rate numbers they control and collects a share of the carrier fee, which
the platform pays. It is the dominant abuse of any open send-code endpoint. Mitigations,
all required by this design:

- **Country allowlist — US only initially.** Highest-value single control; pumping
  overwhelmingly targets high-fee international ranges. The allowlist is data, not code,
  so opening a market later is a config change.
- **Per-user rate limit** on `start`: a small number of sends per rolling window, plus a
  cooldown between sends.
- **Per-IP rate limit**, because per-user alone is defeated by creating accounts.
- **Twilio Fraud Guard** enabled on the Verify Service.
- **`check` attempts are capped**, and hitting the cap invalidates the verification, so
  the endpoint is not a code oracle.

**Edge function `verify-phone`** with two actions:

- `start` — validates E.164 shape and country allowlist, applies both rate limits, calls
  Verify. **Never reveals whether a number is already in use by another account** — that
  would make it an enumeration oracle.
- `check` — submits the code; on Twilio-approved, writes `profiles.phone` and
  `profiles.phone_verified_at = now()` **with the service role**, keyed on
  `auth.getUser()`, never on a body-supplied user id.

`verify_jwt` alone is not authorization — the anon key is a valid JWT and ships in the
frontend bundle (`docs/wiki/concepts/anon-key-is-not-authorization.md`). The function
establishes the user with `auth.getUser()` and uses that identity for every write.

**Re-verification.** Changing `profiles.phone` clears `phone_verified_at` in the same
statement. A verified stamp must never outlive the value it attests to. Enforced by
trigger, not convention, because the column is written from more than one place.

### 5.3 Address — confirmed by geocode

**Businesses.** `org_units` already has `address`, `lat`, `lng`, and Google Maps
geocoding is already integrated. Add `address_verified_at`, stamped **only** when a
geocode returns a usable result. A failed or ambiguous geocode leaves it NULL, which
derives `unmet` — honestly, since we do not know where they are.

**Creators — a gap this slice closes.** `org_units` is the **only** table in the database
with `lat`/`lng` (verified against prod 2026-08-23). Creators have `city` and `location`
as free text and no coordinates at all, so creator distance matching is either geocoding
on the fly or not meaningfully working. Since match quality is one of the five stated
drivers, creators get persisted coordinates: `lat`, `lng` and `address_verified_at` on
`creator_profiles`.

**Precision is deliberately asymmetric.** A business is a place customers visit and
publishes its address. A creator's home address is not something to display, and storing
a precise one invites exposure. Creators are geocoded to a **city/postal centroid**, not
a street address — enough for distance matching, not enough to find someone's home. The
stored value is the centroid; the street address is never persisted.

---

## 6. What this adds to the slice-1 engine

Three requirement keys, using the existing four states and two tiers:

| Key | Roles | Tier | `met` when |
|---|---|---|---|
| `phone_verified` | all | recommended | `profiles.phone_verified_at` is not null |
| `identity_verified` | all | required | role table's `identity_verified_at` is not null |
| `address` | business, brand | required | primary `org_unit.address_verified_at` not null |
| `address` | creator | recommended | `creator_profiles.address_verified_at` not null |

**No new rendering.** They appear in the first-run checklist, the attention list and the
gate automatically. That is what slice 1 bought, and it is the test of whether slice 1
was designed correctly.

`identity_verified` is **not** added to any action in `ACTION_REQUIREMENTS` in this
slice. Slice 1's §11 requires a dimension be watched in the checklist before it gates
anything — ship the signal, watch it against real accounts, and only then decide whether
it blocks publishing or applying. Gating on a signal never observed in production is how
a silent, permanent block gets built.

---

## 7. Failure behavior

Unchanged from slice 1, and that is the point. Twilio down, Stripe silent, Maps
erroring — each makes its requirement `unknown`, and `unknown` never blocks and never
renders as a failure. **A verification outage must never lock a user out of the
product.**

The one asymmetry: a **failed** verification is not `unknown`. Entering a wrong code
leaves `unmet` with actionable copy, because we did hear back and the answer was no.

---

## 8. Rollout

1. Migrations (columns + the §4 grant lockdown) applied and verified.
2. `verify-phone` deployed with the country allowlist set to US.
3. The requirement keys added — visible in the checklist, gating nothing.
4. Watch real accounts populate. Only then consider adding `identity_verified` to an
   action.

`READINESS_GATE_ENABLED` stays absent throughout, so the gate continues to render
children unconditionally and nothing in this slice can block a user.

---

## 9. Testing

1. **Fail-open regression** for all three new dimensions: provider down ⇒ `unknown` ⇒
   children render, nothing outstanding.
2. **The grant lockdown proven red→green on prod inside a rolled-back transaction**:
   impersonate a real user, attempt `update profiles set phone_verified_at = now()`,
   confirm `42501`. Before the migration this succeeds — **capture that**, because a test
   that cannot fail against the bug is worthless, a lesson this project learned three
   times in slice 1.
3. **Phone re-verification**: changing `phone` clears `phone_verified_at`. Trigger-level.
4. **Rate limits**: the N+1th send in a window is refused; the cap is per-user *and*
   per-IP.
5. **Country allowlist**: a non-allowlisted number is refused **before any Twilio call** —
   asserted by the absence of an outbound request, not by the response alone.
6. **No enumeration oracle**: `start` returns an identical response for a number already
   attached to another account and for a fresh one.
7. **Stripe mirroring**: an `account.updated` fixture with `currently_due` non-empty
   populates `stripe_requirements_due` and leaves `identity_verified_at` NULL.

---

## 10. Open questions — answer against production before building

Slice 1's equivalent section found that the gate had never run in production at all.
Answer these the same way, with a query or a probe, not an assumption.

1. **Are the Twilio credentials live and funded?** Set 2025-12-10; the only consumer is
   `send-promotion-notification`. Has it ever successfully sent? If the account is
   dormant or unfunded, that is a prerequisite, not a mid-build surprise.
2. **Which `profiles` columns are legitimately client-written?** Required before the §4
   revoke/grant. Enumerate from the code, then cross-check against `information_schema` —
   do not guess.
3. **Do any existing Connect accounts already report `requirements.currently_due`?** That
   is the difference between shipping a checklist row that is immediately actionable and
   one nobody will ever see fire.
4. **Does `org_units` have rows whose `address` is set but which never geocoded?** They
   would derive `unmet` on day one and surface as a wave of new checklist items for
   existing users. Worth knowing the number before, not after.
