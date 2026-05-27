# Auto Cross-Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable restaurants to spread approved campaign deliverables across different posting days, with Donny AI suggesting optimal schedules and the restaurant adjusting before confirming.

**Architecture:** Extends the existing `donny_scheduled_posts` table and `content-posting-plan` edge function. Adds `posting_preferences` JSONB and `posting_schedule_status` to `campaigns`, plus `deliverable_id` FK to `donny_scheduled_posts` and `campaign_social_hooks`. No new tables. Schedule generation is orchestrated server-side by `release-creator-payout` after content approval, with a manual trigger available from the campaign detail page.

**Tech Stack:** React 18, TypeScript (strict), Supabase (Postgres + Edge Functions), React Query, Tailwind CSS with `dc-*` tokens, shadcn/ui, Outstand.so API via outstand-proxy.

**Spec:** `docs/superpowers/specs/2026-05-26-auto-cross-scheduling-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260527100000_posting_schedule_columns.sql` | Migration: add columns to campaigns, donny_scheduled_posts, campaign_social_hooks |
| `src/components/campaign-creator/PostingPreferencesSection.tsx` | Stepped progressive disclosure UI for posting preferences in campaign creation |
| `src/components/schedule/ScheduleReviewScreen.tsx` | Full timeline + cards schedule review screen |
| `src/components/schedule/ScheduleTimeline.tsx` | Horizontal timeline header with date dots |
| `src/components/schedule/ScheduleStatsRow.tsx` | Stats row: Posts / Cross-posts / Days |
| `src/components/schedule/PostCard.tsx` | Individual scheduled post card with edit actions |
| `src/components/schedule/PostApprovalScheduleCTA.tsx` | Inline CTA card shown after content approval |
| `src/components/schedule/CampaignScheduleSection.tsx` | Campaign detail page schedule status section |
| `src/hooks/useScheduledPosts.ts` | React Query hook for scheduled posts by campaign/plan group |
| `src/hooks/useConfirmSchedule.ts` | Mutation hook: confirm and queue all draft posts with Outstand |
| `src/hooks/useReschedulePost.ts` | Mutation hook: edit/cancel individual scheduled posts |
| `supabase/functions/confirm-posting-schedule/index.ts` | Edge function: batch schedule confirmation with Outstand |

### Modified Files
| File | Change |
|------|--------|
| `src/types/campaignCreator.ts` | Add `posting_preferences` to `EditableCampaign` interface |
| `src/hooks/useDraftPosts.ts` | Add `deliverable_id` to `DraftPost` interface |
| `src/hooks/useCampaignCreator.ts` | Include `posting_preferences` in campaign launch payload |
| `src/components/campaign-creator/CampaignEditor.tsx` | Add `PostingPreferencesSection` after Logistics section |
| `src/components/campaigns/detail/ContentReviewSection.tsx` | Add `PostApprovalScheduleCTA` after approval success |
| `src/pages/CampaignDetailsPage.tsx` | Add `CampaignScheduleSection` to business campaign view |
| `supabase/functions/content-posting-plan/index.ts` | Add `posting_preferences` + `deliverable_id` support |
| `supabase/functions/release-creator-payout/index.ts` | Auto-trigger schedule generation after payment release |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Conditional bypass for restaurant auto-drafts + date-specific hooks |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260527100000_posting_schedule_columns.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Auto Cross-Scheduling: add posting preferences and schedule tracking

-- 1. Campaign posting preferences and status
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS posting_preferences JSONB,
  ADD COLUMN IF NOT EXISTS posting_schedule_status TEXT DEFAULT 'not_configured'
    CHECK (posting_schedule_status IN (
      'not_configured', 'configured', 'pending_review',
      'scheduled', 'in_progress', 'completed'
    ));

-- 2. Link scheduled posts to specific deliverables
ALTER TABLE donny_scheduled_posts
  ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES campaign_deliverables(id);

-- 3. Enable date-specific stage 4 hooks (one per deliverable per user)
ALTER TABLE campaign_social_hooks
  ADD COLUMN IF NOT EXISTS deliverable_id UUID REFERENCES campaign_deliverables(id);

ALTER TABLE campaign_social_hooks
  DROP CONSTRAINT IF EXISTS campaign_social_hooks_campaign_id_stage_user_id_key;

ALTER TABLE campaign_social_hooks
  ADD CONSTRAINT campaign_social_hooks_campaign_stage_user_deliverable_key
    UNIQUE (campaign_id, stage, user_id, deliverable_id);

-- 4. Index for querying scheduled posts by deliverable
CREATE INDEX IF NOT EXISTS idx_donny_scheduled_posts_deliverable
  ON donny_scheduled_posts(deliverable_id) WHERE deliverable_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase migration up` (or apply via Supabase dashboard if remote-only)

Verify columns exist:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'campaigns' AND column_name IN ('posting_preferences', 'posting_schedule_status');
```
Expected: 2 rows returned.

- [ ] **Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`

Verify `posting_preferences`, `posting_schedule_status`, and `deliverable_id` appear in the generated types.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527100000_posting_schedule_columns.sql src/integrations/supabase/types.ts
git commit -m "feat: add posting schedule columns to campaigns, donny_scheduled_posts, campaign_social_hooks"
```

---

## Task 2: TypeScript Type Updates

**Files:**
- Modify: `src/types/campaignCreator.ts`
- Modify: `src/hooks/useDraftPosts.ts`

- [ ] **Step 1: Add PostingPreferences type and update EditableCampaign**

In `src/types/campaignCreator.ts`, add the `PostingPreferences` interface and add `posting_preferences` to `EditableCampaign`:

```typescript
export interface PostingPreferences {
  spread_strategy: 'auto' | 'even' | 'front_loaded' | 'custom';
  spread_window_days: 7 | 14 | 21 | 30;
  preferred_days?: string[];
  auto_schedule_on_approval: boolean;
}
```

Add to `EditableCampaign` interface:
```typescript
posting_preferences?: PostingPreferences;
```

- [ ] **Step 2: Add deliverable_id to DraftPost**

In `src/hooks/useDraftPosts.ts`, add to the `DraftPost` interface:

```typescript
deliverable_id: string | null;
```

- [ ] **Step 3: Update useCampaignCreator launch payload**

In `src/hooks/useCampaignCreator.ts`, in the `launchCampaign` function (around line 343), add `posting_preferences` to the campaign insert payload:

```typescript
posting_preferences: editedCampaign.posting_preferences ?? null,
posting_schedule_status: editedCampaign.posting_preferences ? 'configured' : 'not_configured',
```

Also update `ideaToEditableCampaign` (around line 25) to include the default:

```typescript
posting_preferences: {
  spread_strategy: 'auto',
  spread_window_days: 14,
  auto_schedule_on_approval: true,
},
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors related to the new fields.

- [ ] **Step 5: Commit**

```bash
git add src/types/campaignCreator.ts src/hooks/useDraftPosts.ts src/hooks/useCampaignCreator.ts
git commit -m "feat: add PostingPreferences type, deliverable_id to DraftPost, posting_preferences to campaign launch"
```

---

## Task 3: PostingPreferencesSection Component

**Files:**
- Create: `src/components/campaign-creator/PostingPreferencesSection.tsx`

- [ ] **Step 1: Create the component**

This is a stepped progressive disclosure form section. It follows the pattern used by `TimelinePicker.tsx` (chip selection) and `EditorSection.tsx` (collapsible wrapper). The component receives `posting_preferences` and `updateField` from `CampaignEditor`.

```typescript
import { Calendar } from 'lucide-react';
import { PostingPreferences } from '@/types/campaignCreator';

interface PostingPreferencesSectionProps {
  preferences: PostingPreferences;
  onChange: (prefs: PostingPreferences) => void;
  deliverableCount: number;
}
```

**UI structure (stepped progressive disclosure):**
1. Section header with calendar icon + "Posting Schedule" title + "Optional" badge
2. First row: "How do you want to spread your content?" — two chips: "Let Donny decide" (pre-selected when `spread_strategy === 'auto'`) | "I'll pick the days"
3. Revealed when "I'll pick the days" selected (with teal left border):
   - "Over how long?" — four chips: 1 Week / 2 Weeks / 3 Weeks / 1 Month
   - "Any day preferences?" — seven circular day buttons (M T W T F S S)
4. Donny Preview card at bottom showing summary text

**Chip styling (matching TimelinePicker pattern):**
- Selected: `bg-teal-50 border-dc-teal text-dc-teal-dark font-semibold`
- Unselected: `bg-white border-gray-200 text-gray-600 hover:border-gray-300`
- Shape: `rounded-full px-4 py-2`

**Day circle styling:**
- Selected: `w-10 h-10 rounded-full border-2 border-dc-teal bg-dc-teal/15 text-dc-teal font-bold`
- Unselected: `w-10 h-10 rounded-full border border-gray-300 text-gray-500`

**Preview card:**
- Container: `bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3`
- Icon: lightning bolt + "Donny's Preview" label in `text-dc-teal font-semibold text-xs`
- Text: summary like "3 deliverables spread over 2 weeks. Posting on Tuesdays & Saturdays."

**Auto-schedule toggle:**
- Bottom row with toggle switch: "Auto-schedule after approval"
- Subtitle: "Donny creates the schedule when content is approved"
- Toggle: `bg-dc-teal` when on, `bg-gray-200` when off

**State logic:**
- When "Let Donny decide" selected: set `spread_strategy: 'auto'`, hide sub-questions, show preview with generic text
- When "I'll pick the days" selected: set `spread_strategy: 'custom'`, reveal sub-questions
- Day toggles update `preferred_days` array (add/remove day names)
- Window chips update `spread_window_days`
- All changes call `onChange(updatedPrefs)`

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/campaign-creator/PostingPreferencesSection.tsx
git commit -m "feat: add PostingPreferencesSection component for campaign creation"
```

---

## Task 4: Wire PostingPreferencesSection into CampaignEditor

**Files:**
- Modify: `src/components/campaign-creator/CampaignEditor.tsx`

- [ ] **Step 1: Import and add the section**

In `CampaignEditor.tsx`:

1. Import: `import { PostingPreferencesSection } from './PostingPreferencesSection'`
2. After the "Logistics & Targeting" `EditorSection` (around line 146), before the conditional Brand Settings section, add:

```tsx
<EditorSection title="Posting Schedule" id="section-posting-schedule" defaultOpen={false}>
  <PostingPreferencesSection
    preferences={campaign.posting_preferences ?? {
      spread_strategy: 'auto',
      spread_window_days: 14,
      auto_schedule_on_approval: true,
    }}
    onChange={(prefs) => updateField('posting_preferences', prefs)}
    deliverableCount={campaign.deliverables.length}
  />
</EditorSection>
```

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 3: Test in browser**

Run: `npm run dev`
1. Log in as restaurant (dwilliams@harbormill.net)
2. Start creating a campaign — paste a URL or type a description
3. On the Launchpad screen, scroll to the new "Posting Schedule" section
4. Verify "Let Donny decide" is pre-selected
5. Click "I'll pick the days" — verify sub-questions reveal with teal left border
6. Select days, change window — verify preview updates
7. Test on both mobile (base) and desktop (`lg:`) viewports

- [ ] **Step 4: Commit**

```bash
git add src/components/campaign-creator/CampaignEditor.tsx
git commit -m "feat: wire PostingPreferencesSection into campaign editor after Logistics section"
```

---

## Task 5: Extend content-posting-plan Edge Function

**Files:**
- Modify: `supabase/functions/content-posting-plan/index.ts`

- [ ] **Step 1: Add posting_preferences to PlanRequest interface**

At the `PlanRequest` interface (around line 36), add:

```typescript
posting_preferences?: {
  spread_strategy: 'auto' | 'even' | 'front_loaded' | 'custom';
  spread_window_days: number;
  preferred_days?: string[];
};
```

Update the `deliverables` array item type to include:
```typescript
deliverable_id?: string;
```

Add `deliverable_id` to the `PlannedPost` interface (around line 53):
```typescript
deliverable_id?: string;
```

- [ ] **Step 2: Add strategy-aware scheduling logic**

Before the AI prompt construction (around line 306), add a function that maps deliverables to dates based on `posting_preferences`:

```typescript
function assignDatesFromPreferences(
  deliverables: PlanRequest['deliverables'],
  preferences: PlanRequest['posting_preferences'],
  timezone: string
): Array<{ deliverable_id?: string; target_date: string }> {
  if (!preferences) return deliverables.map(d => ({ deliverable_id: d.deliverable_id }));
  
  const now = new Date();
  const windowDays = preferences.spread_window_days || 14;
  
  if (preferences.spread_strategy === 'custom' && preferences.preferred_days?.length) {
    // Assign deliverables to the next occurrences of preferred days
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    };
    const targetDayNumbers = preferences.preferred_days.map(d => dayMap[d.toLowerCase()]).filter(n => n !== undefined);
    // Find next N occurrences of target days within window
    const dates: Date[] = [];
    for (let i = 1; i <= windowDays && dates.length < deliverables.length; i++) {
      const candidate = new Date(now.getTime() + i * 86400000);
      if (targetDayNumbers.includes(candidate.getDay())) {
        dates.push(candidate);
      }
    }
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: dates[i]?.toISOString().split('T')[0] ?? '',
    }));
  }
  
  if (preferences.spread_strategy === 'even') {
    const gap = Math.floor(windowDays / deliverables.length);
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: new Date(now.getTime() + (i * gap + 1) * 86400000).toISOString().split('T')[0],
    }));
  }
  
  if (preferences.spread_strategy === 'front_loaded') {
    const frontWindow = Math.ceil(windowDays / 3);
    const gap = Math.max(1, Math.floor(frontWindow / deliverables.length));
    return deliverables.map((d, i) => ({
      deliverable_id: d.deliverable_id,
      target_date: new Date(now.getTime() + (i * gap + 1) * 86400000).toISOString().split('T')[0],
    }));
  }
  
  // 'auto' — let AI decide (no date constraints passed to prompt)
  return deliverables.map(d => ({ deliverable_id: d.deliverable_id }));
}
```

- [ ] **Step 3: Integrate preferences into the AI prompt**

In the system prompt construction (around line 306), when `posting_preferences` is provided, add scheduling constraints:

```typescript
const dateAssignments = assignDatesFromPreferences(
  planRequest.deliverables, planRequest.posting_preferences, resolvedTimezone
);

// Add to AI system prompt
let scheduleConstraint = '';
if (planRequest.posting_preferences && planRequest.posting_preferences.spread_strategy !== 'auto') {
  const assignments = dateAssignments
    .filter(a => a.target_date)
    .map((a, i) => `Deliverable ${i + 1}: post on ${a.target_date}`)
    .join('\n');
  scheduleConstraint = `\n\nSCHEDULING CONSTRAINTS:\n${assignments}\nUse the platform-optimal time of day for each date. Spread window: ${planRequest.posting_preferences.spread_window_days} days.`;
}
```

Append `scheduleConstraint` to the system prompt string.

- [ ] **Step 4: Pass through deliverable_id in response**

After parsing the AI response (around line 370), map `deliverable_id` from input to output:

```typescript
const postsWithDeliverableIds = parsedPosts.map((post: PlannedPost, i: number) => ({
  ...post,
  deliverable_id: dateAssignments[i]?.deliverable_id ?? null,
}));
```

Use `postsWithDeliverableIds` instead of `parsedPosts` in the response.

- [ ] **Step 5: Add service-role rate limit bypass**

At the rate limit check (around line 171), add a bypass for service-role callers:

```typescript
const authHeader = req.headers.get('Authorization') ?? '';
const isServiceRole = authHeader === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

if (!isServiceRole) {
  const { allowed, retryAfterSeconds } = await checkHourlyRateLimit(supabaseAdmin, user.id);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limited', retryAfterSeconds }), {
      status: 429, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
    });
  }
}
```

- [ ] **Step 6: Build and commit**

Run: `npm run build`
Expected: PASS

```bash
git add supabase/functions/content-posting-plan/index.ts
git commit -m "feat: extend content-posting-plan with posting_preferences, deliverable_id passthrough, service-role bypass"
```

---

## Task 6: Extend release-creator-payout for Auto-Schedule Generation

**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`

- [ ] **Step 1: Add schedule generation after Phase 3**

After Phase 3 (around line 242, after setting collaboration status to 'completed'), add the auto-schedule trigger:

```typescript
// Auto Cross-Scheduling: generate posting schedule if preferences exist
try {
  const { data: campaignData } = await supabaseAdmin
    .from('campaigns')
    .select('posting_preferences, id')
    .eq('id', collaboration.campaign_id)
    .single();

  if (campaignData?.posting_preferences?.auto_schedule_on_approval) {
    // Fetch approved deliverables for this collaboration
    const { data: deliverables } = await supabaseAdmin
      .from('file_uploads')
      .select('id, file_path, mime_type, original_filename, metadata')
      .eq('campaign_id', collaboration.campaign_id)
      .eq('uploaded_by', collaboration.creator_id)
      .eq('file_category', 'deliverable')
      .eq('upload_status', 'completed');

    if (deliverables && deliverables.length > 0) {
      // Fetch connected platforms for the business
      const { data: accounts } = await supabaseAdmin
        .from('business_outstand_accounts')
        .select('platform, platform_handle')
        .eq('user_id', userId);

      const connectedPlatforms = (accounts ?? []).map(a => ({
        platform: a.platform,
        platform_handle: a.platform_handle,
      }));

      if (connectedPlatforms.length > 0) {
        // Get signed URLs for deliverables
        const deliverableInputs = await Promise.all(deliverables.map(async (d) => {
          const { data: signedUrl } = await supabaseAdmin.storage
            .from('campaign-deliverables')
            .createSignedUrl(d.file_path, 3600);
          return {
            url: signedUrl?.signedUrl ?? '',
            mime_type: d.mime_type,
            filename: d.original_filename,
            deliverable_id: (d.metadata as Record<string, unknown>)?.deliverable_id as string ?? d.id,
          };
        }));

        // Call content-posting-plan internally
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

        const planResponse = await fetch(`${supabaseUrl}/functions/v1/content-posting-plan`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            deliverables: deliverableInputs,
            posting_preferences: campaignData.posting_preferences,
            connected_platforms: connectedPlatforms,
            campaign: { id: campaignData.id, title: collaboration.campaign_title },
            user_id: userId,
          }),
        });

        if (planResponse.ok) {
          const planData = await planResponse.json();
          const planGroupId = crypto.randomUUID();

          // Insert draft posts
          const draftRows = (planData.posts ?? []).map((post: Record<string, unknown>, i: number) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            campaign_id: collaboration.campaign_id,
            platform: post.platform,
            content_type: post.content_type,
            caption: post.caption,
            media_urls: post.media_urls,
            hashtags: post.hashtags,
            scheduled_at: post.scheduled_at,
            status: 'draft',
            ai_suggested_time: true,
            ai_reasoning: post.ai_reasoning,
            metadata: { source: 'auto_cross_schedule', strategy_summary: planData.strategy_summary },
            plan_group_id: planGroupId,
            plan_order: i,
            deliverable_id: post.deliverable_id ?? null,
          }));

          if (draftRows.length > 0) {
            await supabaseAdmin.from('donny_scheduled_posts').insert(draftRows);
            await supabaseAdmin
              .from('campaigns')
              .update({ posting_schedule_status: 'pending_review' })
              .eq('id', collaboration.campaign_id);
          }
        }
      }
    }
  }
} catch (scheduleError) {
  // Non-blocking: schedule generation failure should not prevent payout success
  console.error('Auto-schedule generation failed:', scheduleError);
}
```

- [ ] **Step 2: Build and commit**

Run: `npm run build`
Expected: PASS

```bash
git add supabase/functions/release-creator-payout/index.ts
git commit -m "feat: auto-generate posting schedule in release-creator-payout after content approval"
```

---

## Task 7: Extend fire-campaign-social-hook for Conditional Bypass

**Files:**
- Modify: `supabase/functions/fire-campaign-social-hook/index.ts`

- [ ] **Step 1: Add conditional bypass for restaurant auto-drafts at stage 4**

At the beginning of the stage 4 processing block (around line 103), before the restaurant auto-draft creation:

```typescript
// Check if campaign has posting preferences — if so, skip restaurant auto-draft
// (spread-schedule flow in release-creator-payout handles restaurant scheduling)
const { data: campaignPrefs } = await supabaseAdmin
  .from('campaigns')
  .select('posting_preferences')
  .eq('id', campaign_id)
  .single();

const hasAutoSchedule = campaignPrefs?.posting_preferences?.auto_schedule_on_approval === true;
```

Then wrap the restaurant auto-draft creation block (lines ~124-310) in:
```typescript
if (!hasAutoSchedule) {
  // ... existing restaurant auto-draft creation code ...
}
```

Creator and brand hook creation code continues unchanged after this block.

- [ ] **Step 2: Update upsert onConflict key**

Find all upserts to `campaign_social_hooks` in this file (search for `onConflict`). Update from:

```typescript
onConflict: 'campaign_id,stage,user_id'
```

to:

```typescript
onConflict: 'campaign_id,stage,user_id,deliverable_id'
```

Ensure the upsert row includes `deliverable_id: null` for non-date-specific hooks.

- [ ] **Step 3: Build and commit**

Run: `npm run build`
Expected: PASS

```bash
git add supabase/functions/fire-campaign-social-hook/index.ts
git commit -m "feat: conditional bypass for restaurant auto-drafts when posting preferences exist, update upsert conflict key"
```

---

## Task 8: useScheduledPosts Hook

**Files:**
- Create: `src/hooks/useScheduledPosts.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ScheduledPost {
  id: string;
  user_id: string;
  campaign_id: string | null;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  published_at: string | null;
  status: string;
  ai_suggested_time: boolean;
  ai_reasoning: string | null;
  metadata: Record<string, unknown> | null;
  plan_group_id: string | null;
  plan_order: number | null;
  deliverable_id: string | null;
  created_at: string;
}

export function useScheduledPosts(campaignId: string | undefined, planGroupId?: string) {
  return useQuery({
    queryKey: ['scheduled-posts', campaignId, planGroupId],
    queryFn: async () => {
      let query = supabase
        .from('donny_scheduled_posts')
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, published_at, status, ai_suggested_time, ai_reasoning, metadata, plan_group_id, plan_order, deliverable_id, created_at')
        .eq('campaign_id', campaignId!)
        .order('plan_order', { ascending: true });

      if (planGroupId) {
        query = query.eq('plan_group_id', planGroupId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ScheduledPost[];
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useScheduledPosts.ts
git commit -m "feat: add useScheduledPosts hook for querying scheduled posts by campaign"
```

---

## Task 9: Schedule UI Components (Timeline, Stats, PostCard)

**Files:**
- Create: `src/components/schedule/ScheduleTimeline.tsx`
- Create: `src/components/schedule/ScheduleStatsRow.tsx`
- Create: `src/components/schedule/PostCard.tsx`

- [ ] **Step 1: Create ScheduleTimeline**

Horizontal gradient timeline with dots at posting dates. Receives an array of `{ date: string; contentType: string; status: string }` entries.

```typescript
interface TimelineEntry {
  date: string;       // ISO date
  contentType: string; // 'photo', 'video_reel', 'carousel', etc.
  status: string;      // 'draft', 'scheduled', 'published'
}

interface ScheduleTimelineProps {
  entries: TimelineEntry[];
  spreadWindowDays: number;
}
```

**Visual structure:**
- White card container: `bg-white rounded-2xl p-4`
- Horizontal line: gradient from dc-teal to dc-pink, `h-[3px] rounded-full`
- Date dots positioned proportionally along the line based on date spread
- Each dot: `w-9 h-9 rounded-full` with content type emoji, colored bg (alternating teal/pink)
- Day label below each dot: `text-[10px] font-semibold text-gray-500` for day name, `text-[10px] text-gray-400` for date
- Empty day markers: `w-2 h-2 rounded-full bg-gray-200`

- [ ] **Step 2: Create ScheduleStatsRow**

Stats summary row with pink dividers matching the design system's portfolio stats pattern.

```typescript
interface ScheduleStatsRowProps {
  postCount: number;
  crossPostCount: number; // postCount * connectedPlatformCount
  spreadDays: number;
}
```

**Visual structure:**
- White card: `bg-white rounded-2xl p-4`
- Three columns: `flex justify-around items-center text-center`
- Number: `text-2xl font-extrabold text-dc-text`
- Label: `text-xs text-dc-text-muted`
- Dividers: `w-px bg-dc-pink` between columns

- [ ] **Step 3: Create PostCard**

Individual post card with edit actions.

```typescript
interface PostCardProps {
  post: ScheduledPost;
  index: number;
  total: number;
  onEditCaption: (postId: string) => void;
  onChangeDate: (postId: string) => void;
  onCancel?: (postId: string) => void;
  isEditing?: boolean;
}
```

**Visual structure:**
- White card: `bg-white rounded-2xl p-4 border-l-4` with alternating `border-dc-teal` / `border-dc-pink`
- Top row: sequence badge ("1 of 3") in teal/pink pill + date/time in gray
- Title: content type + title, `font-semibold text-sm text-dc-text`
- Caption preview: `text-xs text-dc-text-muted line-clamp-2`
- Platform badges: small pills with platform colors (Instagram gradient, TikTok black, YouTube red)
- Action row: "Edit Caption" (teal outline pill) + "Change Date" (gray outline pill)
- Published state: "Published" badge with check icon, card dimmed slightly

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleTimeline.tsx src/components/schedule/ScheduleStatsRow.tsx src/components/schedule/PostCard.tsx
git commit -m "feat: add ScheduleTimeline, ScheduleStatsRow, and PostCard components"
```

---

## Task 10: ScheduleReviewScreen Component

**Files:**
- Create: `src/components/schedule/ScheduleReviewScreen.tsx`

- [ ] **Step 1: Create the composite screen**

This component composes `ScheduleTimeline`, `ScheduleStatsRow`, and `PostCard` into the full review experience. It follows the pattern of `PostingPlanReview.tsx` (modal workflow with loading/review/confirmed states).

```typescript
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface ScheduleReviewScreenProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignTitle: string;
  planGroupId?: string;
  connectedPlatformCount: number;
  onConfirm?: () => void;
}
```

**State management:**
- `viewState: 'loading' | 'review' | 'confirming' | 'confirmed' | 'error'`
- `editingPostId: string | null` — which post card is in edit mode
- `editingField: 'caption' | 'date' | null` — which field is being edited

**Layout (inside Sheet):**
1. Header card: campaign title, deliverable count, "Donny Optimized" badge
2. `ScheduleStatsRow`
3. `ScheduleTimeline`
4. List of `PostCard` components, one per post from `useScheduledPosts(campaignId, planGroupId)`
5. Confirm button: full-width teal pill `bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full py-3 font-bold`
6. Subtext: `text-xs text-center text-dc-text-muted`

**Edit flows:**
- Caption edit: inline textarea expand below caption preview, with "Regenerate with Donny" button that calls `social-caption` edge function
- Date edit: shadcn `Calendar` component in a popover, anchored to the card's "Change Date" button
- Time edit: time input field with Donny's suggestion shown as placeholder

**On confirm:** Call `useConfirmSchedule` mutation (Task 12).

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/ScheduleReviewScreen.tsx
git commit -m "feat: add ScheduleReviewScreen composite component with edit flows"
```

---

## Task 11: PostApprovalScheduleCTA + ContentReviewSection Integration

**Files:**
- Create: `src/components/schedule/PostApprovalScheduleCTA.tsx`
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`

- [ ] **Step 1: Create PostApprovalScheduleCTA**

Inline CTA card that appears after content approval.

```typescript
interface PostApprovalScheduleCTAProps {
  campaignId: string;
  campaignTitle: string;
  postingScheduleStatus: string;
  onReviewSchedule: () => void;
}
```

**Visual structure:**
- Card: `bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4`
- Icon: calendar with check
- Title: "Content approved and payment released!"
- Subtitle: "Your posting schedule is ready to review."
- Button: `bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full w-full py-3 font-bold` — "Review Schedule"

**Conditional rendering:**
- Show only when `postingScheduleStatus === 'pending_review'`
- Replace the existing "Review & Schedule" button text (currently at line ~415 of ContentReviewSection)

- [ ] **Step 2: Integrate into ContentReviewSection**

In `ContentReviewSection.tsx`, after the approval success block (around line 419):

1. Import `PostApprovalScheduleCTA` and `ScheduleReviewScreen`
2. Add state: `const [scheduleReviewOpen, setScheduleReviewOpen] = useState(false)`
3. Query the campaign's `posting_schedule_status` from the existing campaign data (it should already be in the parent's query data)
4. Replace or supplement the existing "Review & Schedule" button with:

```tsx
{campaign?.posting_schedule_status === 'pending_review' && (
  <>
    <PostApprovalScheduleCTA
      campaignId={campaign.id}
      campaignTitle={campaign.title}
      postingScheduleStatus={campaign.posting_schedule_status}
      onReviewSchedule={() => setScheduleReviewOpen(true)}
    />
    <ScheduleReviewScreen
      open={scheduleReviewOpen}
      onOpenChange={setScheduleReviewOpen}
      campaignId={campaign.id}
      campaignTitle={campaign.title}
      connectedPlatformCount={3}
    />
  </>
)}
```

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/PostApprovalScheduleCTA.tsx src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "feat: add PostApprovalScheduleCTA and integrate into ContentReviewSection"
```

---

## Task 12: confirm-posting-schedule Edge Function + useConfirmSchedule Hook

**Files:**
- Create: `supabase/functions/confirm-posting-schedule/index.ts`
- Create: `src/hooks/useConfirmSchedule.ts`

- [ ] **Step 1: Create the edge function**

This function takes a `plan_group_id`, fetches all draft posts in that group, queues each with Outstand, updates their status, fires social hooks, and updates the campaign status.

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
```

**Request body:** `{ plan_group_id: string, campaign_id: string }`

**Flow:**
1. Validate auth, get user
2. Fetch all `donny_scheduled_posts` with matching `plan_group_id` and `status = 'draft'`
3. For each post:
   a. Fetch user's Outstand accounts for the post's platform
   b. Call Outstand API via fetch to queue the post: `POST ${OUTSTAND_PROXY_URL}/posts/` with `scheduledAt`
   c. Store returned Outstand post ID in `metadata.outstand_post_id`
   d. Update `status = 'scheduled'`
4. Update `campaigns.posting_schedule_status = 'scheduled'`
5. Fetch collaboration info to get creator_id and brand_id
6. For each post, create `campaign_social_hooks` for creator (and brand if exists):
   - `stage: 4`, `deliverable_id` from the post, `party_role: 'creator'`
   - `content_template`: "Restaurant is posting your [content_type] on [date]. Boost engagement by sharing your version!"
7. Create/update `triple_post_sessions` entry
8. Return `{ success: true, scheduled_count: N }`

**Error handling:**
- If individual post scheduling fails, mark that post as `status = 'failed'` and continue with remaining posts
- Return partial success with `{ success: true, scheduled_count, failed_count }`

- [ ] **Step 2: Create useConfirmSchedule hook**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useConfirmSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ planGroupId, campaignId }: { planGroupId: string; campaignId: string }) => {
      const { data, error } = await supabase.functions.invoke('confirm-posting-schedule', {
        body: { plan_group_id: planGroupId, campaign_id: campaignId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success(`${data.scheduled_count} posts scheduled successfully`);
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to confirm schedule: ${error.message}`);
    },
  });
}
```

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/confirm-posting-schedule/index.ts src/hooks/useConfirmSchedule.ts
git commit -m "feat: add confirm-posting-schedule edge function and useConfirmSchedule hook"
```

---

## Task 13: useReschedulePost Hook

**Files:**
- Create: `src/hooks/useReschedulePost.ts`

- [ ] **Step 1: Create the hook**

Handles editing a single post (date, time, caption) and canceling posts.

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RescheduleInput {
  postId: string;
  campaignId: string;
  scheduledAt?: string;
  caption?: string;
  hashtags?: string[];
}

export function useReschedulePost() {
  const queryClient = useQueryClient();

  const reschedule = useMutation({
    mutationFn: async (input: RescheduleInput) => {
      const updates: Record<string, unknown> = {};
      if (input.scheduledAt) updates.scheduled_at = input.scheduledAt;
      if (input.caption !== undefined) updates.caption = input.caption;
      if (input.hashtags) updates.hashtags = input.hashtags;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update(updates)
        .eq('id', input.postId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Post updated');
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update post: ${error.message}`);
    },
  });

  const cancel = useMutation({
    mutationFn: async ({ postId, campaignId }: { postId: string; campaignId: string }) => {
      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast.success('Post cancelled');
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts', variables.campaignId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel post: ${error.message}`);
    },
  });

  return { reschedule, cancel };
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReschedulePost.ts
git commit -m "feat: add useReschedulePost hook for editing and canceling scheduled posts"
```

---

## Task 14: Campaign Detail Page Schedule Section

**Files:**
- Create: `src/components/schedule/CampaignScheduleSection.tsx`
- Modify: `src/pages/CampaignDetailsPage.tsx`

- [ ] **Step 1: Create CampaignScheduleSection**

Status-based section that shows different content depending on `posting_schedule_status`.

```typescript
interface CampaignScheduleSectionProps {
  campaignId: string;
  campaignTitle: string;
  postingScheduleStatus: string | null;
  onOpenScheduleReview: () => void;
}
```

**Rendering by status:**
- `not_configured` / `null`: Don't render (return null)
- `configured`: CTA card — "Schedule your posts" with deliverable count, "Generate Schedule" button that calls `content-posting-plan` manually
- `pending_review`: CTA card — "Your posting schedule is ready to review" with "Review Schedule" button
- `scheduled` / `in_progress`: Compact summary card — "1 of 3 posted — next post Saturday 6:00 PM" with "Manage Schedule" button. Uses `useScheduledPosts` to compute counts.
- `completed`: Success card — "All posts published" with green check icon and completion date

**Styling:** Match `CollapsibleBriefSection` pattern from the campaign detail page sidebar.

- [ ] **Step 2: Integrate into CampaignDetailsPage**

In `src/pages/CampaignDetailsPage.tsx`, in the business view left column (around line 542, after `SocialNudgeBanner`):

1. Import `CampaignScheduleSection` and `ScheduleReviewScreen`
2. Add state: `const [scheduleReviewOpen, setScheduleReviewOpen] = useState(false)`
3. Add:

```tsx
<CampaignScheduleSection
  campaignId={campaign.id}
  campaignTitle={campaign.title}
  postingScheduleStatus={campaign.posting_schedule_status}
  onOpenScheduleReview={() => setScheduleReviewOpen(true)}
/>
<ScheduleReviewScreen
  open={scheduleReviewOpen}
  onOpenChange={setScheduleReviewOpen}
  campaignId={campaign.id}
  campaignTitle={campaign.title}
  connectedPlatformCount={3}
/>
```

4. Ensure the campaign query includes `posting_schedule_status` in its select list.

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 4: Test in browser**

Run: `npm run dev`
1. Log in as restaurant
2. Navigate to a campaign detail page
3. If campaign has `posting_schedule_status`, verify the correct section renders
4. Test on both mobile and desktop viewports

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/CampaignScheduleSection.tsx src/pages/CampaignDetailsPage.tsx
git commit -m "feat: add CampaignScheduleSection to campaign detail page with status-based rendering"
```

---

## Task 15: End-to-End Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: PASS with no errors

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

- [ ] **Step 3: Run existing tests**

Run: `npm run test`
Expected: All existing tests PASS (no regressions)

- [ ] **Step 4: Manual E2E test — Campaign creation with posting preferences**

1. Log in as restaurant (dwilliams@harbormill.net / Pdi@mondz1)
2. Create a new campaign with 3 deliverables
3. Open the "Posting Schedule" section
4. Verify "Let Donny decide" is pre-selected
5. Switch to "I'll pick the days" → verify sub-questions appear
6. Select 2 Weeks + Tuesday, Saturday, Monday
7. Verify Donny Preview updates
8. Launch the campaign
9. Verify `posting_preferences` saved (check Supabase dashboard or query)

- [ ] **Step 5: Manual E2E test — Post-approval schedule review**

1. With an approved collaboration, verify the PostApprovalScheduleCTA appears
2. Click "Review Schedule" — verify ScheduleReviewScreen opens
3. Verify timeline shows dates, cards show deliverables with AI captions
4. Edit a caption — verify changes persist
5. Change a date — verify timeline updates
6. Click "Confirm & Schedule All Posts"
7. Verify posts move to `scheduled` status
8. Verify campaign `posting_schedule_status` changes to `scheduled`

- [ ] **Step 6: Manual E2E test — Campaign detail page**

1. Navigate to the campaign detail page
2. Verify the CampaignScheduleSection shows the correct status
3. Click "Manage Schedule" — verify ScheduleReviewScreen opens for editing

- [ ] **Step 7: Mobile + Desktop viewport check**

Test all UI on both viewports:
- Mobile (375px): base Tailwind classes apply
- Desktop (1024px+): `lg:` prefixed classes apply
- Verify no layout breaks, overflow, or cut-off content

- [ ] **Step 8: Check for console errors**

Open Chrome DevTools on each screen. Verify no console errors related to the new components.
