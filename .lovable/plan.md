

# Filter Out Campaigns with Accepted Creators from Browse

## Problem

Campaigns that already have an accepted creator are still appearing in the Browse Campaigns marketplace for content creators. This includes:
- Campaigns with **active** collaborations (creator currently working on project)
- Campaigns with **completed** collaborations (project finished)
- Potentially campaigns with **accepted** applications (before collaboration is created)

## Root Cause

In `src/hooks/usePublicCampaigns.ts`, the current filtering logic (lines 26-48) only excludes campaigns with `active` collaborations:

```ts
const { data: assignedCampaigns } = await supabase
  .from('campaign_collaborations')
  .select('campaign_id')
  .eq('status', 'active');  // Only filters 'active' - misses 'completed'
```

This misses campaigns with:
1. `completed` collaboration status
2. Accepted applications that haven't yet been converted to collaborations

---

## Solution

Update the query to exclude campaigns that have **any** collaboration OR have an **accepted** application.

---

## Implementation

### File: `src/hooks/usePublicCampaigns.ts`

**Changes:**

1. **Expand collaboration filter** to include all statuses (`active` AND `completed`):
   ```ts
   const { data: assignedCampaigns } = await supabase
     .from('campaign_collaborations')
     .select('campaign_id')
     .in('status', ['active', 'completed']);
   ```

2. **Add accepted applications filter** to also exclude campaigns where an application was accepted:
   ```ts
   const { data: acceptedApplications } = await supabase
     .from('campaign_applications')
     .select('campaign_id')
     .eq('status', 'accepted');
   ```

3. **Combine both exclusion lists** before filtering campaigns:
   ```ts
   const assignedCampaignIds = [
     ...(assignedCampaigns || []).map(c => c.campaign_id),
     ...(acceptedApplications || []).map(a => a.campaign_id)
   ];
   // Remove duplicates
   const uniqueAssignedIds = [...new Set(assignedCampaignIds)];
   ```

---

## Technical Details

| Current Behavior | New Behavior |
|------------------|--------------|
| Only filters campaigns with `active` collaborations | Filters campaigns with `active` OR `completed` collaborations |
| Doesn't check application status | Also filters campaigns with `accepted` applications |
| Some assigned campaigns still visible | All assigned/completed campaigns hidden |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/usePublicCampaigns.ts` | Update exclusion query to include completed collaborations and accepted applications |

---

## Expected Result

After this change:
- Creators will only see campaigns that are truly available
- Campaigns with an assigned creator (accepted application or active/completed collaboration) will not appear
- The marketplace shows only campaigns they can actually apply to

