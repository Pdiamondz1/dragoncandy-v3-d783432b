
# Fix Profile Settings Update - RLS Policy Update

## Problem Analysis

Users are unable to update their profiles in the settings pages. After investigating the database RLS (Row Level Security) policies, I found that the UPDATE policies for both `business_profiles` and `creator_profiles` tables are missing the `WITH CHECK` clause.

### Current State

The UPDATE policy currently has:
```sql
CREATE POLICY "Users can update their own business profile"
ON public.business_profiles FOR UPDATE
USING (auth.uid() = user_id);
-- Missing: WITH CHECK clause
```

For UPDATE operations in PostgreSQL RLS:
- **USING** clause: Determines which existing rows can be selected for updating
- **WITH CHECK** clause: Determines what values the updated row can have

While PostgreSQL documentation states that `WITH CHECK` defaults to `USING` when omitted, in practice this can cause updates to fail silently in certain Supabase configurations.

---

## Solution

Add the missing `WITH CHECK` clause to the UPDATE policies for both `business_profiles` and `creator_profiles` tables.

---

## Database Migration

Create a new migration file with the following SQL:

```sql
-- Drop existing UPDATE policies
DROP POLICY IF EXISTS "Users can update their own business profile" 
ON public.business_profiles;

DROP POLICY IF EXISTS "Users can update their own creator profile" 
ON public.creator_profiles;

-- Recreate UPDATE policies with explicit WITH CHECK clause
CREATE POLICY "Users can update their own business profile"
ON public.business_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator profile"
ON public.creator_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

---

## Technical Details

| Change | Description |
|--------|-------------|
| Add `TO authenticated` | Explicitly restrict to authenticated users |
| Add `WITH CHECK` | Verify new row values satisfy ownership check |
| Both clauses use same condition | `auth.uid() = user_id` |

---

## What This Fixes

After applying this migration:
1. Business users can update their business profile settings
2. Creator users can update their creator profile settings
3. The RLS policy explicitly allows authenticated users to modify their own data

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/migrations/[timestamp]_fix_profile_update_policies.sql` | Create new migration |

No code changes are needed - this is purely a database policy fix.
