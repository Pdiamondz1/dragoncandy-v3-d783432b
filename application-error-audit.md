# Campaign Application Submission Failure — Audit Report

## Summary

The "Failed to submit application" error is caused by a **trigger function bug**. The `notify_donny_nudge()` function, which fires AFTER INSERT on `campaign_applications`, references `NEW.user_id` — a column that does not exist on the table (the correct column is `NEW.creator_id`). PostgreSQL raises `record "new" has no field "user_id"`, which aborts the trigger and rolls back the entire INSERT transaction. The creator's application is never persisted.

---

## Evidence

### 1. FRONTEND — Submit flow is correct

**File:** `src/hooks/useCreateApplication.ts`
**Lines:** 35–46

The insert payload maps correctly to valid `campaign_applications` columns:
- `campaign_id` → uuid (required, present)
- `creator_id` → uuid from `user!.id` (required, present)
- `intro_message` → text (optional)
- `proposed_timeline` → text (optional)
- `proposed_rate` → number (optional)
- `portfolio_url` → text (optional, column added via migration `20260406000000_add_portfolio_url.sql`)

**File:** `src/components/campaigns/CampaignApplyForm.tsx`
**Lines:** 109–127

Client-side validation is minimal but correct: only blocks submit if non-fixed-price campaign has no rate. No silent filtering.

**Error handler** (line 107–114): Catches any thrown error and surfaces the generic "Failed to submit application — Please try again later." toast. This matches the user-reported error exactly.

### 2. DATABASE SCHEMA — No missing columns

**Table:** `campaign_applications`
**Created in:** `supabase/migrations/20250616011059_...sql` (lines 27–38)
**Columns added later:**
- `brand_approval_status`, `restaurant_approval_status`, `final_approval_status` — migration `20251002191100_...sql`
- `portfolio_url` — migration `20260406000000_add_portfolio_url.sql`

All columns the frontend sends exist in the table. No NOT NULL column is missing a DEFAULT or frontend value.

### 3. RLS POLICY — Correct for content_creator role

**Policy:** "Content creators can create applications"
**File:** `supabase/migrations/20250616011059_...sql` (lines 120–129)

```sql
WITH CHECK (
    auth.uid() = creator_id AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'content_creator'
    )
);
```

This is valid. The `user_role` enum values are `'business_client'` and `'content_creator'` (defined in migration `20250615093714_...sql`). Creators signing up get `content_creator` role via the auth trigger (migration `20250806152949_...sql`). RLS is not the blocker.

### 4. THE BUG — `notify_donny_nudge()` trigger references non-existent column

**File:** `supabase/migrations/20260411000001_donny_nudge_triggers.sql`
**Line:** 33

```sql
WHEN 'campaign_applications' THEN
    SELECT c.user_id INTO _user_id
      FROM public.campaigns c
      WHERE c.id = NEW.campaign_id;
    _type := 'application';
    _data := jsonb_build_object(
      'application_id', NEW.id,
      'campaign_id', NEW.campaign_id,
      'creator_id', NEW.user_id    -- ← BUG: should be NEW.creator_id
    );
```

`campaign_applications` has `creator_id`, not `user_id`. PostgreSQL raises:
```
ERROR: record "new" has no field "user_id"
```

This is an AFTER INSERT trigger. AFTER triggers run in the same transaction. The error aborts the trigger function, which rolls back the INSERT. The creator's application is never saved.

### 5. SECONDARY ISSUE — Supabase types out of sync

**File:** `src/integrations/supabase/types.ts` (lines 366–408)

The generated types for `campaign_applications` do not include `portfolio_url`. The migration added this column on 2026-04-06, but `types.ts` was never regenerated. This doesn't cause a runtime failure (PostgREST accepts the column since it exists in the actual DB), but it means TypeScript isn't catching type errors on this table.

---

## Top 3 Ranked Root Cause Candidates

1. **[CONFIRMED] Trigger column reference bug** — `NEW.user_id` in `notify_donny_nudge()` should be `NEW.creator_id`. This is the direct cause of the "Failed to submit" error. **Severity: P0 launch blocker.**

2. **[LOW RISK] Stale Supabase types** — `types.ts` doesn't include `portfolio_url`. Not a runtime blocker, but creates a TypeScript type hole. **Severity: P2 hygiene.**

3. **[RULED OUT] RLS policy mismatch** — RLS policy correctly checks `role = 'content_creator'`. Signup flow correctly assigns this role. Not a blocker.

---

## Recommended Fix

**Single fix:** Replace `NEW.user_id` with `NEW.creator_id` on line 33 of the `notify_donny_nudge()` function.

Write a new migration:
```sql
CREATE OR REPLACE FUNCTION public.notify_donny_nudge()
-- (full function body with the one-line fix on the 'creator_id' reference)
```

---

## Blast Radius

- The `notify_donny_nudge()` function is also used by triggers on `file_uploads`, `campaign_invitations`, and `campaign_matches`. Those tables DO have the correct column names referenced in their CASE branches (`collaboration_id`, `creator_id`, `brand_id`). Only the `campaign_applications` branch has the bug.
- Fixing the column reference does not change the function signature or trigger binding — existing triggers remain intact.
- The fix is purely corrective; no new behavior is introduced.

---

## Verification Test Plan

1. **Submit a test application as a creator:** Log in as a `content_creator` user → browse campaigns → open a campaign → fill out the apply form → submit. Expect: success toast "Application submitted successfully!", row appears in `campaign_applications` table.

2. **Check the Donny nudge fired:** After successful submission, verify `donny_nudges` table has a new row for the campaign owner with type `'application'`. Verify the edge function `donny-nudge-frame` was invoked (check Supabase function logs).

3. **Verify no regression on other triggers:** Upload a file to a collaboration → verify `donny_nudge_on_upload` fires without error. Send a campaign invitation → verify `donny_nudge_on_invitation` fires without error.
