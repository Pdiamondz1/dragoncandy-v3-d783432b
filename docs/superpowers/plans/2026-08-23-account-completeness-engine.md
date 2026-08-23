# Account Completeness Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one live-derived account requirement model, rendered three ways — the first-run checklist, the steady-state attention list, and the just-in-time gate — so the checklist and the gate can never disagree about whether an account is complete.

**Architecture:** Pure derivation functions take a `ReadinessContext` of plain facts and return a four-state status (`met` / `unmet` / `pending` / `unknown`). Requirements are declared per role in one table; actions declare which requirement keys they demand in a registry. One hook assembles the context from React Query reads that already exist and are already cached. `unknown` never blocks, preserving the existing fail-open contract. No `derive` function performs I/O — that is what lets slice 2 lift them server-side.

**Tech Stack:** React 18 + TypeScript (strict), Vitest + @testing-library/react, React Query, Supabase JS v2, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-23-account-completeness-engine-design.md`

## Global Constraints

- **`unknown` never blocks and never renders as a failure.** It renders as a neutral "checking…" row. The gate renders its children. This is the existing `deriveReadiness` contract and it must not break.
- **A `met` requires a definitive positive.** Never show "done" from a source that could not be reached.
- **No `derive` function may perform I/O.** All facts arrive on `ReadinessContext`. (Spec §9.)
- **No derived requirement may read `first_run_missions`.** (Spec §7 invariant.)
- **Never drop or rename columns.** New columns are added nullable. (`CLAUDE.md`.)
- **Checklist reads the mirrored `stripe_onboarding_complete` column; the gate reads the live edge function.** (Spec §5.2.)
- **The checklist ships unflagged; the gate stays behind `READINESS_GATE_ENABLED`, off.** (Spec §11.)
- Path alias `@/` maps to `src/`. Named exports for components, default only for pages.
- ESLint: only `console.error` / `console.warn` allowed. No `any`.
- Run one test file with `npx vitest run <path>`. Full suite: `npm run test`. Types: `npm run typecheck`. Build: `npm run build`.

---

### Task 1: Verify the four open questions against production

Spec §12 records four things that cannot be settled from the repository. Later tasks depend on the answers, so this runs first. **No code — the deliverable is recorded findings.**

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-account-completeness-engine-design.md` (append a findings block to §12)

**Interfaces:**
- Consumes: nothing.
- Produces: a confirmed answer to whether `READINESS_GATE_ENABLED` exists, whether `stripe_onboarding_complete` is current, whether every business account has an org row, and whether the local test run is trustworthy. Task 6 and Task 9 read these.

- [ ] **Step 1: Check whether the readiness flag exists**

Via the Supabase MCP (`execute_sql`) against the production project:

```sql
select name, is_enabled, updated_at
from public.feature_flags
where name = 'READINESS_GATE_ENABLED';
```

Expected: **zero rows.** `useFeatureFlag` returns `false` on a missing row, so zero rows means the gate has never run in production. Record the actual result either way.

- [ ] **Step 2: Check whether `stripe_onboarding_complete` is current**

```sql
select
  count(*)                                                        as total,
  count(*) filter (where stripe_account_id is not null)           as has_account,
  count(*) filter (where stripe_onboarding_complete)              as marked_complete,
  count(*) filter (where stripe_account_id is null
                     and stripe_onboarding_complete)              as impossible_rows
from public.business_profiles;
```

Then the same query against `public.creator_profiles`. `impossible_rows` must be **0** — a row marked complete with no account id means the mirror is unreliable and Task 6's cheap checklist read cannot be trusted.

- [ ] **Step 3: Check org coverage for existing business accounts**

```sql
select count(*) as business_profiles_without_org
from public.business_profiles bp
join public.profiles p on p.id = bp.user_id
where p.org_id is null;
```

Expected: **0**, from the `20260428100000` backfill. A non-zero result does not block this work — Task 3's `deriveAddress` returns `unknown` for those accounts by design — but it must be recorded, because `unknown` means those users see no address row at all.

- [ ] **Step 4: Check the local test runner is trustworthy**

```bash
node --version
npx vitest run src/lib/readiness.test.ts
```

`PROJECT_CONTEXT` records that Node 26 shadows jsdom's `localStorage` and breaks 50 tests CI passes. If `node --version` reports 26 or higher, switch to Node 24 before any later task, or no local green run in this plan can be honestly claimed.

- [ ] **Step 5: Record findings in the spec and commit**

Append to §12 a short block with the date, each query's actual result, and one sentence on what it changes. Replace the open questions rather than leaving both.

```bash
git add docs/superpowers/specs/2026-08-23-account-completeness-engine-design.md
git commit -m "docs: record production findings for the four open questions in the completeness engine spec"
```

---

### Task 2: Add the three nullable columns

**Files:**
- Create: `supabase/migrations/20260823120000_account_completeness_columns.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerated)

**Interfaces:**
- Consumes: nothing.
- Produces: `profiles.phone text`, `profiles.phone_verified_at timestamptz`, `profiles.dismissed_requirements text[]`. Task 3's `ReadinessContext` and Task 6's hook read the latter two.

- [ ] **Step 1: Write the migration**

```sql
-- Account completeness engine (slice 1) — additive columns only.
--
-- phone / phone_verified_at exist so the `phone_verified` requirement derives an
-- honest `unmet` rather than `unknown`. `unknown` never blocks and never renders,
-- so without the column a working engine is indistinguishable from a broken one.
-- No OTP, no capture UI, no provider in this slice — that is slice 2.
--
-- dismissed_requirements backs the dismissal of `recommended` items. It is
-- deliberately NOT the existing dismissed_coachmarks column: both are arrays of
-- opaque string keys, so sharing one means a coachmark key colliding with a
-- requirement key silently dismisses the wrong thing, with no type error.
--
-- All three are nullable with no default and no backfill: a volatile or non-null
-- default would rewrite every row, and NULL is a meaningful "never set".

alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists dismissed_requirements text[];

comment on column public.profiles.phone_verified_at is
  'Set at the instant phone ownership was proven. NULL = not verified. Never a boolean set optimistically.';
comment on column public.profiles.dismissed_requirements is
  'Requirement keys the user dismissed. Recommended-tier only; a required item is never dismissible.';
```

- [ ] **Step 2: Apply the migration and verify the columns exist**

Apply via the Supabase MCP `apply_migration`, then verify against the object rather than the ledger — a `schema_migrations` row is not proof the object exists (`PROJECT_CONTEXT`, `recorded ≠ actual`):

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('phone', 'phone_verified_at', 'dismissed_requirements')
order by column_name;
```

Expected: exactly 3 rows, all `is_nullable = YES`.

- [ ] **Step 3: Confirm the columns are not exposed publicly**

Phone is contact PII. Confirm no public view leaks it:

```sql
select table_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('safe_profiles', 'public_creator_profiles', 'public_business_profiles')
  and column_name in ('phone', 'phone_verified_at');
```

Expected: **zero rows.** A non-empty result must be fixed before Task 6 ships.

- [ ] **Step 4: Regenerate Supabase types**

Regenerate `src/integrations/supabase/types.ts` and confirm the three columns appear under `profiles`:

```bash
grep -n "dismissed_requirements\|phone_verified_at" src/integrations/supabase/types.ts | head
```

Expected: at least 3 hits each (Row, Insert, Update).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add supabase/migrations/20260823120000_account_completeness_columns.sql src/integrations/supabase/types.ts
git commit -m "feat: add phone, phone_verified_at and dismissed_requirements to profiles"
```

---

### Task 3: The requirement types and pure derivations

The heart of the engine. Everything here is pure and I/O-free.

**Files:**
- Create: `src/lib/accountReadiness/types.ts`
- Create: `src/lib/accountReadiness/derivations.ts`
- Test: `src/lib/accountReadiness/derivations.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RequirementKey`, `RequirementStatus`, `RequirementTier`, `AccountRole`, `RequirementState`, `ReadinessContext`, `OrgUnitFacts`, `StripeFacts`, `CreatorFacts`, `RequirementDef`, `ResolvedRequirement`; and the derive functions `deriveEmailVerified`, `deriveProfileBasics`, `derivePhoneVerified`, `deriveAddress`, `deriveStripe`, `deriveSocialLinked`, `deriveLocations`, `deriveTeam`, `deriveSkills`, `deriveBio`, `derivePortfolio`. Tasks 4, 5 and 6 all depend on these exact names.

- [ ] **Step 1: Write the types**

Create `src/lib/accountReadiness/types.ts`:

```ts
export type RequirementKey =
  | 'email_verified'
  | 'profile_basics'
  | 'phone_verified'
  | 'address'
  | 'stripe'
  | 'social_linked'
  | 'locations'
  | 'team'
  | 'skills'
  | 'bio'
  | 'portfolio';

/**
 * Four states, and the two beyond met/unmet are load-bearing.
 * `pending` — submitted, waiting on someone else (Stripe verifying).
 * `unknown` — source loading, erroring or absent. NEVER blocks, NEVER renders
 *             as a failure. This is the fail-open contract.
 */
export type RequirementStatus = 'met' | 'unmet' | 'pending' | 'unknown';

export type RequirementTier = 'required' | 'recommended';

export type AccountRole = 'business_client' | 'content_creator' | 'brand';

export interface RequirementState {
  status: RequirementStatus;
  /** User-facing detail, shown for `pending` and some `unmet` states. */
  detail?: string;
}

export interface OrgUnitFacts {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isPrimary: boolean;
}

export interface StripeFacts {
  hasAccount: boolean;
  onboardingComplete: boolean;
}

export interface CreatorFacts {
  skills: readonly string[] | null;
  bio: string | null;
  portfolioUrls: readonly string[] | null;
}

/**
 * Every fact a derivation needs. `undefined` on any field means "we do not know"
 * and MUST produce `unknown` — never `unmet`. A missing answer is not a negative
 * answer.
 */
export interface ReadinessContext {
  role: AccountRole;
  emailVerified: boolean | undefined;
  displayName: string | null | undefined;
  imageUrl: string | null | undefined;
  phoneVerifiedAt: string | null | undefined;
  /** Requirement keys the user dismissed. Empty array when unread — see derivations. */
  dismissed: readonly string[];
  orgUnits: readonly OrgUnitFacts[] | undefined;
  orgMemberCount: number | undefined;
  stripe: StripeFacts | undefined;
  socialActiveCount: number | undefined;
  creator: CreatorFacts | undefined;
}

export interface RequirementDef {
  key: RequirementKey;
  tier: RequirementTier;
  /** Imperative, second person: "Verify your phone". */
  label: string;
  /** One line on what it unlocks: "So restaurants can reach you about a shoot". */
  why: string;
  derive: (ctx: ReadinessContext) => RequirementState;
  resolve: { route: string };
}

export type ResolvedRequirement = Omit<RequirementDef, 'derive'> & {
  state: RequirementState;
};
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/accountReadiness/derivations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ReadinessContext } from './types';
import {
  deriveEmailVerified, deriveProfileBasics, derivePhoneVerified, deriveAddress,
  deriveStripe, deriveSocialLinked, deriveLocations, deriveTeam,
  deriveSkills, deriveBio, derivePortfolio,
} from './derivations';

const base: ReadinessContext = {
  role: 'business_client',
  emailVerified: true,
  displayName: 'Joe\'s Pizza',
  imageUrl: 'https://example.test/logo.png',
  phoneVerifiedAt: '2026-08-23T00:00:00Z',
  dismissed: [],
  orgUnits: [{ id: 'u1', address: '1 Main St, Hoboken NJ', lat: 40.7, lng: -74.0, isPrimary: true }],
  orgMemberCount: 2,
  stripe: { hasAccount: true, onboardingComplete: true },
  socialActiveCount: 1,
  creator: { skills: ['photography'], bio: 'I shoot food.', portfolioUrls: ['https://example.test/1'] },
};

describe('derivations — the fail-open contract', () => {
  it.each([
    ['emailVerified', deriveEmailVerified],
    ['displayName',   deriveProfileBasics],
    ['phoneVerifiedAt', derivePhoneVerified],
    ['orgUnits',      deriveAddress],
    ['stripe',        deriveStripe],
    ['socialActiveCount', deriveSocialLinked],
    ['orgUnits',      deriveLocations],
    ['orgMemberCount', deriveTeam],
    ['creator',       deriveSkills],
    ['creator',       deriveBio],
    ['creator',       derivePortfolio],
  ])('returns unknown, never unmet, when %s is undefined', (field, derive) => {
    const ctx = { ...base, [field]: undefined } as ReadinessContext;
    expect(derive(ctx).status).toBe('unknown');
  });
});

describe('deriveEmailVerified', () => {
  it('met when verified', () => expect(deriveEmailVerified(base).status).toBe('met'));
  it('unmet when not verified', () =>
    expect(deriveEmailVerified({ ...base, emailVerified: false }).status).toBe('unmet'));
});

describe('deriveProfileBasics', () => {
  it('met with name and image', () => expect(deriveProfileBasics(base).status).toBe('met'));
  it('unmet with a whitespace-only name', () =>
    expect(deriveProfileBasics({ ...base, displayName: '   ' }).status).toBe('unmet'));
  it('unmet with no image', () =>
    expect(deriveProfileBasics({ ...base, imageUrl: null }).status).toBe('unmet'));
});

describe('derivePhoneVerified', () => {
  it('met when the anchor is set', () => expect(derivePhoneVerified(base).status).toBe('met'));
  it('unmet when the anchor is null', () =>
    expect(derivePhoneVerified({ ...base, phoneVerifiedAt: null }).status).toBe('unmet'));
});

describe('deriveAddress', () => {
  it('met when the primary unit has address and coordinates', () =>
    expect(deriveAddress(base).status).toBe('met'));
  it('unmet when the address is blank', () =>
    expect(deriveAddress({ ...base, orgUnits: [{ ...base.orgUnits![0], address: '' }] }).status).toBe('unmet'));
  it('unmet when coordinates are missing', () =>
    expect(deriveAddress({ ...base, orgUnits: [{ ...base.orgUnits![0], lat: null }] }).status).toBe('unmet'));
  it('unknown — not unmet — for an account with no org row at all', () =>
    expect(deriveAddress({ ...base, orgUnits: [] }).status).toBe('unknown'));
});

describe('deriveStripe', () => {
  it('met when onboarding is complete', () => expect(deriveStripe(base).status).toBe('met'));
  it('unmet when there is no account', () =>
    expect(deriveStripe({ ...base, stripe: { hasAccount: false, onboardingComplete: false } }).status).toBe('unmet'));
  it('pending — not unmet — while Stripe is still verifying', () => {
    const r = deriveStripe({ ...base, stripe: { hasAccount: true, onboardingComplete: false } });
    expect(r.status).toBe('pending');
    expect(r.detail).toBeTruthy();
  });
});

describe('recommended items are satisfiable by dismissal', () => {
  it('social_linked is met once dismissed, even with no accounts', () =>
    expect(deriveSocialLinked({ ...base, socialActiveCount: 0, dismissed: ['social_linked'] }).status).toBe('met'));
  it('social_linked is met once dismissed, even when the source is unreadable', () =>
    expect(deriveSocialLinked({ ...base, socialActiveCount: undefined, dismissed: ['social_linked'] }).status).toBe('met'));
  it('team is met once dismissed for a genuinely solo restaurant', () =>
    expect(deriveTeam({ ...base, orgMemberCount: 1, dismissed: ['team'] }).status).toBe('met'));
  it('locations is met once dismissed', () =>
    expect(deriveLocations({ ...base, orgUnits: [{ ...base.orgUnits![0], address: null }], dismissed: ['locations'] }).status).toBe('met'));
});

describe('deriveLocations — every unit needs an address, not a count', () => {
  it('met for a single-site restaurant with an address', () =>
    expect(deriveLocations(base).status).toBe('met'));
  it('unmet the moment a second location is added without an address', () =>
    expect(deriveLocations({ ...base, orgUnits: [
      base.orgUnits![0],
      { id: 'u2', address: null, lat: null, lng: null, isPrimary: false },
    ] }).status).toBe('unmet'));
});

describe('deriveTeam', () => {
  it('met with more than one member', () => expect(deriveTeam(base).status).toBe('met'));
  it('unmet with only the owner', () =>
    expect(deriveTeam({ ...base, orgMemberCount: 1 }).status).toBe('unmet'));
});

describe('creator requirements', () => {
  it('skills met when non-empty', () => expect(deriveSkills(base).status).toBe('met'));
  it('skills unmet when empty', () =>
    expect(deriveSkills({ ...base, creator: { ...base.creator!, skills: [] } }).status).toBe('unmet'));
  it('bio unmet when whitespace only', () =>
    expect(deriveBio({ ...base, creator: { ...base.creator!, bio: '  ' } }).status).toBe('unmet'));
  it('portfolio unmet when empty', () =>
    expect(derivePortfolio({ ...base, creator: { ...base.creator!, portfolioUrls: [] } }).status).toBe('unmet'));
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/lib/accountReadiness/derivations.test.ts
```

Expected: FAIL — `Failed to resolve import "./derivations"`.

- [ ] **Step 4: Write the derivations**

Create `src/lib/accountReadiness/derivations.ts`:

```ts
import type { ReadinessContext, RequirementState } from './types';

const MET: RequirementState = { status: 'met' };
const UNMET: RequirementState = { status: 'unmet' };
const UNKNOWN: RequirementState = { status: 'unknown' };

/**
 * Dismissal is checked BEFORE the unknown check on purpose: a dismissed item
 * stays quiet even when its data source is down. Re-surfacing something the
 * user explicitly dismissed, because we could not reach an API, is the one
 * behaviour that turns "recommended" into a nag.
 */
function dismissed(ctx: ReadinessContext, key: string): boolean {
  return ctx.dismissed.includes(key);
}

function fromBoolean(value: boolean | undefined): RequirementState {
  if (value === undefined) return UNKNOWN;
  return value ? MET : UNMET;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function deriveEmailVerified(ctx: ReadinessContext): RequirementState {
  return fromBoolean(ctx.emailVerified);
}

/**
 * Derived from the actual fields, NEVER from `is_completed`. `is_completed` is a
 * flag the onboarding wizard writes — exactly the recorded-vs-actual trap this
 * engine exists to close. Trusting it here would make the whole design incoherent.
 */
export function deriveProfileBasics(ctx: ReadinessContext): RequirementState {
  if (ctx.displayName === undefined || ctx.imageUrl === undefined) return UNKNOWN;
  return nonEmpty(ctx.displayName) && nonEmpty(ctx.imageUrl) ? MET : UNMET;
}

export function derivePhoneVerified(ctx: ReadinessContext): RequirementState {
  if (ctx.phoneVerifiedAt === undefined) return UNKNOWN;
  return ctx.phoneVerifiedAt ? MET : UNMET;
}

export function deriveAddress(ctx: ReadinessContext): RequirementState {
  if (ctx.orgUnits === undefined) return UNKNOWN;
  const primary = ctx.orgUnits.find((u) => u.isPrimary) ?? ctx.orgUnits[0];
  // No org row at all. The auto-org trigger fires on insert only, and backfill
  // coverage for older accounts is assumed rather than proven — so this is
  // "we cannot tell", not "they have no address".
  if (!primary) return UNKNOWN;
  const complete = nonEmpty(primary.address) && primary.lat !== null && primary.lng !== null;
  return complete ? MET : UNMET;
}

export function deriveStripe(ctx: ReadinessContext): RequirementState {
  if (ctx.stripe === undefined) return UNKNOWN;
  if (!ctx.stripe.hasAccount) return UNMET;
  if (!ctx.stripe.onboardingComplete) {
    return { status: 'pending', detail: 'Stripe is still verifying your account.' };
  }
  return MET;
}

export function deriveSocialLinked(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'social_linked')) return MET;
  if (ctx.socialActiveCount === undefined) return UNKNOWN;
  return ctx.socialActiveCount > 0 ? MET : UNMET;
}

/**
 * Not a count test. The auto-org trigger always creates exactly one unit, so
 * "have more than one" would nag every solo restaurant forever. Met when every
 * unit that exists has an address — silent for a single site, unmet the moment
 * someone adds a second and leaves it blank.
 */
export function deriveLocations(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'locations')) return MET;
  if (ctx.orgUnits === undefined) return UNKNOWN;
  if (ctx.orgUnits.length === 0) return UNKNOWN;
  return ctx.orgUnits.every((u) => nonEmpty(u.address)) ? MET : UNMET;
}

export function deriveTeam(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'team')) return MET;
  if (ctx.orgMemberCount === undefined) return UNKNOWN;
  return ctx.orgMemberCount > 1 ? MET : UNMET;
}

export function deriveSkills(ctx: ReadinessContext): RequirementState {
  if (ctx.creator === undefined) return UNKNOWN;
  return (ctx.creator.skills?.length ?? 0) > 0 ? MET : UNMET;
}

export function deriveBio(ctx: ReadinessContext): RequirementState {
  if (ctx.creator === undefined) return UNKNOWN;
  return nonEmpty(ctx.creator.bio) ? MET : UNMET;
}

export function derivePortfolio(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'portfolio')) return MET;
  if (ctx.creator === undefined) return UNKNOWN;
  return (ctx.creator.portfolioUrls?.length ?? 0) > 0 ? MET : UNMET;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/lib/accountReadiness/derivations.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accountReadiness/types.ts src/lib/accountReadiness/derivations.ts src/lib/accountReadiness/derivations.test.ts
git commit -m "feat: add pure requirement derivations for the account completeness engine"
```

---

### Task 4: The role requirement table and action registry

**Files:**
- Create: `src/lib/accountReadiness/requirements.ts`
- Create: `src/lib/accountReadiness/actions.ts`
- Test: `src/lib/accountReadiness/registry.test.ts`

**Interfaces:**
- Consumes: `RequirementDef`, `AccountRole`, `RequirementKey` and all `derive*` functions from Task 3.
- Produces: `ROLE_REQUIREMENTS: Record<AccountRole, readonly RequirementDef[]>`; `GatedAction` (`'publish_campaign' | 'apply_campaign' | 'accept_offer'`); `ACTION_REQUIREMENTS: Record<GatedAction, readonly RequirementKey[]>`; `ACTION_ROLES: Record<GatedAction, readonly AccountRole[]>`; `GATE_RENDERABLE_KEYS: readonly RequirementKey[]`. Tasks 5, 6 and 7 depend on these.

- [ ] **Step 1: Write the failing registry consistency tests**

Create `src/lib/accountReadiness/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ROLE_REQUIREMENTS } from './requirements';
import { ACTION_REQUIREMENTS, ACTION_ROLES, GATE_RENDERABLE_KEYS, type GatedAction } from './actions';
import type { AccountRole } from './types';

const ROLES: AccountRole[] = ['business_client', 'content_creator', 'brand'];
const ACTIONS = Object.keys(ACTION_REQUIREMENTS) as GatedAction[];

describe('registry consistency', () => {
  /**
   * The failure this prevents: an action demanding a key its role never has is a
   * permanent, silent block — a user who simply cannot publish, with no error to
   * search for and nothing in the logs.
   */
  it('every key an action demands exists for every role that can perform it', () => {
    for (const action of ACTIONS) {
      for (const role of ACTION_ROLES[action]) {
        const available = new Set(ROLE_REQUIREMENTS[role].map((r) => r.key));
        for (const key of ACTION_REQUIREMENTS[action]) {
          expect(
            available.has(key),
            `action "${action}" demands "${key}", which role "${role}" does not have`,
          ).toBe(true);
        }
      }
    }
  });

  /**
   * Forcing function: the gate renders copy per requirement key. Adding a key to
   * an action without adding copy for it would render a blocking card with no
   * explanation. A later slice adding `address` must add its copy at the same time.
   */
  it('every key an action demands is renderable by the gate', () => {
    for (const action of ACTIONS) {
      for (const key of ACTION_REQUIREMENTS[action]) {
        expect(GATE_RENDERABLE_KEYS).toContain(key);
      }
    }
  });

  it('every action names at least one role', () => {
    for (const action of ACTIONS) expect(ACTION_ROLES[action].length).toBeGreaterThan(0);
  });

  it('requirement keys are unique within a role', () => {
    for (const role of ROLES) {
      const keys = ROLE_REQUIREMENTS[role].map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every requirement has a non-empty label, why and resolve route', () => {
    for (const role of ROLES) {
      for (const req of ROLE_REQUIREMENTS[role]) {
        expect(req.label.trim().length, `${role}/${req.key} label`).toBeGreaterThan(0);
        expect(req.why.trim().length, `${role}/${req.key} why`).toBeGreaterThan(0);
        expect(req.resolve.route.startsWith('/'), `${role}/${req.key} route`).toBe(true);
      }
    }
  });

  it('slice 1 gates on stripe only — nothing without a shipped capture flow', () => {
    for (const action of ACTIONS) {
      expect(ACTION_REQUIREMENTS[action]).toEqual(['stripe']);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/accountReadiness/registry.test.ts
```

Expected: FAIL — `Failed to resolve import "./requirements"`.

- [ ] **Step 3: Write the action registry**

Create `src/lib/accountReadiness/actions.ts`:

```ts
import type { AccountRole, RequirementKey } from './types';

export type GatedAction = 'publish_campaign' | 'apply_campaign' | 'accept_offer';

/**
 * Which requirement keys each action demands. Changing what publishing demands
 * is a one-line edit here, not a hunt through call sites — and Donny answers
 * "why can't I publish?" from this same table, so the gate and the assistant
 * cannot drift apart.
 *
 * Slice 1 demands `stripe` and nothing else: that is exactly today's behaviour,
 * refactored. Adding a key here before its capture flow exists would brick the
 * action for everyone (spec §11).
 */
export const ACTION_REQUIREMENTS: Record<GatedAction, readonly RequirementKey[]> = {
  publish_campaign: ['stripe'],
  apply_campaign: ['stripe'],
  accept_offer: ['stripe'],
};

/** Which roles can perform each action. Drives the registry consistency test. */
export const ACTION_ROLES: Record<GatedAction, readonly AccountRole[]> = {
  publish_campaign: ['business_client', 'brand'],
  apply_campaign: ['content_creator'],
  accept_offer: ['content_creator'],
};

/**
 * Keys the gate has blocking copy for. A key may only be added to
 * ACTION_REQUIREMENTS once it appears here — enforced by test.
 */
export const GATE_RENDERABLE_KEYS: readonly RequirementKey[] = ['stripe'];
```

- [ ] **Step 4: Write the role requirement table**

Create `src/lib/accountReadiness/requirements.ts`:

```ts
import type { AccountRole, RequirementDef } from './types';
import {
  deriveEmailVerified, deriveProfileBasics, derivePhoneVerified, deriveAddress,
  deriveStripe, deriveSocialLinked, deriveLocations, deriveTeam,
  deriveSkills, deriveBio, derivePortfolio,
} from './derivations';

const BUSINESS_SETTINGS = '/dashboard/business/settings';
const CREATOR_SETTINGS = '/dashboard/creator/settings';
const BRAND_SETTINGS = '/dashboard/brand/settings';

const emailVerified = (route: string): RequirementDef => ({
  key: 'email_verified', tier: 'required',
  label: 'Confirm your email',
  why: 'So we can send campaign updates and receipts that actually reach you.',
  derive: deriveEmailVerified, resolve: { route },
});

const phoneVerified = (route: string): RequirementDef => ({
  key: 'phone_verified', tier: 'required',
  label: 'Verify your phone',
  why: 'So people you work with can reach you when a shoot is happening.',
  derive: derivePhoneVerified, resolve: { route },
});

const stripe = (route: string, why: string): RequirementDef => ({
  key: 'stripe', tier: 'required',
  label: 'Set up payments',
  why,
  derive: deriveStripe, resolve: { route: `${route}?section=payments` },
});

const socialLinked = (route: string): RequirementDef => ({
  key: 'social_linked', tier: 'recommended',
  label: 'Link a social account',
  why: 'Optional, but it is how posts go out without you doing it by hand.',
  derive: deriveSocialLinked, resolve: { route: `${route}?section=social` },
});

export const ROLE_REQUIREMENTS: Record<AccountRole, readonly RequirementDef[]> = {
  business_client: [
    emailVerified(BUSINESS_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your name and logo',
      why: 'Creators decide whether to work with you from this.',
      derive: deriveProfileBasics, resolve: { route: BUSINESS_SETTINGS },
    },
    phoneVerified(BUSINESS_SETTINGS),
    {
      key: 'address', tier: 'required',
      label: 'Add your address',
      why: 'We match you with creators near you — without it, nobody local finds you.',
      derive: deriveAddress, resolve: { route: `${BUSINESS_SETTINGS}?section=locations` },
    },
    stripe(BUSINESS_SETTINGS, 'So you can pay creators the moment work is approved.'),
    socialLinked(BUSINESS_SETTINGS),
    {
      key: 'locations', tier: 'recommended',
      label: 'Finish your locations',
      why: 'Each location needs an address to be matched with creators nearby.',
      derive: deriveLocations, resolve: { route: `${BUSINESS_SETTINGS}?section=locations` },
    },
    {
      key: 'team', tier: 'recommended',
      label: 'Invite your team',
      why: 'So you are not the only person who can approve content.',
      derive: deriveTeam, resolve: { route: `${BUSINESS_SETTINGS}?section=team` },
    },
  ],

  content_creator: [
    emailVerified(CREATOR_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your name and photo',
      why: 'Businesses decide whether to hire you from this.',
      derive: deriveProfileBasics, resolve: { route: CREATOR_SETTINGS },
    },
    phoneVerified(CREATOR_SETTINGS),
    {
      key: 'skills', tier: 'required',
      label: 'Pick what you create',
      why: 'Businesses filter by these to find you.',
      derive: deriveSkills, resolve: { route: CREATOR_SETTINGS },
    },
    {
      key: 'bio', tier: 'required',
      label: 'Describe yourself',
      why: 'One line about your work, shown on every application you send.',
      derive: deriveBio, resolve: { route: CREATOR_SETTINGS },
    },
    stripe(CREATOR_SETTINGS, 'So you get paid to your bank account when work is approved.'),
    socialLinked(CREATOR_SETTINGS),
    {
      key: 'portfolio', tier: 'recommended',
      label: 'Show your best work',
      why: 'Creators with a portfolio get chosen more often.',
      derive: derivePortfolio, resolve: { route: CREATOR_SETTINGS },
    },
  ],

  brand: [
    emailVerified(BRAND_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your brand name and logo',
      why: 'Creators decide whether to work with you from this.',
      derive: deriveProfileBasics, resolve: { route: BRAND_SETTINGS },
    },
    phoneVerified(BRAND_SETTINGS),
    stripe(BRAND_SETTINGS, 'So you can fund sponsorships without a delay.'),
    socialLinked(BRAND_SETTINGS),
  ],
};
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/lib/accountReadiness/registry.test.ts
```

Expected: PASS. Note the brand role deliberately has **no** `address`, `locations` or `team` — a brand's primary org unit is a `product`, not a location.

- [ ] **Step 6: Commit**

```bash
git add src/lib/accountReadiness/requirements.ts src/lib/accountReadiness/actions.ts src/lib/accountReadiness/registry.test.ts
git commit -m "feat: add role requirement table and action registry with consistency tests"
```

---

### Task 5: `computeAccountReadiness`

**Files:**
- Create: `src/lib/accountReadiness/index.ts`
- Test: `src/lib/accountReadiness/index.test.ts`

**Interfaces:**
- Consumes: `ROLE_REQUIREMENTS` (Task 4), `ACTION_REQUIREMENTS` (Task 4), `ReadinessContext` and `ResolvedRequirement` (Task 3).
- Produces: `computeAccountReadiness(ctx: ReadinessContext): AccountReadiness`, where `AccountReadiness` is `{ requirements: ResolvedRequirement[]; required: ResolvedRequirement[]; recommended: ResolvedRequirement[]; outstanding: ResolvedRequirement[]; missingFor(action): ResolvedRequirement[]; isBlocked(action): boolean }`. Tasks 6–9 all consume this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/accountReadiness/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeAccountReadiness } from './index';
import type { ReadinessContext } from './types';

const complete: ReadinessContext = {
  role: 'content_creator',
  emailVerified: true,
  displayName: 'Diana P.',
  imageUrl: 'https://example.test/a.png',
  phoneVerifiedAt: '2026-08-23T00:00:00Z',
  dismissed: [],
  orgUnits: undefined,
  orgMemberCount: undefined,
  stripe: { hasAccount: true, onboardingComplete: true },
  socialActiveCount: 1,
  creator: { skills: ['photography'], bio: 'I shoot food.', portfolioUrls: ['https://example.test/1'] },
};

describe('computeAccountReadiness', () => {
  it('resolves every requirement for the role and drops the derive function', () => {
    const r = computeAccountReadiness(complete);
    expect(r.requirements.length).toBeGreaterThan(0);
    expect(r.requirements.every((x) => 'state' in x)).toBe(true);
    expect((r.requirements[0] as unknown as Record<string, unknown>).derive).toBeUndefined();
  });

  it('a fully complete account has nothing outstanding', () => {
    expect(computeAccountReadiness(complete).outstanding).toEqual([]);
  });

  it('splits required from recommended', () => {
    const r = computeAccountReadiness(complete);
    expect(r.required.some((x) => x.key === 'stripe')).toBe(true);
    expect(r.recommended.some((x) => x.key === 'social_linked')).toBe(true);
  });

  it('blocks an action when a demanded requirement is unmet', () => {
    const r = computeAccountReadiness({ ...complete, stripe: { hasAccount: false, onboardingComplete: false } });
    expect(r.isBlocked('apply_campaign')).toBe(true);
    expect(r.missingFor('apply_campaign').map((x) => x.key)).toEqual(['stripe']);
  });

  it('blocks an action while Stripe is pending, preserving current behaviour', () => {
    const r = computeAccountReadiness({ ...complete, stripe: { hasAccount: true, onboardingComplete: false } });
    expect(r.isBlocked('apply_campaign')).toBe(true);
    expect(r.missingFor('apply_campaign')[0].state.status).toBe('pending');
  });

  /** The contract that must not break. */
  it('NEVER blocks on unknown — fail-open', () => {
    const r = computeAccountReadiness({ ...complete, stripe: undefined });
    expect(r.missingFor('apply_campaign')).toEqual([]);
    expect(r.isBlocked('apply_campaign')).toBe(false);
  });

  it('unknown requirements are not counted as outstanding', () => {
    const r = computeAccountReadiness({ ...complete, socialActiveCount: undefined });
    expect(r.outstanding.some((x) => x.key === 'social_linked')).toBe(false);
  });

  it('an action demanding a key the role lacks does not block', () => {
    // A creator has no `address` requirement. Guarded by the Task 4 consistency
    // test, but proven here too: an unknown key must never become a silent block.
    const r = computeAccountReadiness(complete);
    expect(r.isBlocked('publish_campaign')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/lib/accountReadiness/index.test.ts
```

Expected: FAIL — `computeAccountReadiness is not exported`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/accountReadiness/index.ts`:

```ts
import { ROLE_REQUIREMENTS } from './requirements';
import { ACTION_REQUIREMENTS, type GatedAction } from './actions';
import type { ReadinessContext, ResolvedRequirement } from './types';

export * from './types';
export * from './actions';
export { ROLE_REQUIREMENTS } from './requirements';

export interface AccountReadiness {
  /** Every requirement for the role, resolved. */
  requirements: ResolvedRequirement[];
  required: ResolvedRequirement[];
  recommended: ResolvedRequirement[];
  /** Anything actionable: unmet or pending. Deliberately excludes `unknown`. */
  outstanding: ResolvedRequirement[];
  missingFor: (action: GatedAction) => ResolvedRequirement[];
  isBlocked: (action: GatedAction) => boolean;
}

/** Actionable means we have a definitive answer that something is not done. */
function isActionable(req: ResolvedRequirement): boolean {
  return req.state.status === 'unmet' || req.state.status === 'pending';
}

export function computeAccountReadiness(ctx: ReadinessContext): AccountReadiness {
  const requirements: ResolvedRequirement[] = ROLE_REQUIREMENTS[ctx.role].map(
    ({ derive, ...rest }) => ({ ...rest, state: derive(ctx) }),
  );

  const byKey = new Map(requirements.map((r) => [r.key, r]));

  const missingFor = (action: GatedAction): ResolvedRequirement[] =>
    ACTION_REQUIREMENTS[action]
      .map((key) => byKey.get(key))
      // A key the role does not have resolves to undefined and is dropped rather
      // than treated as missing. The Task 4 consistency test makes this
      // unreachable in practice; this keeps it fail-open if it ever regresses.
      .filter((r): r is ResolvedRequirement => r !== undefined)
      .filter(isActionable);

  return {
    requirements,
    required: requirements.filter((r) => r.tier === 'required'),
    recommended: requirements.filter((r) => r.tier === 'recommended'),
    outstanding: requirements.filter(isActionable),
    missingFor,
    isBlocked: (action) => missingFor(action).length > 0,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/accountReadiness/
```

Expected: PASS — all three test files green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/accountReadiness/index.ts src/lib/accountReadiness/index.test.ts
git commit -m "feat: add computeAccountReadiness combining requirements, tiers and action gating"
```

---

### Task 6: `useAccountReadiness` hook

Assembles `ReadinessContext` from React Query reads that already exist. The `liveStripe` option implements the split from spec §5.2.

**Files:**
- Create: `src/hooks/useAccountReadiness.ts`
- Test: `src/hooks/useAccountReadiness.test.tsx`

**Interfaces:**
- Consumes: `computeAccountReadiness`, `ReadinessContext`, `AccountRole` (Task 5); `useAuth`, `useOrgUnits`, `useLocationSocialAccounts`, `supabase`.
- Produces: `useAccountReadiness(role: AccountRole, opts?: { liveStripe?: boolean; enabled?: boolean }): AccountReadiness & { dismiss: (key: RequirementKey) => void }`. Tasks 7–9 consume this.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useAccountReadiness.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const auth = vi.hoisted(() => ({ current: null as unknown as Record<string, unknown> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.current }));
vi.mock('@/hooks/useOrgData', () => ({ useOrgUnits: () => ({ data: undefined }) }));
vi.mock('@/hooks/outstand/useLocationSocialAccounts', () => ({
  useLocationSocialAccounts: () => ({ data: undefined }),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { useAccountReadiness } from './useAccountReadiness';

describe('useAccountReadiness', () => {
  it('fails open across the board when every source is unresolved', () => {
    auth.current = { user: { id: 'u1' }, profile: { role: 'content_creator' } };
    const { result } = renderHook(() => useAccountReadiness('content_creator'));

    // Nothing definitive is known, so nothing is actionable and nothing blocks.
    expect(result.current.outstanding).toEqual([]);
    expect(result.current.isBlocked('apply_campaign')).toBe(false);
    expect(result.current.requirements.every((r) => r.state.status === 'unknown')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/hooks/useAccountReadiness.test.tsx
```

Expected: FAIL — `Failed to resolve import "./useAccountReadiness"`.

- [ ] **Step 3: Write the hook**

Create `src/hooks/useAccountReadiness.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import {
  computeAccountReadiness,
  type AccountReadiness,
  type AccountRole,
  type ReadinessContext,
  type RequirementKey,
  type StripeFacts,
} from '@/lib/accountReadiness';

interface Options {
  /**
   * true  → the live Stripe edge function (authoritative, costs a Stripe API call).
   * false → the mirrored stripe_onboarding_complete column (cheap, may lag a webhook).
   *
   * The split is by consequence: a checklist that is briefly stale is harmless,
   * a gate that is stale costs money. See spec §5.2.
   */
  liveStripe?: boolean;
  enabled?: boolean;
}

export type UseAccountReadiness = AccountReadiness & {
  dismiss: (key: RequirementKey) => void;
};

export function useAccountReadiness(role: AccountRole, opts: Options = {}): UseAccountReadiness {
  const { liveStripe = false, enabled = true } = opts;
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const isCreator = role === 'content_creator';
  const table = isCreator ? 'creator_profiles' : 'business_profiles';

  const detail = useQuery({
    queryKey: ['account-readiness-detail', userId, role],
    queryFn: async () => {
      const [{ data: prof }, { data: roleProfile }, { count: memberCount }] = await Promise.all([
        supabase.from('profiles')
          .select('email_verified, phone_verified_at, dismissed_requirements, org_id')
          .eq('id', userId!).maybeSingle(),
        supabase.from(table)
          .select(isCreator
            ? 'creator_name, avatar_url, bio, skills, portfolio_urls, stripe_account_id, stripe_onboarding_complete'
            : 'business_name, logo_url, stripe_account_id, stripe_onboarding_complete')
          .eq('user_id', userId!).maybeSingle(),
        supabase.from('org_members')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', profile?.org_id ?? '00000000-0000-0000-0000-000000000000')
          .eq('invitation_status', 'active'),
      ]);
      return { prof, roleProfile, memberCount: memberCount ?? undefined };
    },
    enabled: enabled && !!userId,
    staleTime: 60_000,
  });

  const liveStripeQuery = useQuery({
    queryKey: ['payout-status', isCreator ? 'creator' : 'business', null],
    queryFn: async (): Promise<StripeFacts> => {
      const fn = isCreator ? 'check-creator-payout-status' : 'check-restaurant-payout-status';
      const { data, error } = await supabase.functions.invoke(fn);
      if (error) throw error;
      const d = data as { hasAccount: boolean; onboardingComplete: boolean };
      return { hasAccount: d.hasAccount, onboardingComplete: d.onboardingComplete };
    },
    enabled: enabled && !!userId && liveStripe,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: orgUnits } = useOrgUnits(profile?.org_id);
  const { data: socialAccounts } = useLocationSocialAccounts(userId, null);

  const readiness = useMemo<AccountReadiness>(() => {
    const prof = detail.data?.prof as Record<string, unknown> | null | undefined;
    const rp = detail.data?.roleProfile as Record<string, unknown> | null | undefined;

    // Mirrored Stripe facts, used when liveStripe is false.
    const mirrored: StripeFacts | undefined = rp
      ? {
          hasAccount: !!rp.stripe_account_id,
          onboardingComplete: !!rp.stripe_onboarding_complete,
        }
      : undefined;

    const ctx: ReadinessContext = {
      role,
      emailVerified: prof ? !!prof.email_verified : undefined,
      displayName: rp ? ((rp.creator_name ?? rp.business_name) as string | null) : undefined,
      imageUrl: rp ? ((rp.avatar_url ?? rp.logo_url) as string | null) : undefined,
      phoneVerifiedAt: prof ? ((prof.phone_verified_at ?? null) as string | null) : undefined,
      // An unreadable dismissal list means "nothing dismissed": showing a
      // dismissed recommendation is a small annoyance, hiding a real one is worse.
      dismissed: (prof?.dismissed_requirements as string[] | null) ?? [],
      orgUnits: orgUnits?.map((u) => ({
        id: u.id, address: u.address, lat: u.lat, lng: u.lng, isPrimary: u.is_primary,
      })),
      orgMemberCount: detail.data?.memberCount,
      stripe: liveStripe ? liveStripeQuery.data : mirrored,
      socialActiveCount: socialAccounts?.length,
      creator: isCreator && rp
        ? {
            skills: (rp.skills as string[] | null) ?? null,
            bio: (rp.bio as string | null) ?? null,
            portfolioUrls: (rp.portfolio_urls as string[] | null) ?? null,
          }
        : undefined,
    };
    return computeAccountReadiness(ctx);
  }, [role, isCreator, liveStripe, detail.data, liveStripeQuery.data, orgUnits, socialAccounts]);

  const dismiss = useCallback(
    (key: RequirementKey) => {
      if (!userId) return;
      const current = ((detail.data?.prof as Record<string, unknown> | undefined)
        ?.dismissed_requirements as string[] | null) ?? [];
      if (current.includes(key)) return;
      void supabase
        .from('profiles')
        .update({ dismissed_requirements: [...current, key] })
        .eq('id', userId)
        .then(({ error }) => {
          if (error) { console.error('Failed to dismiss requirement:', error); return; }
          void queryClient.invalidateQueries({ queryKey: ['account-readiness-detail', userId, role] });
        });
    },
    [userId, role, detail.data, queryClient],
  );

  return { ...readiness, dismiss };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/hooks/useAccountReadiness.test.tsx
npm run typecheck
```

Expected: PASS, and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAccountReadiness.ts src/hooks/useAccountReadiness.test.tsx
git commit -m "feat: add useAccountReadiness with the checklist/gate Stripe read split"
```

---

### Task 7: Move `ReadinessGate` onto the action registry

**Files:**
- Modify: `src/components/ReadinessGate.tsx`
- Modify: `src/components/ReadinessGate.test.tsx`
- Modify: `src/components/applications/DetailedApplicationCard.tsx:232`
- Modify: `src/pages/CampaignDetailsPage.tsx:383`

**Interfaces:**
- Consumes: `useAccountReadiness` (Task 6), `GatedAction` (Task 4).
- Produces: `<ReadinessGate action={GatedAction} role={'creator'|'business'} mode={'hard'|'soft'} />`. The `require` prop is **removed**.

- [ ] **Step 1: Rewrite the gate**

Replace `src/components/ReadinessGate.tsx` entirely:

```tsx
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import { useReadinessGateEnabled } from '@/hooks/useReadinessGateEnabled';
import { ReadinessChecklistCard } from '@/components/ReadinessChecklistCard';
import type { AccountRole } from '@/lib/accountReadiness';
import type { GatedAction } from '@/lib/accountReadiness';

export type ReadinessRole = 'creator' | 'business';

interface ReadinessGateProps {
  role: ReadinessRole;
  /** What the user is trying to do. The keys it demands live in ACTION_REQUIREMENTS. */
  action: GatedAction;
  mode: 'hard' | 'soft';
  inline?: boolean;
  children: ReactNode;
  softHint?: ReactNode;
}

const ACCOUNT_ROLE: Record<ReadinessRole, AccountRole> = {
  creator: 'content_creator',
  business: 'business_client',
};

export function ReadinessGate({ role, action, mode, children, softHint }: ReadinessGateProps) {
  const enabled = useReadinessGateEnabled();
  const navigate = useNavigate();
  // liveStripe: the gate is the surface where being wrong costs money, so it
  // pays for the authoritative read rather than trusting the mirrored column.
  const r = useAccountReadiness(ACCOUNT_ROLE[role], { liveStripe: true, enabled });

  if (!enabled) return <>{children}</>;

  const missing = r.missingFor(action);
  const blocked = missing.length > 0;

  if (mode === 'soft') {
    return <>{children}{blocked && (softHint ?? null)}</>;
  }

  if (!blocked) return <>{children}</>;

  const first = missing[0];
  const status = first.state.status === 'pending' ? 'verification_pending' : 'no_account';
  return (
    <ReadinessChecklistCard
      status={status}
      role={role}
      onFinishSetup={() => navigate(first.resolve.route)}
    />
  );
}
```

- [ ] **Step 2: Update the gate tests**

Replace the body of `src/components/ReadinessGate.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useReadinessGateEnabled', () => ({ useReadinessGateEnabled: () => true }));
const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ReadinessGate } from './ReadinessGate';

function setMissing(missing: any[]) {
  readiness.current = {
    requirements: [], required: [], recommended: [], outstanding: missing,
    missingFor: () => missing,
    isBlocked: () => missing.length > 0,
    dismiss: () => {},
  };
}

const stripeUnmet = {
  key: 'stripe', tier: 'required', label: 'Set up payments', why: 'So you get paid.',
  resolve: { route: '/dashboard/creator/settings?section=payments' },
  state: { status: 'unmet' },
};
const stripePending = { ...stripeUnmet, state: { status: 'pending', detail: 'Stripe is still verifying.' } };

describe('ReadinessGate', () => {
  it('renders children when nothing is missing', () => {
    setMissing([]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });

  /** The fail-open contract: unknown never reaches missingFor, so nothing blocks. */
  it('renders children (fail-open) when sources are unresolved', () => {
    setMissing([]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });

  it('blocks and shows the checklist card on a definitive unmet', () => {
    setMissing([stripeUnmet]);
    const { queryByTestId, queryByRole } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeNull();
    expect(queryByRole('status')).toBeTruthy();
  });

  it('shows the verifying copy — not the no-account copy — while Stripe is pending', () => {
    setMissing([stripePending]);
    const { getByRole } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="hard"><button data-testid="commit">Apply</button></ReadinessGate>,
    );
    expect(getByRole('status').textContent).toContain('being verified');
  });

  it('soft mode never hides children', () => {
    setMissing([stripeUnmet]);
    const { queryByTestId } = render(
      <ReadinessGate role="creator" action="apply_campaign" mode="soft"><button data-testid="commit">Boost</button></ReadinessGate>,
    );
    expect(queryByTestId('commit')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/components/ReadinessGate.test.tsx
```

Expected: FAIL initially if the gate file was not yet saved; once saved, PASS. Run before and after Step 1 if executing strictly TDD.

- [ ] **Step 4: Update the two call sites**

In `src/components/applications/DetailedApplicationCard.tsx` line 232, change:

```tsx
<ReadinessGate role="creator" require={{ stripe: true }} mode="hard">
```

to:

```tsx
<ReadinessGate role="creator" action="accept_offer" mode="hard">
```

In `src/pages/CampaignDetailsPage.tsx` line 383, change:

```tsx
<ReadinessGate role="creator" require={{ stripe: true }} mode="hard" inline>
```

to:

```tsx
<ReadinessGate role="creator" action="apply_campaign" mode="hard" inline>
```

- [ ] **Step 5: Verify no `require=` usage survives**

```bash
grep -rn "ReadinessGate" src | grep "require=" || echo "clean"
```

Expected: `clean`.

- [ ] **Step 6: Run tests, typecheck and commit**

```bash
npx vitest run src/components/ReadinessGate.test.tsx
npm run typecheck
git add src/components/ReadinessGate.tsx src/components/ReadinessGate.test.tsx src/components/applications/DetailedApplicationCard.tsx src/pages/CampaignDetailsPage.tsx
git commit -m "refactor: drive ReadinessGate from the action registry instead of a hardcoded require shape"
```

---

### Task 8: Drive `MissionChecklist` from derived state

**Files:**
- Modify: `src/components/first-run/MissionChecklist.tsx`
- Modify: `src/components/first-run/FirstRunDashboard.tsx`
- Test: `src/components/first-run/MissionChecklist.test.tsx`

**Interfaces:**
- Consumes: `useAccountReadiness` (Task 6), `ResolvedRequirement` (Task 3).
- Produces: `<MissionChecklist role={UserRole} onSkip={() => void} />` — the `missions` and `onMissionGo` props are removed; the component resolves its own rows.

- [ ] **Step 1: Write the failing test**

Create `src/components/first-run/MissionChecklist.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { MissionChecklist } from './MissionChecklist';

function req(key: string, status: string, tier = 'required') {
  return { key, tier, label: `Do ${key}`, why: `Because ${key}`,
    resolve: { route: `/x/${key}` }, state: { status } };
}
function setRequirements(requirements: any[]) {
  readiness.current = {
    requirements, required: requirements.filter((r) => r.tier === 'required'),
    recommended: requirements.filter((r) => r.tier === 'recommended'),
    outstanding: requirements.filter((r) => ['unmet', 'pending'].includes(r.state.status)),
    missingFor: () => [], isBlocked: () => false, dismiss: vi.fn(),
  };
}

describe('MissionChecklist', () => {
  /**
   * The behaviour change: the old component locked item N until N-1 was done.
   * With derived truth that is a lie — someone can finish Stripe before ever
   * browsing inspiration.
   */
  it('does not lock a later item just because an earlier one is unmet', () => {
    setRequirements([req('profile_basics', 'unmet'), req('stripe', 'met')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('Do stripe').closest('[data-requirement-row]')?.getAttribute('data-status')).toBe('met');
  });

  it('renders unknown as a neutral checking row, never as a failure', () => {
    setRequirements([req('stripe', 'unknown')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    const row = getByText('Do stripe').closest('[data-requirement-row]');
    expect(row?.getAttribute('data-status')).toBe('unknown');
    expect(row?.className).not.toContain('red');
  });

  it('counts only definitive met items in the progress tally', () => {
    setRequirements([req('a', 'met'), req('b', 'unknown'), req('c', 'unmet')]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('1 / 3')).toBeTruthy();
  });

  it('shows the pending detail rather than a generic unmet state', () => {
    const pending = { ...req('stripe', 'pending'), state: { status: 'pending', detail: 'Stripe is still verifying.' } };
    setRequirements([pending]);
    const { getByText } = render(<MissionChecklist role="content_creator" onSkip={() => {}} />);
    expect(getByText('Stripe is still verifying.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/first-run/MissionChecklist.test.tsx
```

Expected: FAIL — the component still requires a `missions` prop.

- [ ] **Step 3: Rewrite `MissionChecklist`**

Replace `src/components/first-run/MissionChecklist.tsx` entirely:

```tsx
import { useNavigate } from 'react-router-dom';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import type { AccountRole, ResolvedRequirement } from '@/lib/accountReadiness';
import { MissionItem } from './MissionItem';

interface MissionChecklistProps {
  role: AccountRole;
  onSkip: () => void;
}

/** Maps a derived status onto MissionItem's visual vocabulary. */
function itemStatus(req: ResolvedRequirement): 'active' | 'locked' | 'completed' {
  if (req.state.status === 'met') return 'completed';
  // `unknown` is deliberately 'locked' — the muted, non-actionable treatment.
  // It must never look like a failure and must never offer a GO button, because
  // we do not actually know there is anything to do.
  if (req.state.status === 'unknown') return 'locked';
  return 'active';
}

export function MissionChecklist({ role, onSkip }: MissionChecklistProps) {
  const navigate = useNavigate();
  const { requirements } = useAccountReadiness(role);
  const accentColor = role === 'brand' ? 'pink' : 'teal';

  // Only a definitive `met` counts. A green tally built on unreachable sources
  // is the exact drift this engine exists to prevent.
  const completedCount = requirements.filter((r) => r.state.status === 'met').length;

  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-bold text-gray-900">Your Missions</span>
        <span className={`text-xs font-semibold ${accentColor === 'pink' ? 'text-pink-500' : 'text-teal-500'}`}>
          {completedCount} / {requirements.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {requirements.map((req) => {
          const status = itemStatus(req);
          return (
            <div key={req.key} data-requirement-row data-status={req.state.status}>
              <MissionItem
                emoji={req.tier === 'recommended' ? '✨' : '📋'}
                title={req.label}
                subtitle={req.state.detail ?? req.why}
                status={status}
                accentColor={accentColor}
                onGo={status === 'active' ? () => navigate(req.resolve.route) : undefined}
              />
            </div>
          );
        })}
      </div>
      <button
        onClick={onSkip}
        className="w-full text-center text-xs text-gray-400 mt-4 hover:text-gray-600 transition-colors"
      >
        Skip for now
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Update `FirstRunDashboard` to the new props**

In `src/components/first-run/FirstRunDashboard.tsx`, delete the `handleMissionGo` function entirely (routing now comes from each requirement's `resolve.route`), and change the `MissionChecklist` usage to:

```tsx
<MissionChecklist role={role} onSkip={onSkip} />
```

Remove the now-unused `missions` and `onCompleteMission` props from `FirstRunDashboardProps` and from the three call sites in `src/pages/BusinessDashboard.tsx`, `src/pages/CreatorDashboard.tsx` and `src/pages/BrandDashboard.tsx`, keeping `isFirstRun` and `skipMissions` from `useFirstRunMissions`.

- [ ] **Step 5: Run tests, typecheck and commit**

```bash
npx vitest run src/components/first-run/
npm run typecheck
git add src/components/first-run/ src/pages/BusinessDashboard.tsx src/pages/CreatorDashboard.tsx src/pages/BrandDashboard.tsx
git commit -m "refactor: drive the first-run checklist from derived requirements and drop the sequential lock"
```

---

### Task 9: Render outstanding requirements in the attention list

**Files:**
- Create: `src/components/account/AccountChecklistRows.tsx`
- Test: `src/components/account/AccountChecklistRows.test.tsx`
- Modify: `src/components/donny/DonnyHome.tsx`
- Modify: `src/components/donny/CreatorDonnyHome.tsx`

**Interfaces:**
- Consumes: `useAccountReadiness` (Task 6).
- Produces: `<AccountChecklistRows role={AccountRole} />`, which renders `null` when there is nothing outstanding — required by `NeedsAttentionSection`'s slot contract.

- [ ] **Step 1: Write the failing test**

Create `src/components/account/AccountChecklistRows.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const readiness = vi.hoisted(() => ({ current: null as any }));
vi.mock('@/hooks/useAccountReadiness', () => ({ useAccountReadiness: () => readiness.current }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { AccountChecklistRows } from './AccountChecklistRows';

function req(key: string, status: string, tier = 'required') {
  return { key, tier, label: `Do ${key}`, why: `Because ${key}`,
    resolve: { route: `/x/${key}` }, state: { status } };
}
function setOutstanding(outstanding: any[]) {
  readiness.current = {
    requirements: outstanding, required: [], recommended: [],
    outstanding, missingFor: () => [], isBlocked: () => false, dismiss: vi.fn(),
  };
}

describe('AccountChecklistRows', () => {
  /**
   * NeedsAttentionSection hides itself via CSS :has() only when its slots are
   * genuinely EMPTY. A child rendering an empty container resurrects the header
   * around a blank frame — the documented failure mode.
   */
  it('renders exactly null when nothing is outstanding', () => {
    setOutstanding([]);
    const { container } = render(<AccountChecklistRows role="business_client" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders exactly null when everything outstanding is unknown', () => {
    setOutstanding([]); // unknown never reaches `outstanding`
    const { container } = render(<AccountChecklistRows role="business_client" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a row per outstanding requirement', () => {
    setOutstanding([req('stripe', 'unmet'), req('address', 'unmet')]);
    const { getByText } = render(<AccountChecklistRows role="business_client" />);
    expect(getByText('Do stripe')).toBeTruthy();
    expect(getByText('Do address')).toBeTruthy();
  });

  it('offers dismiss on recommended rows only', () => {
    setOutstanding([req('stripe', 'unmet', 'required'), req('team', 'unmet', 'recommended')]);
    const { getAllByRole } = render(<AccountChecklistRows role="business_client" />);
    const dismissButtons = getAllByRole('button').filter((b) => b.getAttribute('aria-label')?.startsWith('Dismiss'));
    expect(dismissButtons).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/account/AccountChecklistRows.test.tsx
```

Expected: FAIL — `Failed to resolve import "./AccountChecklistRows"`.

- [ ] **Step 3: Write the component**

Create `src/components/account/AccountChecklistRows.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import type { AccountRole } from '@/lib/accountReadiness';

interface Props {
  role: AccountRole;
}

/**
 * Outstanding account requirements, rendered as slots inside NeedsAttentionSection.
 *
 * Deliberately NOT a card of its own: /dashboard/business is Donny-first, and a
 * second competing card would fight him for the page. This joins the existing
 * consolidated attention frame, which already hides itself when empty.
 *
 * MUST return null — not an empty element — when there is nothing to show, or
 * the section's CSS :has() check resurrects its header around a blank frame.
 */
export function AccountChecklistRows({ role }: Props) {
  const navigate = useNavigate();
  const { outstanding, dismiss } = useAccountReadiness(role);

  // `outstanding` excludes `unknown` by construction, so an unreachable source
  // shows nothing rather than a false alarm.
  if (outstanding.length === 0) return null;

  return (
    <div className="divide-y divide-dc-teal/10">
      {outstanding.map((req) => (
        <div key={req.key} className="flex items-start gap-3 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-dc-text">{req.label}</p>
            <p className="text-xs text-dc-text-muted">{req.state.detail ?? req.why}</p>
          </div>
          <button
            onClick={() => navigate(req.resolve.route)}
            className="text-xs font-bold text-dc-teal-btn shrink-0"
          >
            {req.state.status === 'pending' ? 'CHECK' : 'GO'}
          </button>
          {req.tier === 'recommended' && (
            <button
              aria-label={`Dismiss ${req.label}`}
              onClick={() => dismiss(req.key)}
              className="text-dc-text-muted hover:text-dc-text shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Mount it in both Donny dashboards**

`DonnyHomeProposals` already renders its `children` inside `NeedsAttentionSection`. Add the rows as a child.

In `src/components/donny/DonnyHome.tsx`, import the component and add it inside the existing `<DonnyHomeProposals>` children, alongside the rating prompts:

```tsx
<AccountChecklistRows role="business_client" />
```

In `src/components/donny/CreatorDonnyHome.tsx` (around line 98–105), add inside the same element:

```tsx
<AccountChecklistRows role="content_creator" />
```

- [ ] **Step 5: Run tests, typecheck, build and commit**

```bash
npx vitest run src/components/account/ src/components/donny/
npm run typecheck
npm run build
git add src/components/account/ src/components/donny/DonnyHome.tsx src/components/donny/CreatorDonnyHome.tsx
git commit -m "feat: surface outstanding account requirements in the attention list"
```

---

### Task 10: Narrow `first_run_missions` to non-derivable events

**Files:**
- Modify: `src/types/firstRun.ts`
- Test: `src/types/firstRun.test.ts`
- Test: `src/lib/accountReadiness/invariants.test.ts`

**Interfaces:**
- Consumes: `ROLE_REQUIREMENTS` (Task 4).
- Produces: narrowed `RestaurantMissions`, `CreatorMissions`, `BrandMissions` containing only view-events.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/accountReadiness/invariants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spec §7 invariant. A derived requirement reading the mission blob would
 * reintroduce exactly the recorded-vs-actual drift this engine exists to close,
 * and it would do so invisibly.
 */
describe('engine invariants', () => {
  it('no file in src/lib/accountReadiness references first_run_missions', () => {
    const dir = join(process.cwd(), 'src/lib/accountReadiness');
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('first_run_missions'));
    expect(offenders).toEqual([]);
  });
});
```

Create `src/types/firstRun.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getInitialMissions, areMissionsComplete, parseFirstRunMissions } from './firstRun';

describe('first_run_missions holds only non-derivable view events', () => {
  it('business missions no longer track payments or campaigns', () => {
    const m = getInitialMissions('business_client') as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['browse_inspiration']);
  });

  it('creator missions no longer track payouts, portfolio or applying', () => {
    const m = getInitialMissions('content_creator') as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['view_campaigns']);
  });

  it('brand missions keep only the two view events', () => {
    const m = getInitialMissions('brand') as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['browse_creators', 'select_style']);
  });

  /** Old rows must keep reading — the column is narrowed, never dropped. */
  it('parses a legacy blob containing removed keys without throwing', () => {
    const legacy = { browse_inspiration: true, create_campaign: true, setup_payments: false };
    const parsed = parseFirstRunMissions(legacy as never, 'business_client');
    expect(parsed).toBeTruthy();
    expect((parsed as unknown as Record<string, unknown>).browse_inspiration).toBe(true);
  });

  it('completion ignores keys that are no longer part of the set', () => {
    expect(areMissionsComplete({ browse_inspiration: true } as never)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/types/firstRun.test.ts src/lib/accountReadiness/invariants.test.ts
```

Expected: the `firstRun` tests FAIL (initial missions still contain the derived keys); the invariant test PASSES already and is there to keep passing.

- [ ] **Step 3: Narrow the mission types**

In `src/types/firstRun.ts`, replace the three interfaces and `getInitialMissions`:

```ts
/**
 * ONLY non-derivable "did the user look at this once" events live here.
 * Everything with a row to derive from — payments, portfolio, campaigns,
 * applications, sponsorships — is now a derived requirement in
 * src/lib/accountReadiness. Two writers for one fact is the drift class this
 * project has already been bitten by twice.
 *
 * The column is NOT dropped and legacy blobs keep parsing: removed keys are
 * simply ignored.
 */
export interface RestaurantMissions {
  browse_inspiration: boolean;
  completed_at?: string;
}

export interface CreatorMissions {
  view_campaigns: boolean;
  completed_at?: string;
}

export interface BrandMissions {
  select_style: boolean;
  browse_creators: boolean;
  completed_at?: string;
}
```

```ts
export function getInitialMissions(role: UserRole): RoleMissions {
  switch (role) {
    case 'business_client':
      return { browse_inspiration: false };
    case 'content_creator':
      return { view_campaigns: false };
    case 'brand':
      return { select_style: false, browse_creators: false };
  }
}
```

Then delete the two back-fill lines in `parseFirstRunMissions` that inject `setup_payments` and `setup_payouts` into legacy blobs — those keys are now derived and must not be re-added.

Finally, update `areMissionsComplete` so it only considers keys present in the current set for the role, ignoring legacy extras:

```ts
export function areMissionsComplete(missions: RoleMissions): boolean {
  if ('completed_at' in missions && missions.completed_at) return true;
  const { completed_at: _completed_at, ...flags } = missions as unknown as Record<string, unknown>;
  // Legacy blobs carry keys that are now derived; a stale `false` on one of them
  // must not keep a user in first-run forever.
  const live = Object.entries(flags).filter(([k]) =>
    ['browse_inspiration', 'view_campaigns', 'select_style', 'browse_creators'].includes(k),
  );
  return live.length > 0 && live.every(([, v]) => v === true);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/types/firstRun.test.ts src/lib/accountReadiness/
```

Expected: PASS.

- [ ] **Step 5: Run the full suite, build and commit**

```bash
npm run test
npm run typecheck
npm run build
git add src/types/firstRun.ts src/types/firstRun.test.ts src/lib/accountReadiness/invariants.test.ts
git commit -m "refactor: narrow first_run_missions to non-derivable view events"
```

---

### Task 11: Codex second review and prod verification

**Files:** none — this is the mandatory independent review gate from `CLAUDE.md`.

**Interfaces:**
- Consumes: every preceding task.
- Produces: a clean Codex verdict and a both-viewport prod check.

- [ ] **Step 1: Run the data-exposure reviewer**

The migration adds contact PII (`phone`) and this work touches no RLS, but Task 2 Step 3 must be re-confirmed on the final branch: no public view exposes `phone` or `phone_verified_at`.

- [ ] **Step 2: Run the Codex second review**

```bash
codex review --base main --title "Account completeness engine (slice 1)"
```

Fix anything real and re-run until clean. Relay the summary verdict to the user. A sandbox "blocked by policy" message is expected and is not a failure.

- [ ] **Step 3: Confirm the rollout posture is genuinely no-op**

Before merge, confirm the gate cannot start blocking anyone:

```sql
select name, is_enabled from public.feature_flags where name = 'READINESS_GATE_ENABLED';
```

Expected: no row, or `is_enabled = false`. If it is enabled, stop — spec §11 requires each dimension be watched in the checklist first.

- [ ] **Step 4: Verify on prod after deploy**

Use the `verify-prod` skill: poll for the new bundle, then screenshot desktop and mobile for a business account and a creator account, and capture console errors. Confirm the attention list shows real outstanding items and that a complete account shows no section at all.

- [ ] **Step 5: Knowledge sync**

Run the `knowledge-sync` skill: write the session source, `/wiki-ops ingest` it, prepend to `docs/SHIPPED_LOG.md`, and refresh `PROJECT_CONTEXT.md` §4/§5 and `DATABASE_SCHEMA.md` (three new `profiles` columns).

---

## Self-Review

**Spec coverage.** §4.1 statuses → Task 3. §4.2 definition → Task 3. §4.3 tiers and dismissal → Tasks 3, 4, 9. §4.4 dimension table → Tasks 3, 4. §4.5 action registry → Task 4. §5.1 one hook → Task 6. §5.2 read split → Task 6 (`liveStripe`), Task 7. §5.3 failure behavior → Tasks 3, 5, 8, 9. §6.1 first-run → Task 8. §6.2 attention list → Task 9. §6.3 gate → Task 7. §7 mission narrowing and invariant → Task 10. §8 schema → Task 2. §9 purity → enforced by Task 3's design and Task 10's invariant test. §10 testing → Tasks 3–10. §11 rollout → Task 7 (flag untouched), Task 11 Step 3. §12 open questions → Task 1.

**Placeholder scan.** No TBD/TODO. Every code step carries real code. No "similar to Task N".

**Type consistency.** `RequirementKey`, `RequirementState`, `ReadinessContext`, `ResolvedRequirement`, `AccountRole` are defined in Task 3 and used verbatim in 4–10. `computeAccountReadiness` (Task 5) returns the shape Tasks 6–9 destructure: `requirements`, `required`, `recommended`, `outstanding`, `missingFor`, `isBlocked`. `useAccountReadiness` adds `dismiss`, which Task 9 uses. `GatedAction` is defined in Task 4 and consumed in Tasks 5 and 7.

**One deliberate deviation from the spec, recorded here:** spec §4.4 lists `email_verified` as a requirement for all roles, and it will read `met` for essentially every current user because `AuthForm` blocks unverified login. It stays in the table because slice 3's OAuth paths break that guarantee. It will look like a permanently-satisfied row until then; that is expected, not a bug.
