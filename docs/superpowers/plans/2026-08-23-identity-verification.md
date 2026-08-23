# Identity & Verification Implementation Plan (slice 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the slice-1 account completeness engine with three real verification signals — phone (Twilio Verify), identity/tax (mirrored from Stripe Connect Express), and address (confirmed by geocode) — and close the live hole that lets any signed-in user stamp themselves phone-verified.

**Architecture:** No new UI. Three new requirement keys plug into the engine merged in PR #472, so they render in the first-run checklist, the attention list and the gate automatically. Verification stamps are `timestamptz`, written only by the service role. Tax ID numbers are never stored — only Stripe's signals about them.

**Tech Stack:** Supabase (Postgres, RLS, Deno edge functions), Twilio Verify, Stripe Connect Express webhooks, Google Maps Geocoding, React 18 + TypeScript strict, React Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-23-identity-verification-design.md`

## Global Constraints

- **A verification signal is a `timestamptz`, written only by a server that proved something.** Never a boolean. Never client-writable.
- **FAIL-OPEN.** Any source loading, erroring or absent ⇒ that requirement derives `unknown`. `unknown` never blocks and never renders as a failure. A verification outage must never lock a user out.
- **A failed verification is `unmet`, not `unknown`** — we heard back and the answer was no.
- **Never store a tax identification number.** Mirror Stripe's signals only.
- **Never drop or rename tables/columns.** New columns are nullable, no default, no backfill.
- **`verify_jwt=true` is not authorization** — the anon key is a valid JWT and ships in the frontend bundle. Establish identity with `auth.getUser()` and use it for every write; never trust a body-supplied user id.
- **A column-level `REVOKE` is a no-op** against Supabase's ambient table-wide `GRANT`. Revoke table-wide, then grant back an explicit column list.
- **Country allowlist is data, not code** — read from env, default `US`.
- ESLint: only `console.error` / `console.warn`. TypeScript strict with `noUnusedLocals` / `noUnusedParameters`. Tailwind `dc-*` tokens only.
- **`READINESS_GATE_ENABLED` stays absent** throughout. Nothing in this slice may gate an action.
- Test suite baseline at plan time: **247 files / 2598 tests**, all green.

---

### Task 1: Answer the spec's four open questions against production

**Files:**
- Create: `docs/superpowers/plans/2026-08-23-identity-verification-findings.md`

**Interfaces:**
- Produces: findings that later tasks depend on. Task 5 must not start if Q1 fails.

This mirrors slice 1's Task 1, which discovered the readiness gate had never run in production at all. Answer with a query or probe, never an assumption.

- [ ] **Step 1: Q1 — are the Twilio credentials live and funded?**

The secrets exist (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, set 2025-12-10) but that proves they were *set*, not that they *work*. Probe the account with a read-only call that costs nothing:

```bash
supabase functions list --project-ref zocahiffooqdybdhguqv | grep send-promotion-notification
```

Then check whether any SMS has ever actually been sent. Ask the founder to open the Twilio console (Monitor → Logs → Messaging) and report: is the account active, is there a balance, and are there any outbound message records? **Record the answer verbatim.** If the account is dormant or unfunded, Task 5 is blocked and must be reported, not worked around.

- [ ] **Step 2: Q2 — which `profiles` columns are legitimately client-written?**

Already enumerated from the code at plan time. **Cross-check, do not trust this list:**

```bash
grep -rn -A6 "from('profiles')" src/ | grep -E "\.update\(|\.upsert\(|\.insert\("
```

Expected UPDATE columns: `active_org_unit_id`, `avatar_url`, `org_id`, `auto_pilot_enabled`, `dismissed_requirements`, `first_run_missions`, `full_name`.
Expected INSERT columns (from `OnboardingWizard.tsx:190` upsert): `id`, `email`, `role`, `full_name`, `email_verified`.

**Note for the record:** `email_verified` is client-asserted on that upsert, derived from `user.email_confirmed_at`. It is mitigated by `ignoreDuplicates: true` (which compiles to `ON CONFLICT DO NOTHING`, so it can only ever insert a fresh row) and by `handle_new_user` already creating the row. Do **not** try to fix that in this slice — record it as a finding.

- [ ] **Step 3: Q3 — do any existing Connect accounts report outstanding requirements?**

```bash
supabase db query --linked "select count(*) filter (where stripe_account_id is not null) as with_account, count(*) filter (where stripe_onboarding_complete) as complete from public.creator_profiles;"
supabase db query --linked "select count(*) filter (where stripe_account_id is not null) as with_account, count(*) filter (where stripe_onboarding_complete) as complete from public.business_profiles;"
```

This tells you whether Task 6's checklist row will ever fire for a real user, or whether it is theatre.

- [ ] **Step 4: Q4 — how many `org_units` have an address but no coordinates?**

```bash
supabase db query --linked "select count(*) as total, count(*) filter (where address is not null and address <> '') as with_address, count(*) filter (where address is not null and address <> '' and (lat is null or lng is null)) as address_no_geocode from public.org_units;"
```

`address_no_geocode` is the number of existing users who will see a new `unmet` checklist row on day one. Knowing it before shipping is the difference between an expected wave and a surprise.

- [ ] **Step 5: Write the findings file and commit**

Record all four answers verbatim, with the date and the command used. Then:

```bash
git add docs/superpowers/plans/2026-08-23-identity-verification-findings.md
git commit -m "docs: record production findings for the identity-verification open questions"
```

---

### Task 2: Close the `phone_verified_at` write hole

**Files:**
- Create: `supabase/migrations/20260824100000_profiles_verification_column_lockdown.sql`

**Interfaces:**
- Produces: `profiles` verification columns are server-write-only. Every later task depends on this being true.

**This is a live security fix. Do it before anything that gives `phone_verified_at` meaning.** Verified on prod 2026-08-23: `authenticated` holds `UPDATE` and `INSERT` on `profiles.phone_verified_at`, so any signed-in user can `update profiles set phone_verified_at = now()` on their own row and appear verified without ever receiving an SMS.

- [ ] **Step 1: Prove the hole is real, before fixing it**

Run this against prod inside a rolled-back transaction, impersonating a real user. **Capture the output.** A fix whose test never failed against the bug is worthless — slice 1 produced three such tests.

```sql
begin;
  select id from public.profiles limit 1;  -- note the id, call it :uid
  select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set phone_verified_at = now() where id = :'uid';
  -- EXPECTED BEFORE THE FIX: UPDATE 1  (the hole)
rollback;
```

Record the result. `UPDATE 1` confirms the hole.

- [ ] **Step 2: Write the migration**

```sql
-- Verification stamps must be server-write-only.
--
-- `authenticated` held UPDATE and INSERT on profiles.phone_verified_at, so any signed-in
-- user could stamp themselves phone-verified without ever receiving an SMS. Inert until
-- slice 2 gives the column meaning; closed here, first.
--
-- A COLUMN-level REVOKE is a documented no-op against Supabase's ambient table-wide GRANT
-- (see 20260804174854, 20260805163247). The working pattern is table-wide revoke, then
-- grant back an explicit column list — the same shape 20260808010000 used for
-- campaign_invitations.

revoke update on public.profiles from authenticated, anon;
revoke insert on public.profiles from authenticated, anon;

-- Every column the client legitimately UPDATEs, enumerated from src/ at plan time:
--   AuthContext.tsx:238 active_org_unit_id · FileUploadSection.tsx:106 avatar_url
--   DeleteUserSheet.tsx:58 full_name/avatar_url/org_id/active_org_unit_id
--   LeaveOrgSheet.tsx:34 org_id/active_org_unit_id · AvatarUpload.tsx:74 avatar_url
--   DonnyAutoPilot.tsx:35 auto_pilot_enabled · useAccountReadiness.ts:205 dismissed_requirements
--   useFirstRunMissions.ts:40 first_run_missions · useOrgData.ts:166 active_org_unit_id
--   useBusinessProfileSubmit.ts:123 / useCreatorProfileSubmit.ts:109 avatar_url
--   RestoreAccountPage.tsx:29 / InviteAcceptPage.tsx:65 org_id
grant update (
  active_org_unit_id,
  auto_pilot_enabled,
  avatar_url,
  dismissed_requirements,
  first_run_missions,
  full_name,
  org_id
) on public.profiles to authenticated;

-- OnboardingWizard.tsx:190 upserts with ON CONFLICT DO NOTHING. Keep it working.
grant insert (
  id,
  email,
  role,
  full_name,
  email_verified
) on public.profiles to authenticated;

-- Assert the resulting grant set. PUBLIC is included in the filter deliberately: a
-- table-wide GRANT ... TO PUBLIC is recorded under that grantee, so omitting it would
-- make this assertion unfailable — the trap 20260808010000 documents.
do $$
declare
  leaked text;
begin
  select string_agg(distinct grantee || ':' || privilege_type || ':' || column_name, ', ')
    into leaked
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'profiles'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type in ('UPDATE', 'INSERT')
    and column_name in ('phone_verified_at', 'email_verified')
    and not (grantee = 'authenticated' and privilege_type = 'INSERT' and column_name = 'email_verified');

  if leaked is not null then
    raise exception 'verification columns still client-writable: %', leaked;
  end if;
end $$;
```

- [ ] **Step 3: Apply it directly — do NOT use `supabase db push`**

`supabase migration list --linked` reports 234 local-only migrations and 229 remote-only entries; a push would re-run all 234 against production, most not idempotent. Apply the SQL directly, then record the ledger row under the repo's own version:

```bash
supabase db query --linked "$(cat supabase/migrations/20260824100000_profiles_verification_column_lockdown.sql)"
supabase db query --linked "insert into supabase_migrations.schema_migrations (version) values ('20260824100000') on conflict do nothing;"
```

- [ ] **Step 4: Prove it green — the same probe must now fail**

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set phone_verified_at = now() where id = :'uid';
  -- EXPECTED AFTER THE FIX: ERROR 42501 permission denied for table profiles
rollback;
```

Then confirm a legitimate write still works, or you have broken the app:

```sql
begin;
  select set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set avatar_url = 'x' where id = :'uid';   -- EXPECTED: UPDATE 1
rollback;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260824100000_profiles_verification_column_lockdown.sql
git commit -m "fix(security): make profiles verification stamps server-write-only"
```

---

### Task 3: Add the slice-2 columns

**Files:**
- Create: `supabase/migrations/20260824110000_identity_verification_columns.sql`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: `identity_verified_at`, `tax_id_provided`, `stripe_requirements_due`, `stripe_disabled_reason` on `creator_profiles` / `business_profiles` / `org_units`; `address_verified_at` on `org_units` / `creator_profiles`; `lat` / `lng` on `creator_profiles`.

- [ ] **Step 1: Write the migration**

```sql
-- Identity, tax and address signals for the account completeness engine (slice 2).
--
-- NO TAX ID NUMBER IS EVER STORED. Both Connect accounts are Express, so Stripe collects
-- and verifies the tax ID and never exposes it to the platform. We mirror the SIGNAL.
--
-- All nullable, no default, no backfill. NULL means "we have not heard from Stripe about
-- this account yet", which is genuinely different from "not verified" — and the engine
-- already renders that difference, because an absent fact derives `unknown`.

alter table public.creator_profiles
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text,
  add column if not exists address_verified_at timestamptz,
  add column if not exists lat numeric,
  add column if not exists lng numeric;

alter table public.business_profiles
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text;

alter table public.org_units
  add column if not exists identity_verified_at timestamptz,
  add column if not exists tax_id_provided boolean,
  add column if not exists stripe_requirements_due text[],
  add column if not exists stripe_disabled_reason text,
  add column if not exists address_verified_at timestamptz;

comment on column public.creator_profiles.lat is
  'City/postal CENTROID, never a street address. Enough for distance matching, not enough to locate a home.';
comment on column public.creator_profiles.identity_verified_at is
  'Stripe reported verification=verified. NULL = not yet heard from Stripe. Server-write-only.';
comment on column public.creator_profiles.tax_id_provided is
  'Stripe holds a tax ID. NEVER the number itself.';

-- Verification stamps are server-write-only on every table that carries them.
revoke update on public.creator_profiles from authenticated, anon;
revoke update on public.business_profiles from authenticated, anon;
revoke update on public.org_units from authenticated, anon;
```

**STOP — before writing the `grant update (...)` lines back for these three tables, enumerate their client write surface the same way Task 1 Step 2 did for `profiles`:**

```bash
grep -rn -A8 "from('creator_profiles')" src/ | grep -E "\.update\(|\.upsert\("
grep -rn -A8 "from('business_profiles')" src/ | grep -E "\.update\(|\.upsert\("
grep -rn -A8 "from('org_units')" src/ | grep -E "\.update\(|\.upsert\("
```

Then add an explicit `grant update (<columns>)` per table, excluding all seven new columns. **Do not guess the list** — omitting a column the app writes breaks a working flow silently, and these tables are written from many places. End the migration with the same `do $$ ... raise exception ... $$` assertion shape as Task 2, checking that none of the new columns is granted to `anon`, `authenticated` or `PUBLIC`.

- [ ] **Step 2: Apply directly and verify**

```bash
supabase db query --linked "$(cat supabase/migrations/20260824110000_identity_verification_columns.sql)"
supabase db query --linked "insert into supabase_migrations.schema_migrations (version) values ('20260824110000') on conflict do nothing;"
supabase db query --linked "select table_name, column_name, is_nullable from information_schema.columns where table_schema='public' and column_name in ('identity_verified_at','tax_id_provided','stripe_requirements_due','stripe_disabled_reason','address_verified_at') order by table_name, column_name;"
```

Expected: 17 rows, every one `is_nullable = YES`.

- [ ] **Step 3: Confirm no public view exposes the new columns**

```bash
supabase db query --linked "select table_name, column_name from information_schema.columns where table_schema='public' and table_name like 'public_%' and column_name in ('identity_verified_at','tax_id_provided','stripe_requirements_due','stripe_disabled_reason','lat','lng');"
```

Expected: zero rows. If `lat`/`lng` appear on a public creator view, stop — that publishes creator coordinates.

- [ ] **Step 4: Update `types.ts` surgically**

Add the new columns to the `Row` / `Insert` / `Update` blocks for the three tables **by hand**. Do **not** run `supabase gen types` — it produces an ~800-line diff of unrelated prod drift that buries the real change.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add supabase/migrations/20260824110000_identity_verification_columns.sql src/integrations/supabase/types.ts
git commit -m "feat: add identity, tax-signal and address-verification columns"
```

---

### Task 4: Clear `phone_verified_at` when the phone changes

**Files:**
- Create: `supabase/migrations/20260824120000_phone_reverification_trigger.sql`

**Interfaces:**
- Produces: trigger `trg_clear_phone_verification` on `public.profiles`.

A verified stamp must never outlive the value it attests to. Enforced by trigger, not convention, because `phone` is written from more than one place.

- [ ] **Step 1: Write the migration**

```sql
-- A verification stamp must never outlive the value it attests to.
--
-- Trigger rather than convention: `phone` is written from more than one place, and a rule
-- that lives in application code is a rule that a future writer will not know about.
-- IS DISTINCT FROM (not <>) so a NULL on either side behaves — `<>` with NULL yields NULL,
-- which is not true, so the clear would silently not fire.

create or replace function public.clear_phone_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is distinct from old.phone then
    new.phone_verified_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_clear_phone_verification on public.profiles;
create trigger trg_clear_phone_verification
  before update of phone on public.profiles
  for each row
  execute function public.clear_phone_verification();
```

- [ ] **Step 2: Apply and prove it behaviourally, in a rolled-back transaction**

```sql
begin;
  update public.profiles set phone = '+15550001111' where id = :'uid';
  update public.profiles set phone_verified_at = now() where id = :'uid';
  select phone_verified_at is not null as verified_before from public.profiles where id = :'uid';  -- EXPECT: t
  update public.profiles set phone = '+15550002222' where id = :'uid';
  select phone_verified_at is null as cleared from public.profiles where id = :'uid';              -- EXPECT: t
  -- control: an unrelated update must NOT clear it
  update public.profiles set phone_verified_at = now() where id = :'uid';
  update public.profiles set avatar_url = 'x' where id = :'uid';
  select phone_verified_at is not null as survived_unrelated from public.profiles where id = :'uid'; -- EXPECT: t
rollback;
```

**The control matters.** Without it, a trigger that cleared the stamp on *every* update would pass the first two assertions.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260824120000_phone_reverification_trigger.sql
git commit -m "feat: clear phone verification when the phone number changes"
```

---

### Task 5: The `verify-phone` edge function

**Files:**
- Create: `supabase/functions/verify-phone/index.ts`
- Create: `supabase/functions/verify-phone/rateLimit.ts`
- Create: `supabase/functions/verify-phone/rateLimit.test.ts`
- Create: `supabase/migrations/20260824130000_phone_verification_attempts.sql`

**Interfaces:**
- Consumes: `profiles.phone`, `profiles.phone_verified_at` (Task 2 made them server-write-only), the trigger from Task 4.
- Produces: `POST /verify-phone` with `{ action: 'start', phone }` and `{ action: 'check', phone, code }`.

**BLOCKED if Task 1 Q1 reported the Twilio account dormant or unfunded.** Report and stop; do not build on credentials that do not work.

- [ ] **Step 1: Write the rate-limit table migration**

```sql
-- Per-user and per-IP send throttling for phone verification.
--
-- SMS pumping is the actual threat: an attacker triggers large volumes of OTPs to
-- premium-rate numbers they control and collects a share of the carrier fee, which we
-- pay. Per-user alone is defeated by creating accounts, so both dimensions are recorded.

create table if not exists public.phone_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ip_hash text,
  action text not null check (action in ('start', 'check')),
  outcome text not null check (outcome in ('sent', 'approved', 'rejected', 'throttled', 'blocked_country')),
  created_at timestamptz not null default now()
);

create index if not exists idx_pva_user_created on public.phone_verification_attempts (user_id, created_at desc);
create index if not exists idx_pva_ip_created on public.phone_verification_attempts (ip_hash, created_at desc);

-- No client access at all: written and read only by the service role.
alter table public.phone_verification_attempts enable row level security;
revoke all on public.phone_verification_attempts from public, anon, authenticated;
grant all on public.phone_verification_attempts to service_role;
create policy pva_service_all on public.phone_verification_attempts
  for all to service_role using (true) with check (true);
```

Note `ip_hash`, not `ip` — the raw address is never stored.

- [ ] **Step 2: Write the failing rate-limit test**

Create `supabase/functions/verify-phone/rateLimit.test.ts`. This is pure logic with no Deno-only imports, so it runs under Vitest like `capture.ts` and `reconcile.ts` already do:

```ts
import { describe, it, expect } from 'vitest';
import { isAllowedCountry, exceedsSendLimit, SEND_LIMIT_PER_WINDOW } from './rateLimit';

describe('isAllowedCountry', () => {
  it('accepts a US number when the allowlist is US', () => {
    expect(isAllowedCountry('+12125550123', ['US'])).toBe(true);
  });

  it('rejects a high-fee international range not on the allowlist', () => {
    // The dominant SMS-pumping target class. Must be refused BEFORE any Twilio call.
    expect(isAllowedCountry('+8815550123', ['US'])).toBe(false);
  });

  it('rejects anything that is not E.164', () => {
    expect(isAllowedCountry('2125550123', ['US'])).toBe(false);
    expect(isAllowedCountry('+1 (212) 555-0123', ['US'])).toBe(false);
  });

  it('is data-driven, so opening a market is config not code', () => {
    expect(isAllowedCountry('+447700900123', ['US'])).toBe(false);
    expect(isAllowedCountry('+447700900123', ['US', 'GB'])).toBe(true);
  });
});

describe('exceedsSendLimit', () => {
  it('allows a first send', () => {
    expect(exceedsSendLimit([])).toBe(false);
  });

  it('refuses the send after the limit is reached', () => {
    const now = Date.now();
    const recent = Array.from({ length: SEND_LIMIT_PER_WINDOW }, () => new Date(now - 60_000).toISOString());
    expect(exceedsSendLimit(recent)).toBe(true);
  });

  it('ignores attempts outside the window', () => {
    const old = Array.from({ length: SEND_LIMIT_PER_WINDOW }, () => new Date(Date.now() - 48 * 3600_000).toISOString());
    expect(exceedsSendLimit(old)).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run supabase/functions/verify-phone/rateLimit.test.ts
```

Expected: FAIL — `Failed to resolve import "./rateLimit"`.

- [ ] **Step 4: Write `rateLimit.ts`**

```ts
/**
 * Pure throttling and allowlist logic for phone verification.
 *
 * Kept dependency-free and separate from index.ts so it runs under Vitest in CI — the
 * edge function itself cannot, because of its Deno-only imports.
 */

export const SEND_LIMIT_PER_WINDOW = 3;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_MS = 60 * 1000;

/** Country calling codes, longest-prefix-first so +1 does not shadow +1242. */
const COUNTRY_PREFIXES: Record<string, string[]> = {
  US: ['+1'],
  GB: ['+44'],
  CA: ['+1'],
};

export function isAllowedCountry(phone: string, allowed: readonly string[]): boolean {
  // Strict E.164: a leading +, a non-zero first digit, 7-15 digits total.
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) return false;
  return allowed.some((code) =>
    (COUNTRY_PREFIXES[code] ?? []).some((prefix) => phone.startsWith(prefix)),
  );
}

export function exceedsSendLimit(recentIsoTimestamps: readonly string[]): boolean {
  const cutoff = Date.now() - WINDOW_MS;
  const inWindow = recentIsoTimestamps.filter((t) => new Date(t).getTime() >= cutoff);
  return inWindow.length >= SEND_LIMIT_PER_WINDOW;
}

export function withinCooldown(lastIsoTimestamp: string | undefined): boolean {
  if (!lastIsoTimestamp) return false;
  return Date.now() - new Date(lastIsoTimestamp).getTime() < COOLDOWN_MS;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run supabase/functions/verify-phone/rateLimit.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Write the edge function**

Create `supabase/functions/verify-phone/index.ts`. Requirements, each of which is load-bearing:

- CORS preflight handled from `_shared/cors.ts`, matching the existing fleet.
- Identity from `auth.getUser()` on the caller's own JWT. **Never** a body-supplied user id. `verify_jwt=true` alone is not authorization — the anon key is a valid JWT and ships in the bundle.
- `TWILIO_VERIFY_SERVICE_SID` unset ⇒ **refuse to start**. Return a 503 and log. Never fall back to the Messages API — a silent fallback would ship a hand-rolled OTP nobody reviewed.
- `action: 'start'`: validate E.164 + `isAllowedCountry` against `VERIFY_ALLOWED_COUNTRIES` (default `US`) **before any Twilio call**; check `exceedsSendLimit` and `withinCooldown` per user and per `ip_hash`; record the attempt; then call Verify.
- `action: 'check'`: submit the code to Verify. On `approved`, write `phone` and `phone_verified_at = now()` with the **service role**, keyed on the authenticated user id. On any other status, record `rejected` and return `unmet`-shaped copy.
- **No enumeration oracle:** `start` returns a byte-identical response whether or not the number is already attached to another account.
- `ip_hash` is a SHA-256 of the client IP plus a server-side salt. Never store the raw IP.
- Only `console.error` / `console.warn`.

- [ ] **Step 7: Review before deploying**

```bash
# From the repo root, dispatch the read-only reviewers this project requires:
#   edge-function-reviewer  — verify_jwt drift, _shared bundling, CORS, deploy ordering
#   data-exposure-reviewer  — can this let one actor reach another's data?
```

Both must return PASS before the deploy step.

- [ ] **Step 8: Apply the migration, deploy, and boot-verify**

```bash
supabase db query --linked "$(cat supabase/migrations/20260824130000_phone_verification_attempts.sql)"
supabase db query --linked "insert into supabase_migrations.schema_migrations (version) values ('20260824130000') on conflict do nothing;"
supabase functions deploy verify-phone --project-ref zocahiffooqdybdhguqv
```

Then probe with the **public anon key** and confirm it is refused:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/verify-phone" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"start","phone":"+12125550123"}'
```

Expected: **401**. A 200 here means the anon key is being treated as authorization — stop and fix.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/verify-phone/ supabase/migrations/20260824130000_phone_verification_attempts.sql
git commit -m "feat: phone verification via Twilio Verify, rate-limited and country-gated"
```

---

### Task 6: Mirror Stripe's identity signals

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts:387-422` (the `account.updated` case)
- Create: `supabase/functions/stripe-webhook/identitySignals.ts`
- Create: `supabase/functions/stripe-webhook/identitySignals.test.ts`

**Interfaces:**
- Consumes: the columns from Task 3.
- Produces: `deriveIdentitySignals(account)` → `{ identity_verified_at, tax_id_provided, stripe_requirements_due, stripe_disabled_reason }`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { deriveIdentitySignals } from './identitySignals';

const base = { charges_enabled: true, payouts_enabled: true } as never;

describe('deriveIdentitySignals', () => {
  /**
   * The correction the existing handler invites: payouts_enabled is NOT identity
   * verified. An account can be payouts-enabled while verification is still pending.
   */
  it('does not claim verified merely because payouts are enabled', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: ['individual.id_number'], past_due: [], disabled_reason: null },
      individual: { verification: { status: 'pending' } },
    } as never);
    expect(s.identity_verified_at).toBeNull();
    expect(s.stripe_requirements_due).toEqual(['individual.id_number']);
  });

  it('stamps identity_verified_at when Stripe reports verified', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
      individual: { verification: { status: 'verified' }, id_number_provided: true },
    } as never);
    expect(s.identity_verified_at).not.toBeNull();
    expect(s.tax_id_provided).toBe(true);
  });

  it('unions currently_due and past_due without duplicates', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: ['a', 'b'], past_due: ['b', 'c'], disabled_reason: 'requirements.past_due' },
      company: { verification: { status: 'unverified' }, tax_id_provided: true },
    } as never);
    expect([...s.stripe_requirements_due].sort()).toEqual(['a', 'b', 'c']);
    expect(s.stripe_disabled_reason).toBe('requirements.past_due');
  });

  /** A company account carries company.*, an individual account individual.*. */
  it('reads tax_id_provided from whichever side the account uses', () => {
    const company = deriveIdentitySignals({ ...base, requirements: {}, company: { tax_id_provided: true } } as never);
    expect(company.tax_id_provided).toBe(true);
    const individual = deriveIdentitySignals({ ...base, requirements: {}, individual: { id_number_provided: true } } as never);
    expect(individual.tax_id_provided).toBe(true);
  });

  /** Absent is not false. NULL means "Stripe has not told us", which derives `unknown`. */
  it('returns null, not false, when Stripe says nothing about a tax id', () => {
    const s = deriveIdentitySignals({ ...base, requirements: {} } as never);
    expect(s.tax_id_provided).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run supabase/functions/stripe-webhook/identitySignals.test.ts
```

Expected: FAIL — `Failed to resolve import "./identitySignals"`.

- [ ] **Step 3: Write `identitySignals.ts`**

```ts
/**
 * Derives DragonCandy's mirrored identity signals from a Stripe Account.
 *
 * NO TAX ID NUMBER IS EVER READ OR STORED — Express accounts never expose one. We record
 * only whether Stripe holds one, whether it verified the person or company, and what it
 * still wants.
 *
 * Pure and dependency-free so it runs under Vitest in CI, unlike index.ts.
 */

export interface IdentitySignals {
  identity_verified_at: string | null;
  tax_id_provided: boolean | null;
  stripe_requirements_due: string[];
  stripe_disabled_reason: string | null;
}

interface AccountLike {
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null;
  individual?: { verification?: { status?: string | null } | null; id_number_provided?: boolean | null } | null;
  company?: { verification?: { status?: string | null } | null; tax_id_provided?: boolean | null } | null;
}

export function deriveIdentitySignals(account: AccountLike): IdentitySignals {
  const req = account.requirements ?? {};
  const due = Array.from(new Set([...(req.currently_due ?? []), ...(req.past_due ?? [])]));

  const status =
    account.individual?.verification?.status ?? account.company?.verification?.status ?? null;

  // `absent` is not `false`. A missing field means Stripe has not told us, which must
  // derive `unknown` downstream — not a definitive negative.
  const provided =
    account.individual?.id_number_provided ?? account.company?.tax_id_provided ?? null;

  return {
    identity_verified_at: status === 'verified' ? new Date().toISOString() : null,
    tax_id_provided: provided === null || provided === undefined ? null : Boolean(provided),
    stripe_requirements_due: due,
    stripe_disabled_reason: req.disabled_reason ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run supabase/functions/stripe-webhook/identitySignals.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Extend the `account.updated` handler**

In `supabase/functions/stripe-webhook/index.ts`, inside `case "account.updated"`, import `deriveIdentitySignals` and merge its output into each of the three existing `.update({...})` calls alongside `stripe_onboarding_complete`.

**Preserve two existing behaviours exactly:** all three table updates stay in one `Promise.all`, and the pending-balance flush still runs on `onboardingComplete` inside its own `try/catch` so a flush error never fails the webhook and triggers a Stripe retry-storm.

**Do not re-stamp `identity_verified_at` on every event.** Once set it must not move — it records when verification was first proven. Write it only when it is currently NULL and the derived value is non-null. Use `.is('identity_verified_at', null)` on a second, narrower update rather than folding it into the main one.

- [ ] **Step 6: Review, deploy, boot-verify**

Run `edge-function-reviewer` (PASS required), then:

```bash
supabase functions deploy stripe-webhook --project-ref zocahiffooqdybdhguqv
```

Confirm the deployed source actually contains the change — read it back, do not trust the version number:

```bash
supabase functions download stripe-webhook --project-ref zocahiffooqdybdhguqv
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/stripe-webhook/
git commit -m "feat: mirror Stripe identity and tax signals, never the numbers"
```

---

### Task 7: Address verification by geocode

**Files:**
- Create: `src/lib/geocodeVerification.ts`
- Create: `src/lib/geocodeVerification.test.ts`
- Modify: the org-unit address save path and the creator profile save path (locate with the greps in Step 1)

**Interfaces:**
- Consumes: the columns from Task 3.
- Produces: `resolveVerifiedAddress(input)` → `{ lat, lng, verifiedAt } | null`.

- [ ] **Step 1: Locate the two save paths**

```bash
grep -rn "geocode\|Geocoder\|geometry.location" src/ | head -20
grep -rn -A8 "from('org_units')" src/ | grep -E "\.update\(|\.upsert\(|\.insert\("
grep -rn -A8 "from('creator_profiles')" src/ | grep -E "\.update\(|\.upsert\("
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveVerifiedAddress, CREATOR_PRECISION, BUSINESS_PRECISION } from './geocodeVerification';

describe('resolveVerifiedAddress', () => {
  it('returns null when the geocoder found nothing', () => {
    expect(resolveVerifiedAddress({ results: [] }, BUSINESS_PRECISION)).toBeNull();
  });

  /** A partial match is not a verified address — we do not know where they are. */
  it('returns null on a partial match', () => {
    const r = { results: [{ partial_match: true, geometry: { location: { lat: 40.7, lng: -74.0 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, BUSINESS_PRECISION)).toBeNull();
  });

  it('returns coordinates and a stamp on a clean street-level match for a business', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    const out = resolveVerifiedAddress(r, BUSINESS_PRECISION);
    expect(out?.lat).toBeCloseTo(40.7362);
    expect(out?.verifiedAt).not.toBeNull();
  });

  /**
   * The privacy asymmetry: a creator is geocoded to a city/postal centroid, never a
   * street address. Precise home coordinates are data we do not need and should not hold.
   */
  it('refuses street-level precision for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.7362, lng: -74.0286 } }, types: ['street_address'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)).toBeNull();
  });

  it('accepts a locality centroid for a creator', () => {
    const r = { results: [{ geometry: { location: { lat: 40.745, lng: -74.03 } }, types: ['locality', 'political'] }] };
    expect(resolveVerifiedAddress(r, CREATOR_PRECISION)?.lat).toBeCloseTo(40.745);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/lib/geocodeVerification.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write `geocodeVerification.ts`**

```ts
/**
 * Turns a Google Geocoding response into a verified location, or nothing.
 *
 * `address_verified_at` is stamped ONLY on a clean, unambiguous match. A failed or
 * partial geocode leaves it NULL, which derives `unmet` — honestly, because we do not
 * know where they are.
 *
 * Precision is deliberately asymmetric. A business is a place customers visit and
 * publishes its address. A creator's home address is not something to display, and
 * storing a precise one invites exposure — so creators resolve to a city/postal
 * centroid, enough for distance matching and not enough to find someone's home.
 */

export const BUSINESS_PRECISION = ['street_address', 'premise', 'subpremise', 'establishment'] as const;
export const CREATOR_PRECISION = ['locality', 'postal_code', 'administrative_area_level_2'] as const;

interface GeocodeResult {
  partial_match?: boolean;
  types?: string[];
  geometry?: { location?: { lat: number; lng: number } };
}

export interface VerifiedAddress {
  lat: number;
  lng: number;
  verifiedAt: string;
}

export function resolveVerifiedAddress(
  response: { results?: GeocodeResult[] },
  acceptedTypes: readonly string[],
): VerifiedAddress | null {
  const first = response.results?.[0];
  if (!first) return null;
  if (first.partial_match) return null;

  const types = first.types ?? [];
  if (!types.some((t) => acceptedTypes.includes(t))) return null;

  const loc = first.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;

  return { lat: loc.lat, lng: loc.lng, verifiedAt: new Date().toISOString() };
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/geocodeVerification.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Wire both save paths**

On save, call the geocoder, pass the response through `resolveVerifiedAddress` with the right precision constant, and write `lat` / `lng` / `address_verified_at` together in one update. A `null` return writes `address_verified_at: null` — never a guess.

**Note:** Task 3 revoked client UPDATE on these tables and granted back an explicit list that excludes `address_verified_at`. So these writes must go through the service role — add a small edge function, or extend an existing save function. **Do not** re-grant the column to `authenticated` to make the client write work; that reopens exactly the hole Task 2 closed.

- [ ] **Step 7: Typecheck, build, commit**

```bash
npm run typecheck && npm run build
git add src/lib/geocodeVerification.ts src/lib/geocodeVerification.test.ts
git commit -m "feat: verify addresses by geocode, city-centroid precision for creators"
```

---

### Task 8: Wire the three requirement keys into the engine

**Files:**
- Modify: `src/lib/accountReadiness/types.ts` (extend `RequirementKey`, `ReadinessContext`)
- Modify: `src/lib/accountReadiness/derivations.ts`
- Modify: `src/lib/accountReadiness/requirements.ts`
- Modify: `src/hooks/useAccountReadiness.ts`
- Modify: `src/lib/accountReadiness/derivations.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `phone_verified`, `identity_verified` and `address` requirements, live in all three renderings.

- [ ] **Step 1: Write the failing derivation tests**

Add to `src/lib/accountReadiness/derivations.test.ts`. Follow the existing file's shape exactly.

```ts
describe('deriveIdentityVerified', () => {
  it('is unknown when we have not heard from Stripe', () => {
    expect(deriveIdentityVerified(ctx({ identity: undefined })).status).toBe('unknown');
  });

  /** NULL from Stripe is "not verified yet", which is a real answer — unlike absent. */
  it('is unmet when Stripe has reported and the stamp is null', () => {
    expect(deriveIdentityVerified(ctx({ identity: { verifiedAt: null, requirementsDue: ['individual.id_number'] } })).status).toBe('unmet');
  });

  it('names the outstanding requirement in the detail so the copy can be specific', () => {
    const s = deriveIdentityVerified(ctx({ identity: { verifiedAt: null, requirementsDue: ['individual.id_number'] } }));
    expect(s.detail).toContain('individual.id_number');
  });

  it('is met when the stamp is set', () => {
    expect(deriveIdentityVerified(ctx({ identity: { verifiedAt: '2026-08-24T00:00:00Z', requirementsDue: [] } })).status).toBe('met');
  });
});

describe('derivePhoneVerified — dismissal ordering', () => {
  /**
   * Dismissal must be checked BEFORE the undefined check, or a dismissed recommendation
   * reappears whenever its source is briefly unreachable. Same ordering bug the slice-1
   * review caught in three derivations.
   */
  it('stays dismissed even while the source is unresolved', () => {
    const s = derivePhoneVerified(ctx({ phoneVerifiedAt: undefined, dismissed: ['phone_verified'] }));
    expect(s.status).toBe('met');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/lib/accountReadiness/derivations.test.ts
```

Expected: FAIL — the new derivations are not exported.

- [ ] **Step 3: Extend the types**

Add `'identity_verified'` and `'address'` to `RequirementKey` (`'phone_verified'` already exists). Add to `ReadinessContext`:

```ts
  identity: { verifiedAt: string | null; requirementsDue: readonly string[]; disabledReason: string | null } | undefined;
  addressVerifiedAt: string | null | undefined;
```

Both `undefined` when unread — that is what produces `unknown`.

- [ ] **Step 4: Write the derivations**

Follow the existing file's shape. **The dismissal check comes before the undefined check**, matching `deriveSocialLinked` / `deriveLocations` / `derivePortfolio` — the ordering the slice-1 review corrected.

- [ ] **Step 5: Add to the role table**

In `requirements.ts`, per the spec's §6 table: `phone_verified` recommended for all roles; `identity_verified` required for all; `address` required for business and brand, recommended for creator. Give each a real `label`, `why`, and a `resolve.route` that **exists** — slice 1 shipped three dead CTA routes that a review had to catch. Verify each route against `src/App.tsx`.

- [ ] **Step 6: Read the new facts in the hook**

Extend `useAccountReadiness.ts`'s `fetchAccountReadinessDetail` to select the new columns. **Do not add a sentinel default.** An unread value stays `undefined`. The slice-1 defect was exactly this: `?? '00000000-...'` made a failed read succeed with `count: 0` and derive a definitive negative.

- [ ] **Step 7: Do NOT add these keys to `ACTION_REQUIREMENTS`**

Spec §6 is explicit: ship the signals, watch them, gate later. Gating on a signal never observed in production is how a silent permanent block gets built.

- [ ] **Step 8: Run everything and commit**

```bash
npx vitest run src/lib/accountReadiness/ src/hooks/useAccountReadiness.test.tsx
npm run test && npm run typecheck && npm run build
git add src/lib/accountReadiness/ src/hooks/useAccountReadiness.ts
git commit -m "feat: add phone, identity and address requirements to the readiness engine"
```

---

### Task 9: Review gates, prod verification, knowledge sync

**Files:** none — the mandatory gates from `CLAUDE.md`.

- [ ] **Step 1: Data-exposure review**

This slice adds contact PII (`phone`), coordinates, and identity signals, and changes GRANTs on four tables. Dispatch `data-exposure-reviewer` over every changed backend file. Re-confirm on the final branch state:

```bash
supabase db query --linked "select table_name, column_name from information_schema.columns where table_schema='public' and table_name like 'public_%' and column_name in ('phone','phone_verified_at','identity_verified_at','tax_id_provided','stripe_requirements_due','lat','lng');"
```

Expected: zero rows.

- [ ] **Step 2: Re-assert the grant lockdown held**

Migrations from other sessions can re-grant. Verify the end state, not the migration's success:

```bash
supabase db query --linked "select grantee, privilege_type, column_name from information_schema.column_privileges where table_schema='public' and table_name='profiles' and column_name='phone_verified_at' and grantee in ('anon','authenticated','PUBLIC');"
```

Expected: zero rows for UPDATE/INSERT.

- [ ] **Step 3: Knowledge sync — BEFORE Codex, not after**

`CLAUDE.md` requires the knowledge-sync changes to ride in the PR and pass through the Codex review. Write `docs/wiki/raw/sessions/`, `/wiki-ops ingest`, prepend `docs/SHIPPED_LOG.md`, refresh `PROJECT_CONTEXT.md` §4/§5 and `DATABASE_SCHEMA.md` (the new columns, the grant lockdown, and the phone re-verification trigger).

- [ ] **Step 4: Codex second review**

```bash
codex review --base main --title "Identity & verification (slice 2)"
```

Fix anything real and re-run until clean. A sandbox "blocked by policy" message is expected and is not a failure.

- [ ] **Step 5: Confirm the rollout posture is still no-op**

```bash
supabase db query --linked "select name, is_enabled from public.feature_flags where name = 'READINESS_GATE_ENABLED';"
```

Expected: no row, or `is_enabled = false`. If enabled, stop — nothing in this slice may gate an action.

- [ ] **Step 6: Open the PR, and hand the merge to the founder**

Prod verification of auth-gated surfaces still requires test-account credentials, which are **not** in the project memory system despite `CLAUDE.md` saying they are. State that plainly in the PR rather than marking verification done.

---

## Self-Review

**Spec coverage.** §2 governing rule → Tasks 2, 3, 4 (server-write-only, timestamps). §4 the hole → Task 2. §5.1 Stripe signals → Tasks 3, 6. §5.2 phone → Tasks 4, 5. §5.3 address → Tasks 3, 7. §6 engine keys → Task 8. §7 failure behavior → Task 8 Steps 1–4 (fail-open tests) and the Global Constraints. §8 rollout → Task 9 Step 5. §9 testing → Tasks 2 (red→green), 4 (trigger + control), 5 (rate limits, allowlist), 6 (Stripe fixtures), 8 (fail-open). §10 open questions → Task 1.

**Placeholder scan.** No TBD/TODO. Every code step carries real code. Two steps deliberately require enumeration rather than a literal list — Task 3 Step 1's grant-back columns and Task 7 Step 1's save paths — because guessing them is precisely the failure mode; both say so explicitly and give the command.

**Type consistency.** `IdentitySignals` (Task 6) field names match the column names in Task 3 exactly. `VerifiedAddress` (Task 7) returns `lat`/`lng`/`verifiedAt`, written to `lat`/`lng`/`address_verified_at`. `ReadinessContext` additions (Task 8 Step 3) are consumed by the derivations in Step 4 and populated in Step 6. `SEND_LIMIT_PER_WINDOW`, `WINDOW_MS`, `COOLDOWN_MS`, `isAllowedCountry`, `exceedsSendLimit`, `withinCooldown` are defined in Task 5 Step 4 and used in Steps 2 and 6.

**One deliberate deviation from the spec, recorded here.** The spec's §5.3 says creators get `address_verified_at`; this plan also adds `lat`/`lng` to `creator_profiles` in the same migration (Task 3), because verifying a creator address without persisting the resulting centroid would leave match quality exactly where it is — and match quality is one of the five stated drivers.
