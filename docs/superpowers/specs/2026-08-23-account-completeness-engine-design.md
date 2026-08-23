# Account Completeness Engine — Design

> **Slice 1 of 4** in the signup & onboarding redesign. Defines the requirement
> model, the checklist and the just-in-time gate. Slices 2–4 (identity &
> verification, entry experience, depth) each implement this slice's interface
> and get their own spec.

**Date:** 2026-08-23
**Status:** Design — not yet planned or implemented
**Supersedes:** nothing. **Extends:** `src/lib/readiness.ts`, `src/components/ReadinessGate.tsx`

---

## 1. Why this exists

Signup and onboarding are being redesigned to collect substantially more about
restaurants and creators — contact details, address, legal identity, Stripe,
locations, staff, social accounts — driven by five goals stated by the founder:
payments readiness, match quality, sales qualification, correct multi-location
account shape, and **verification of real businesses and real creators to
prevent fraud and establish trust**.

The founder chose a **thin gate**: signup plus a short profile gets a user into
the product, and everything heavy is required only at the moment it unlocks
something. That decision is what makes this slice the foundation. A thin gate is
only coherent if something knows, at any moment, what an account still owes and
what each action demands. That "something" is this engine.

It also protects the North Star (`PROJECT_CONTEXT` §2, *less typing = more
margin*) and the standing principle in §7 — *setup disguised as action; never
ask users to configure before they understand why*.

### 1.1 Two half-systems already exist

This is not greenfield, and the central problem is that the two halves disagree
by construction.

**`ReadinessGate` + `deriveReadiness`** (`src/lib/readiness.ts`,
`src/components/ReadinessGate.tsx`) is a real gate. It derives readiness from
live data, is deliberately **fail-open** — blocking only on a definitive
not-ready answer, never on loading or error, because the server-side
`pending_balance` park and auto-flush are the actual money-safety net — and
supports two dimensions, `stripe` and `social`. It has two call sites, both
creator-side: `DetailedApplicationCard` (accept offer) and `CampaignDetailsPage`
(apply). It sits behind the `READINESS_GATE_ENABLED` feature flag.

**`MissionChecklist` + `first_run_missions`** (`src/components/first-run/`,
`src/hooks/useFirstRunMissions.ts`) is the other half: a gamified,
sequentially-locked checklist stored as a JSONB blob on `profiles`, rendered
full-screen by `FirstRunDashboard` on all three dashboards.

They track the same facts two different ways. The checklist's `setup_payments`
boolean and the gate's `stripe` dimension answer the same question — one derived
live from Stripe, the other a flag the app remembered to write. That is the
**"recorded ≠ actual"** class this project has been bitten by twice already: the
`handle_updated_at` prod stub and the phantom collaboration state-machine
migration. A stale blob puts a green check on an unverified account.

### 1.2 One premise corrected during design

An early framing held that multi-location accounts land in a broken shape. They
do not. `trg_auto_create_org` (migration `20260427220000`) fires on every
`business_profiles` insert and creates the organization, a primary `org_unit`,
an owner `org_member`, and sets `profiles.org_id` and
`profiles.active_org_unit_id`. Creators correctly get no org — the trigger is
business-only.

What is actually missing is that **onboarding never asks** about additional
locations or teammates, and the primary unit is created with a name but no
address, no lat/lng and no Stripe account. That is a much smaller problem, and
it belongs to slice 4, not here.

---

## 2. Scope

### In scope

- The requirement model: keys, tiers, four-state status, pure derivations.
- The action registry mapping an action to the requirement keys it demands.
- `useAccountReadiness(role)` — one hook assembling the context.
- Rewiring `MissionChecklist` to derive rather than read the blob.
- Rendering unmet requirements as slots in the existing `NeedsAttentionSection`.
- Extending `ReadinessGate` to take an action rather than a hardcoded shape.
- Three nullable columns: `profiles.phone`, `profiles.phone_verified_at`,
  `profiles.dismissed_requirements`.

### Explicitly out of scope

- **Phone OTP** — slice 2. This slice adds only the columns so the requirement
  derives an honest `unmet`.
- **Business identity and tax ID** — slice 2. *Where* an EIN is stored is a
  storage-sensitivity decision this slice must not pre-empt.
- **Stripe Connect moved into onboarding**, and the verification mirror — slice 2.
- **Value carousel, social login, signup/wizard redesign** — slice 3.
- **Locations, team invites, Outstand linking as flows** — slice 4. This slice
  derives their state; it does not build their capture UI.

The engine's whole value is that adding a dimension is a one-object change.
Front-loading every dimension here would drag later slices' decisions forward
and prove nothing. Slice 1 ships the dimensions derivable from data that already
exists.

---

## 3. Verification spine (context for later slices)

Recorded here because it constrains this slice's vocabulary.

**Stripe Connect is the authority.** Its KYC/KYB establishes that a business or
creator is real. DragonCandy mirrors those signals so they are provable in-app
and reconcilable against Stripe, rather than maintaining an independent notion of
"verified" that can disagree with the one that gates money.

**A hard limit to design around:** Stripe never returns a full tax ID. It
returns `company.tax_id_provided` and a last-4 for SSN. We can prove *provided*
and *verified*; we cannot digit-match what we collected against what Stripe
holds. Any later claim of "matched with Stripe" must mean status reconciliation,
not value comparison.

This is why the status enum below has a `pending` state: Stripe verification in
progress is genuinely not the same as never started.

---

## 4. The requirement model

### 4.1 Status

```ts
type RequirementStatus = 'met' | 'unmet' | 'pending' | 'unknown';
```

Four states, and the two beyond met/unmet are load-bearing:

- **`pending`** — submitted, waiting on someone else. Stripe verification in
  progress. Today's model collapses this into a blocking state with copy that
  reads as an error to a user who has already done the work.
- **`unknown`** — the source was loading, erroring, or absent. **`unknown` never
  blocks and never renders as a failure.** This preserves the existing fail-open
  contract exactly.

A `met` requires a definitive positive. We never show "done" on the strength of
a source we could not reach.

### 4.2 Definition

```ts
interface RequirementDef {
  key: RequirementKey;
  tier: 'required' | 'recommended';
  label: string;            // "Verify your phone"
  why: string;              // "So restaurants can reach you about a shoot"
  derive: (ctx: ReadinessContext) => RequirementState;
  resolve: ResolveTarget;   // route or modal that fixes it
}
```

`derive` is **pure** — no I/O. Every fact it needs arrives on `ReadinessContext`.
This is what lets slice 2 lift these into a server-side `account_readiness()`
RPC without a rewrite (see §9).

### 4.3 Tiers

`required` items can gate an action and appear prominently. `recommended` items
never gate anything, appear quieter, and are dismissible.

Per the founder: **social linking is `recommended`** — "optional for creators and
businesses but highly recommended", with an "I don't have one yet" path that
sends the user to create an account on a platform. No gate ever blocks on it.

Dismissal of a recommended item is genuinely not derivable, so it is stored — in
its own `profiles.dismissed_requirements text[]` column, **not** in the existing
`dismissed_coachmarks`. The two are both arrays of opaque string keys, so
overloading one column means a coachmark key colliding with a requirement key
silently dismisses the wrong thing, with no type error and no obvious symptom.
Same shape, different meaning, separate column.

### 4.4 Slice-1 dimensions

Declared per role in one table. Every one below derives from data that exists
today, except `phone_verified`.

| Key | Roles | Tier | Met when |
|---|---|---|---|
| `email_verified` | all | required | `profiles.email_verified` is true |
| `profile_basics` | all | required | name **and** logo/avatar are non-empty on the role profile |
| `phone_verified` | all | required | `profiles.phone_verified_at` is non-null (**new column**) |
| `address` | business | required | the primary `org_unit` has `address` **and** `lat`/`lng` |
| `stripe` | all | required | mirrored column (checklist) / live edge fn (gate) — see §5.2 |
| `social_linked` | all | recommended | ≥1 active account from `useLocationSocialAccounts`, or dismissed |
| `locations` | business | recommended | **every** `org_unit` has an address, or dismissed |
| `team` | business | recommended | `org_members` count > 1, or dismissed |
| `skills` | creator | required | `creator_profiles.skills` is non-empty |
| `bio` | creator | required | `creator_profiles.bio` is non-empty |
| `portfolio` | creator | recommended | `creator_profiles.portfolio_urls` is non-empty, or dismissed |

Four definitions above are deliberate and worth reading twice:

- **`profile_basics` derives from the actual fields, never from `is_completed`.**
  `is_completed` is a flag the wizard writes — exactly the recorded-vs-actual
  trap this whole design exists to close (§1.1). It would be incoherent to build
  a derived engine and then trust a boolean.
- **`address` is business-only.** A brand's primary `org_unit` is a `product`,
  not a location; demanding a street address of it would be a requirement no
  brand can meaningfully satisfy.
- **`locations` is not "have more than one."** The auto-org trigger always
  creates exactly one unit, so a count test would nag every solo restaurant
  forever. It is met when every unit that exists has an address — which stays
  quiet for a single-site restaurant and turns unmet the moment someone adds a
  second location and leaves it blank.
- **Every `recommended` item is satisfiable by dismissal.** A genuinely solo
  restaurant with no social presence must be able to reach a clean checklist.
  Without that, "recommended" becomes a permanent nag.

`email_verified` is expected to read `met` for every password-signup user today,
because `AuthForm` signs the user out until they verify. It is declared anyway
because slice 3 adds OAuth paths where that guarantee no longer holds, and
because internal-scope accounts bypass the consumer signup path entirely.

Slice 2 adds `business_identity` (legal name + EIN) and upgrades
`phone_verified` from a column read to a real OTP flow. Neither changes this
slice's interface.

### 4.5 Action registry

Actions name the keys they demand, in one place:

```ts
const ACTION_REQUIREMENTS: Record<GatedAction, readonly RequirementKey[]> = {
  publish_campaign: ['stripe'],
  apply_campaign:   ['stripe'],
  accept_offer:     ['stripe'],
  // slice 2 adds business_identity / phone_verified / address here,
  // once each has a capture flow — never at the call sites.
};
```

**Slice 1 ships this registry demanding `stripe` and nothing else — which is
exactly today's behavior, refactored.** An earlier draft had
`publish_campaign` demand `address`, and writing the consistency test (§10)
proved it wrong twice over: brands can publish campaigns but have no `address`
requirement (§4.4), so the test would fail; and address *capture* does not exist
until slice 4, so gating on it would brick publishing for everyone. This is
§11's rollout rule doing its job at design time — nothing gates on a dimension
whose capture flow has not shipped.

A call site becomes `<ReadinessGate action="publish_campaign">`. Three reasons
this indirection earns its place:

1. Changing what publishing demands is a one-line edit in one file, not a hunt
   through call sites.
2. Gate copy is generated consistently — *"To publish a campaign you still
   need…"* — instead of hand-written per site and drifting.
3. **Donny can answer "why can't I publish?" from the same table the gate
   reads.** A second hardcoded explanation in the orchestrator would drift from
   the gate, and the user would be told something untrue by the assistant.

---

## 5. Data flow

### 5.1 One hook, four cached reads

`useAccountReadiness(role)` assembles `ReadinessContext` from four React Query
reads that **already exist and are already cached under stable keys**: the
profile and role profile, org data (`useOrgData`), social accounts
(`useLocationSocialAccounts`), and Stripe status.

The checklist and the gate both call this hook and share the same cache.
**Eight requirements do not mean eight requests.**

### 5.2 The one real cost: split the Stripe read

Today the Stripe status edge function fires only at two creator call sites,
behind a flag that appears to be off. Putting a checklist on every dashboard
means every business user hits `check-restaurant-payout-status` — and therefore
Stripe's API — on page load.

Therefore the read is split by consequence:

- **Checklist** reads the mirrored `stripe_onboarding_complete` column. Cheap,
  may lag a webhook by seconds. A checklist that is briefly stale is harmless.
- **Gate** keeps the live authoritative call. A gate that is stale costs money.

This split is a deliberate asymmetry, not an inconsistency: the cost of being
wrong differs by two orders of magnitude between the two surfaces.

### 5.3 Failure behavior

Any source loading or erroring makes that requirement `unknown`. `unknown`
renders as a neutral "checking…" row, never a red X, and never blocks — the gate
renders its children. This is the existing `deriveReadiness` contract, preserved
verbatim and extended to the new dimensions.

---

## 6. The three renderings

No new surface is required. All three already exist.

### 6.1 First run — `MissionChecklist`

`BusinessDashboard` is a three-way switch and first-run wins first, rendering
`FirstRunDashboard` as a full-screen takeover that hides Donny entirely.
`MissionChecklist` keeps its exact look but is driven by derived requirements
instead of the JSONB blob.

**Behavior change: the sequential lock is dropped for derived items.**
`getMissionStatus` currently locks item N until N−1 is complete. With derived
truth, locking is a lie — someone can finish Stripe before ever browsing
inspiration, and rendering that as "locked" contradicts observable reality. The
non-derivable viewed-events (§7) may keep an ordering hint; they may not
misreport the derived ones.

### 6.2 Steady state — `NeedsAttentionSection`

After first run, each unmet **required** requirement becomes a slot in the
existing `NeedsAttentionSection` on the Donny-first dashboard. Recommended items
appear there too, quieter and dismissible.

This is chosen specifically so the checklist does **not** compete with Donny for
the dashboard body — `/dashboard/business` is Donny-first by design (#410,
#428, #429, #444). `NeedsAttentionSection` already consolidates banners into one
framed list and already hides itself when every slot is empty, so a complete
account sees nothing at all.

Its documented contract must be honored: **each child must render `null`** — not
an empty element, not a skeleton — when it has nothing to show, or the section
resurrects its header around a blank frame.

### 6.3 Just-in-time — `ReadinessGate`

Unchanged in shape. `require={{ stripe: true }}` becomes
`action="apply_campaign"`, resolved through the registry. `hard` and `soft`
modes and the fail-open guarantee are untouched.

---

## 7. What happens to `first_run_missions`

The column **stays** (per `CLAUDE.md`: never drop or rename columns). Only what
is written to it narrows, so existing rows keep reading fine.

**Becomes derived:** `setup_payments` / `setup_payouts` (Stripe),
`add_portfolio` (`creator_profiles.portfolio_urls`), `create_campaign` /
`launch_campaign` (a `campaigns` row), `apply_campaign` (a
`campaign_applications` row), `create_sponsorship` (a `campaign_sponsorships`
row).

**Stays in the blob:** `browse_inspiration`, `view_campaigns`, `select_style`,
`browse_creators` — pure "did the user look at this once" engagement events with
no row anywhere to derive from.

**Invariant:** no derived requirement may read `first_run_missions`. Enforced by
test (§10).

---

## 8. Schema change

One additive migration, three nullable columns, no backfill:

```sql
alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists dismissed_requirements text[];
```

`dismissed_requirements` backs §4.3. It is left nullable rather than
`default '{}'` so that "never dismissed anything" and "dismissed then cleared"
stay distinguishable, and so the `ADD COLUMN` does not rewrite every row.

No UI, no OTP, no provider in this slice. The phone columns exist so
`phone_verified` derives an honest `unmet` rather than a meaningless `unknown` —
`unknown` never blocks and never shows, so without the column we could not tell a
working engine from a broken one.

`phone_verified_at` follows the project's established anchor convention: a
timestamp set at the moment the fact becomes true, never a boolean that can be
set optimistically. `NULL` means not verified.

RLS: `profiles` already has own-row policies; these columns inherit them. Phone
is contact PII, so slice 2 must confirm no public profile view
(`safe_profiles`, `public_creator_profiles`, `public_business_profiles`) exposes
it before any capture UI ships.

---

## 9. Forward path to a server-side RPC

The endpoint is a Postgres `account_readiness()` RPC returning the whole state
in one round trip, readable by the gate, the checklist, Donny and edge
functions.

It is **not viable today**: Stripe status is not in Postgres, so the RPC could
only read the mirrored column and would be stale by webhook latency for the gate,
and it would lose the fail-open nuance that keeps a Stripe outage from blocking
every user.

Slice 2's verification mirror is precisely the work that makes it viable. Keeping
every `derive` pure and I/O-free is what converts this design into that one
without a rewrite. **Do not add I/O to a `derive` function.**

---

## 10. Testing

Derivations are pure, so coverage concentrates there: a table-driven unit test
per requirement across all four statuses, following the existing
`src/lib/readiness.test.ts` pattern.

Four tests matter more than the rest:

1. **Fail-open regression.** `ReadinessGate.test.tsx` already asserts loading and
   error render children. Extend so every new dimension returning `unknown` also
   renders children. This contract must not break.
2. **Registry consistency.** Every key an action demands must exist in the
   requirement set for a role that can perform that action. Without this, an
   action demanding a key its role never has is a permanent, silent block — a
   user who simply cannot publish, with no error to search for.
3. **`unknown` is never a red X**, in either the checklist or the attention list.
4. **A complete account renders nothing** — `NeedsAttentionSection` disappears
   under its null contract.

Two edge cases written explicitly:

- A business account with **no `org_id`** degrades to `unknown` rather than
  throwing. The auto-org trigger fires on insert only; a separate backfill
  migration (`20260428100000`) covers older accounts, and that coverage is
  assumed, not verified.
- **No derived requirement reads `first_run_missions`** (§7 invariant).

---

## 11. Rollout

Deliberately asymmetric:

- **The checklist ships unflagged.** It is additive and non-blocking; worst case
  it shows an item a user does not care about.
- **The gate stays behind `READINESS_GATE_ENABLED`, off**, until each new
  dimension has been observed deriving correctly in the checklist on production.

Nothing starts blocking a real user on a dimension we have not watched work.
This also means slice 1 can ship with **zero behavior change for existing
users** — which matters, because there is no per-role kill switch on the
dashboard and rollback is a revert.

---

## 12. Open questions — ANSWERED against production 2026-08-23

All four were run against the live `DragonCandy_v3` project (`zocahiffooqdybdhguqv`)
via `supabase db query --linked`. Results below; none is now open.

1. **Does `READINESS_GATE_ENABLED` exist in `feature_flags`?** **No — zero rows.**
   Confirmed: the gate has **never run in production**. `useFeatureFlag` returns
   `false` on a missing row, so every existing `ReadinessGate` call site has been
   rendering its children unconditionally since it shipped. This makes §6.3's
   refactor safe by construction — there is no live blocking behavior to regress —
   and it means the two creator gate call sites have never actually gated anything.

2. **Is `stripe_onboarding_complete` internally consistent?** **Yes —
   `impossible_rows = 0` on both tables.** No row is marked complete without a
   `stripe_account_id`. Business: 20 rows, 4 with an account, 2 complete. Creator:
   16 rows, 4 with an account, 3 complete. The cheap mirrored read in §5.2 is
   therefore trustworthy for the checklist. Note this proves *internal consistency*,
   not *webhook freshness* — a row could still lag a Stripe-side change by the
   webhook delay, which is exactly why the gate keeps the live read.

3. **Does every existing business account have an org row?** **Yes — zero
   `business_profiles` rows whose `profiles.org_id` is null.** The `20260428100000`
   backfill is complete. `deriveAddress`'s zero-org `unknown` branch (§10) is
   therefore defensive rather than load-bearing — it will not fire for any account
   that exists today, but it still guards the case where a future insert path
   bypasses `trg_auto_create_org`.

4. **Is the local test run trustworthy?** **It was not, and it now is.** Node 26.7.0
   was in use and the documented breakage reproduced exactly: 50 failed / 2479 passed
   across `DonnyHome.test.tsx` (37), `useInactivityTimeout.test.ts` (8) and
   `pendingBrief.test.ts` (5). Root cause is narrower than "Node 26" — Node 24+ ships
   a built-in `localStorage` that is `undefined` without `--localstorage-file`, and it
   **shadows the Storage jsdom provides**. Fixed in a standalone commit
   (`vitest.setup.ts` + `setupFiles`): the suite is now **250 files / 2550 tests, zero
   failures**. CI runs Node 24 and passed throughout, so this only ever hurt local
   runs — which is why it mattered here: it made `DonnyHome.test.tsx` unusable as a
   verification surface for §6.2's work. The `.nvmrc` pin noted in `PROJECT_CONTEXT`
   remains open and is a separate concern.

---

## 13. Slices 2–4 (for orientation only)

- **Slice 2 — Identity & verification.** Phone OTP, legal business identity and
  EIN, address via Google Places, Stripe Connect moved in-flow, and the
  verification mirror that reads Stripe's status back onto DragonCandy. Adds its
  dimensions to this engine.
- **Slice 3 — Entry experience.** Role-aware value carousel, real social login
  (Apple/Google/Facebook — note Apple *requires* Sign in with Apple if any other
  social login ships in the iOS app), slimmed signup, restyled wizard. Carries
  out-of-repo configuration that can start in parallel now.
- **Slice 4 — Depth.** Additional locations with real addresses, teammate
  invites, Outstand social linking as the recommended tier. All three add rows to
  structures that already exist and plug into this engine's checklist.
