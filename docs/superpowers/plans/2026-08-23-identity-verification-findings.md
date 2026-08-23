---
title: Identity Verification (Slice 2) — Task 1 Production Findings
date: 2026-08-23
status: findings, read-only investigation
---

# Identity Verification (Slice 2) — Task 1 Production Findings

All queries run 2026-08-23 from the `feat/identity-verification` worktree
(`/Users/dwill/GIT/dragoncandy-v3-d783432b/.claude/worktrees/DC-fix-onboarding`) against the linked
production project `zocahiffooqdybdhguqv`, using `supabase db query --linked` and read-only file
inspection. No code, schema, or configuration was changed. This document also answers a controller
amendment that **replaces** the brief's original Q4, plus a fifth question the brief did not ask.

## Q4 (REPLACED by controller amendment) — the `deriveAddress` grandfather rule

**Command run:**

```bash
supabase db query --linked "select
  count(*) as total,
  count(*) filter (where lat is not null and lng is not null) as with_coords,
  count(*) filter (where lat is not null and lng is not null and (address is null or address = '')) as coords_but_no_address,
  count(*) filter (where address is not null and address <> '' and (lat is null or lng is null)) as address_but_no_coords
from public.org_units;"
```

**Result:**

| total | with_coords | coords_but_no_address | address_but_no_coords |
|---|---|---|---|
| 30 | 0 | 0 | 4 |

**`coords_but_no_address` = 0 — but the number that actually matters is `with_coords` = 0.**

No row in `public.org_units` (30 total, in production, today) has `lat`/`lng` populated at all.
Confirmed with a second, simpler query:

```bash
supabase db query --linked "select
  count(*) as total,
  count(*) filter (where address is not null and address <> '') as with_address,
  count(*) filter (where lat is not null) as lat_notnull,
  count(*) filter (where lng is not null) as lng_notnull
from public.org_units;"
```
→ `{ total: 30, with_address: 4, lat_notnull: 0, lng_notnull: 0 }`

Column names verified against `information_schema.columns` for `public.org_units`: `address`
(text), `lat` (numeric), `lng` (numeric) — no other geo-coordinate columns exist on this table, so
this isn't a wrong-column miss.

**Why this is decisive, and why it changes the framing of the controller's concern.** The
controller's ruling was that `deriveAddress` should accept EITHER the new `address_verified_at`
stamp OR existing coordinates, specifically to avoid flipping *already-complete* businesses to
"Add your address." That protection turns out to guard an empty set: under the **currently live**
`deriveAddress` (`nonEmpty(address) && lat !== null && lng !== null`, see
`src/lib/accountReadiness/derivations.ts:46-53`), **zero org_units can be `met` today**, because
`lat`/`lng` are null on all 30 rows, including the 4 that do have an address. The geocoding step
that should populate `lat`/`lng` from `address` is not running in production, or is silently
failing, for every existing row. This is a pre-existing slice-1 defect, not something slice 2
introduces: **every business/brand account with an org_unit today already sees `address` as
`unmet`**, regardless of whether they've filled in an address.

Practical consequence for slice 2: the "OR existing coordinates" branch of the grandfather rule
will not currently grandfather anyone, because nobody currently qualifies through coordinates. It
is a correct and harmless clause to keep (it costs nothing and protects a future population if
geocoding is fixed), but the controller should not rely on it as evidence that today's rollout is
low-risk for existing users — today's population is *already* unmet on this requirement, slice 2
or not. This is worth a separate ticket/finding: the org_unit geocoding pipeline itself looks
broken or unwired in production, independent of anything in this plan.

## Q1 — are the Twilio credentials live and funded?

**What was checked (read-only, no API calls to Twilio):**

1. Secrets present:
   ```bash
   supabase secrets list --project-ref zocahiffooqdybdhguqv
   ```
   `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` are all present, each
   `updated_at: 2025-12-10T16:22:31.189Z` — unchanged since that date. This only proves they were
   set once and never rotated; it proves nothing about the account's funding/activation state.

2. Function deployment:
   ```bash
   supabase functions list --project-ref zocahiffooqdybdhguqv
   ```
   `send-promotion-notification` is `ACTIVE`, version 194, `verify_jwt: false`.

3. Read the function source
   (`supabase/functions/send-promotion-notification/index.ts:196-256`). Findings:
   - The Twilio branch runs only when `data.type === 'video_approved' && data.discountCode`, the
     caller supplied a non-empty `data.customerPhone`, **and** all three Twilio env vars resolve
     truthy. This is **reachable code**, not dead code behind a condition that can never be true —
     the caller (`src/hooks/usePromotions.ts:409-444`, the promotion-submission approval flow)
     does pass `customerPhone` through when a submission carries one.
   - Twilio failures ARE surfaced: a non-OK response from the Twilio API is caught, logged
     (`console.error("Twilio error:", smsResult)`), and appended to `results.errors`, which is
     returned to the caller in the 200 JSON body. The caller (`usePromotions.ts:430-443`) logs a
     console error on any `notificationError` but does **not** currently branch on
     `results.errors` for the SMS-specific failure — it reads `notificationResult?.smsSent` to
     write `discount_codes.sms_sent`, so a Twilio failure would correctly leave `sms_sent = false`
     but would not surface a user-facing failure message beyond the console.
   - If any Twilio secret is missing, the branch no-ops silently (`console.log("Skipping SMS:
     Missing Twilio credentials or phone number")`) rather than erroring — but all three secrets
     are present, so this branch is not currently taken.

4. Whether it has ever actually fired in production:
   ```bash
   supabase db query --linked "select count(*) as total_codes, count(*) filter (where sms_sent) as sms_sent_true, count(*) filter (where email_sent) as email_sent_true, count(*) filter (where customer_phone is not null and customer_phone <> '') as with_phone from public.discount_codes;"
   ```
   → `{ total_codes: 1, sms_sent_true: 0, email_sent_true: 1, with_phone: 0 }`. Only one discount
   code has ever been issued on prod, and it carried no phone number, so the SMS branch has never
   actually executed — not because it's unreachable, but because no real submission has supplied a
   phone number yet.

**Explicit open item — cannot be determined from this environment, do not guess:**
Whether the Twilio **account itself** is active and funded (a real balance, no suspension) can only
be answered by opening the Twilio console (Monitor → Logs → Messaging) — a step this task did not
perform, per the controller's instruction not to call the Twilio API. **The founder is the only
person who can answer this**, by checking the Twilio console directly. Until that's done, Task 5
(if it depends on live SMS delivery, e.g. a phone-verification OTP flow reusing this account) should
treat Twilio's operational status as unverified, not assumed-working. Record: secrets exist and are
unchanged since 2025-12-10; the one integration point that uses them is reachable, live code with
error surfacing; it has simply never been exercised with a real phone number on prod. Account
funding/activation is an **open item**, owner: founder, via Twilio console.

## Q2 — which `profiles` columns are legitimately client-written? (cross-checked, not trusted)

**Command run (brief's exact command, quoted per the controller's zsh-glob warning — no unquoted
`--include=*.ts` glob was used anywhere in this task):**

```bash
grep -rn -A6 "from('profiles')" src/ | grep -E "\.update\(|\.upsert\(|\.insert\("
```

Result (13 call sites):

```
src/contexts/AuthContext.tsx-238-      .update({ active_org_unit_id: unitId })
src/components/business-profile/FileUploadSection.tsx-106-            .update({ avatar_url: path })
src/components/org/DeleteUserSheet.tsx-58-      .update({
src/components/org/LeaveOrgSheet.tsx-34-        .update({ org_id: null, active_org_unit_id: null })
src/components/creator-profile/AvatarUpload.tsx-74-          .update({ avatar_url: path })
src/components/outstand/DonnyAutoPilot.tsx-35-        .update({ auto_pilot_enabled: newValue })
src/components/onboarding/OnboardingWizard.tsx:190:      const { error: profileError } = await supabase.from('profiles').upsert({
src/hooks/useBusinessProfileSubmit.ts-123-          .update({ avatar_url: logoUrl })
src/hooks/useOrgData.ts-166-        .update({ active_org_unit_id: orgUnitId })
src/hooks/useAccountReadiness.ts-205-            .update({ dismissed_requirements: [...current, key] })
src/hooks/useFirstRunMissions.ts-40-        .update({ first_run_missions: updated as unknown as Record<string, unknown> })
src/hooks/useCreatorProfileSubmit.ts-109-          .update({ avatar_url: avatarUrl })
src/pages/RestoreAccountPage.tsx-29-        .update({ org_id: orgId })
src/pages/InviteAcceptPage.tsx-65-          .update({ org_id: orgId })
```

`DeleteUserSheet.tsx`'s columns weren't visible on the matched line (`grep`'s `-A6` window truncated
it); read directly (`src/components/org/DeleteUserSheet.tsx:54-63`):
```js
.update({ full_name: 'Deleted User', avatar_url: null, org_id: null, active_org_unit_id: null })
```

**Independent second pass**, not relying on the `-A6` window or on the brief's grep at all: wrote a
small Perl script (`/private/tmp/.../scratchpad/check_profiles.pl`) that reads every file containing
`from('profiles')` (32 files total via `grep -rln "from('profiles')" src/`) in full and matches
`from\(['"]profiles['"]\)\s*\n?\s*\.(update|upsert|insert)\(` across the whole file body, not just 6
lines. Result: **the same 13 call sites, no more, no fewer** — 12 `.update(`, 1 `.upsert(` (the
`OnboardingWizard.tsx` one). No `.insert(` directly on `profiles` anywhere in `src/`.

**Union of columns actually written, confirmed against the brief's claimed list:**

- UPDATE: `active_org_unit_id`, `avatar_url`, `org_id`, `auto_pilot_enabled`,
  `dismissed_requirements`, `first_run_missions`, `full_name` — **exact match** to the brief's
  expected UPDATE list. No column found that the brief missed or misstated.
- INSERT (via upsert, `OnboardingWizard.tsx:190-195`): `id`, `email`, `role`, `full_name`,
  `email_verified` — **exact match** to the brief's expected INSERT list.

**Verdict: the brief's Q2 list is correct and complete.** Cross-check found nothing to add or
correct.

**Note for the record (per brief), verified by reading `OnboardingWizard.tsx:184-195`:**
`email_verified` is client-asserted on that upsert (`!!user.email_confirmed_at`, derived
client-side from the Supabase auth session, not re-verified server-side at write time). Confirmed
mitigations, read directly: the call uses `{ onConflict: 'id', ignoreDuplicates: true }`, which
compiles to `ON CONFLICT (id) DO NOTHING` — so this upsert can only ever create a brand-new row, it
can never overwrite an existing `email_verified` value. And `handle_new_user` already creates the
`profiles` row at signup for every account except `account_scope='internal'` accounts (per the
comment at `OnboardingWizard.tsx:184-188`), so the insert-only path is reached only for that
internal-account carve-out. Not fixed in this task, per instruction — recorded as a finding only.

## Q3 — do any existing Connect accounts report outstanding requirements?

**Commands run:**

```bash
supabase db query --linked "select count(*) filter (where stripe_account_id is not null) as with_account, count(*) filter (where stripe_onboarding_complete) as complete from public.creator_profiles;"
supabase db query --linked "select count(*) filter (where stripe_account_id is not null) as with_account, count(*) filter (where stripe_onboarding_complete) as complete from public.business_profiles;"
```

**Results:**

| table | with_account | complete | with_account_but_not_complete |
|---|---|---|---|
| `creator_profiles` | 4 | 3 | 1 |
| `business_profiles` | 4 | 2 | 2 |

**3 real accounts today (1 creator + 2 business) have a Stripe Connect account but
`stripe_onboarding_complete = false`.** Task 6's checklist row will fire for real users on day
one — it is not theatre. (Note: `org_units` also carries its own `stripe_account_id` /
`stripe_onboarding_complete` columns per the schema dump below; this task queried the brief's
specified tables, `creator_profiles`/`business_profiles`, exactly as instructed — the `org_units`
Stripe columns were not part of Q3's scope and weren't queried.)

## Q5 (added by controller amendment) — actual current state of `deriveAddress` /
`requirements.ts`, and whether `phone_verified` is already required or recommended

**Files read:** `src/lib/accountReadiness/derivations.ts`, `src/lib/accountReadiness/requirements.ts`,
`src/lib/accountReadiness/types.ts`, and the migration that added the backing columns,
`supabase/migrations/20260823120000_account_completeness_columns.sql`.

**This corrects an assumption the plan may have been written under: `phone_verified` is not new
work for slice 2 — it already fully exists, merged, from slice 1.**

- `RequirementKey` (`types.ts:1-11`) already includes `'phone_verified'` and `'address'`. It does
  **not** include anything for identity/tax verification — no `'identity_verified'`,
  `'tax_verified'`, or similar key exists anywhere in the codebase. Confirmed by
  `grep -rn "address_verified_at\|identity_verified\|tax_verified\|identity_verification" src/
  supabase/migrations/` → **no matches**. Identity/tax verification is genuinely new work; phone
  verification's requirement plumbing is not.
- `requirements.ts` already defines `phoneVerified(route)` (lines 18-23) and wires it into **all
  three** roles — `business_client`, `content_creator`, and `brand` — each at
  **`tier: 'required'`** (not `recommended`). See `requirements.ts:49` (business), `:80` (creator),
  `:111` (brand).
- `derivePhoneVerified` (`derivations.ts:39-42`) already keys off `ctx.phoneVerifiedAt`, which is
  already sourced from a real column: `profiles.phone_verified_at` (added, nullable, no backfill,
  by `20260823120000_account_completeness_columns.sql`, already applied — confirmed present in
  `information_schema` via the earlier `phone_verified_at` grep hits in
  `src/integrations/supabase/types.ts`). **What's actually missing is not the requirement
  plumbing — it's any code path that ever writes to `phone_verified_at`.** A repo-wide grep
  (`grep -rn "phone_verified_at" supabase/ src/`) found exactly one non-generated,
  non-test writer-adjacent reference: the migration's own `add column` and `comment on column`
  statements. No OTP flow, no verification UI, no edge function sets this column today — which the
  migration's own comment states explicitly ("No OTP, no capture UI, no provider in this slice —
  that is slice 2"). So today, `phone_verified_at` is `NULL` for every user and `derivePhoneVerified`
  correctly returns `unmet` for all of them (never `unknown`, since the column is selected and
  present — see `useAccountReadiness.ts:64,171`).
- `deriveAddress` (`derivations.ts:46-53`) currently keys off `org_units.address` non-empty AND
  both `org_units.lat`/`org_units.lng` non-null — no `address_verified_at` column or concept exists
  yet anywhere in the codebase (confirmed by the same grep above). This is the requirement the
  controller's Q4 amendment is about; see that section above for the production data showing this
  is currently `unmet` for 100% of org_units regardless of address content, because geocoding has
  never populated `lat`/`lng` on any of the 30 production rows.

**Summary table for the controller:**

| Requirement key | Exists today? | Tier (all 3 roles) | Derives from | Backing column exists? | Anything writes it? |
|---|---|---|---|---|---|
| `phone_verified` | Yes (slice 1) | `required` | `profiles.phone_verified_at` | Yes (`20260823120000`) | No — slice 2's job |
| `address` | Yes (slice 1) | `required` (business/brand only — not in creator's requirement list) | `org_units.address` + `lat`/`lng` | address: yes; coordinates: yes but always null in prod | Address: yes (user input). Coordinates: nothing observed to be populating them in prod |
| identity/tax (any name) | **No** | n/a | n/a | n/a | n/a — entirely new in slice 2 |

## Commit

```bash
git add docs/superpowers/plans/2026-08-23-identity-verification-findings.md
git commit -m "docs: record production findings for the identity-verification open questions"
```
