# CGC Campaigns Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the CGC Campaigns feature to reduce creation to 3 fields, customer submission to 3 steps, and unify approval with social posting into a single "Approve & Post" action.

**Architecture:** Four migration phases (backend → new components → UI swap → cleanup). The core change reorganizes existing infrastructure (Outstand hooks, AI captions, notification system) into a unified approval flow. Three new database migrations, one edge function update, four new components, one new hook, three modified components, two modified hooks. No new tables.

**Tech Stack:** React 18, TypeScript strict, Tailwind CSS with `dc-*` tokens, shadcn/ui (Sheet, Collapsible, Tabs), React Query, Supabase (Postgres, Edge Functions, Storage), Outstand.so via `outstand-proxy`, Anthropic Claude via `social-caption` edge function.

**Spec:** `docs/superpowers/specs/2026-05-26-cgc-campaigns-optimization-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260527000001_cgc_nullable_customer_fields.sql` | Migration 1: DROP NOT NULL on customer_name, customer_phone, discount_codes.customer_phone |
| `supabase/migrations/20260527000002_cgc_posting_preferences.sql` | Migration 2: Add cgc_posting_preferences JSONB to business_profiles |
| `supabase/migrations/20260527000003_cgc_scheduled_posts_index.sql` | Migration 3: Partial index on donny_scheduled_posts for promotion queries |
| `src/hooks/useCGCReviewSheet.ts` | Pre-fetch hook: AI caption, schedule suggestion, connected accounts, posting preferences |
| `src/components/promotions/CGCReviewSheet.tsx` | Unified approve-and-post bottom sheet (mobile) / side panel (desktop) |
| `src/components/promotions/SocialPostEditor.tsx` | Zone 2: caption editor, platform chips, timing toggle |
| `src/components/promotions/CGCContentLibrary.tsx` | Merged filterable view replacing Pending + Videos + Codes tabs |
| `src/components/promotions/CGCPostingPreferences.tsx` | Settings card for auto-post configuration |

### Modified Files

| File | Change Summary |
|------|---------------|
| `supabase/functions/send-promotion-notification/index.ts` | Make customerName/customerPhone optional, skip SMS when phone null, "Hi there" fallback |
| `src/hooks/usePromotions.ts` | Extend reviewSubmission with social posting params, add social stats query |
| `src/hooks/usePromotionSubmission.ts` | Remove name/phone from required fields, update dedup to email-only |
| `src/components/promotions/CreatePromotionModal.tsx` | Simplify to 3 fields + advanced expandable |
| `src/pages/BusinessPromotionalTools.tsx` | New layout: priority banner, 3 stat cards, 2 tabs |
| `src/pages/PromotionSubmissionPage.tsx` | Camera-first flow, email-only required, post-submission social handles |
| `src/components/promotions/CustomerInfoForm.tsx` | Make name/phone optional, simplify layout |

---

## Phase 1: Backend (Zero User Impact)

### Task 1: Database Migration — Nullable Customer Fields

**Files:**
- Create: `supabase/migrations/20260527000001_cgc_nullable_customer_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Make customer fields nullable for simplified CGC submission flow
-- Spec ref: Section 3.2, Section 4.3 Migration 1

ALTER TABLE promotion_submissions
  ALTER COLUMN customer_name DROP NOT NULL;

ALTER TABLE promotion_submissions
  ALTER COLUMN customer_phone DROP NOT NULL;

ALTER TABLE discount_codes
  ALTER COLUMN customer_phone DROP NOT NULL;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or apply via Supabase dashboard for remote)

Expected: Migration applies cleanly, no errors.

- [ ] **Step 3: Verify columns are nullable**

Run against the database:
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name IN ('promotion_submissions', 'discount_codes')
  AND column_name IN ('customer_name', 'customer_phone');
```

Expected: All three show `is_nullable = 'YES'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527000001_cgc_nullable_customer_fields.sql
git commit -m "feat(db): make customer_name and customer_phone nullable for CGC optimization"
```

---

### Task 2: Database Migration — CGC Posting Preferences

**Files:**
- Create: `supabase/migrations/20260527000002_cgc_posting_preferences.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Add CGC posting preferences JSONB to business_profiles
-- Spec ref: Section 3.5, Section 4.3 Migration 2
-- Schema: { auto_post_enabled: bool, default_platforms: string[],
--           default_timing: "immediate"|"optimal", caption_style: "ai"|"template",
--           custom_caption_template: string|null }

ALTER TABLE business_profiles
ADD COLUMN cgc_posting_preferences JSONB DEFAULT NULL;

COMMENT ON COLUMN business_profiles.cgc_posting_preferences IS
  'CGC auto-post preferences. NULL = system defaults (all platforms, immediate, AI captions).';
```

- [ ] **Step 2: Apply migration and verify**

Run: `npx supabase db push`

Verify: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'business_profiles' AND column_name = 'cgc_posting_preferences';`

Expected: Shows `jsonb` type.

- [ ] **Step 3: Regenerate Supabase types**

Run: `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

Verify: Search the generated file for `cgc_posting_preferences` — should appear in the `business_profiles` Row, Insert, and Update types as `Json | null`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527000002_cgc_posting_preferences.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add cgc_posting_preferences JSONB column to business_profiles"
```

---

### Task 3: Database Migration — Scheduled Posts Index

**Files:**
- Create: `supabase/migrations/20260527000003_cgc_scheduled_posts_index.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Partial index for promotion-sourced scheduled posts
-- Spec ref: Section 3.4 (Posted to Social stat card), Section 4.3 Migration 3

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_donny_scheduled_posts_promotion
ON donny_scheduled_posts (user_id, status)
WHERE metadata->>'source' = 'promotion';
```

- [ ] **Step 2: Apply and verify**

Run: `npx supabase db push`

Verify: `SELECT indexname FROM pg_indexes WHERE tablename = 'donny_scheduled_posts' AND indexname = 'idx_donny_scheduled_posts_promotion';`

Expected: One row returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260527000003_cgc_scheduled_posts_index.sql
git commit -m "feat(db): add partial index on donny_scheduled_posts for promotion social stats"
```

---

### Task 4: Update send-promotion-notification Edge Function

**Files:**
- Modify: `supabase/functions/send-promotion-notification/index.ts:7-18` (interface), `:67-127` (email template), `:196-250` (SMS guard)

- [ ] **Step 1: Update the TypeScript interface to make name and phone optional**

In `supabase/functions/send-promotion-notification/index.ts`, find the `PromotionNotificationRequest` interface (lines 7-18) and make `customerName` and `customerPhone` optional:

```typescript
interface PromotionNotificationRequest {
  type: 'video_approved' | 'video_rejected';
  customerEmail: string;
  customerPhone?: string;  // Was required, now optional
  customerName?: string;   // Was required, now optional
  discountCode?: string;
  businessName: string;
  discountType: string;
  discountValue: number;
  expiresAt?: string;
  rejectionReason?: string;
}
```

- [ ] **Step 2: Add null phone guard to SMS section**

Find the SMS sending section (around line 196). Add a guard at the top of the SMS block, before the Twilio credentials check:

```typescript
// Skip SMS if no phone number provided
if (!data.customerPhone || data.customerPhone.trim() === '') {
  console.warn('No customer phone provided, skipping SMS');
} else if (/* existing Twilio credentials check */) {
```

- [ ] **Step 3: Add name fallback in email templates**

In both email templates (approval ~line 76, rejection ~line 140), replace direct `customerName` references with a fallback:

```typescript
const displayName = data.customerName || 'there';
// Then in the template: `Hi ${esc(displayName)},`
```

Apply the `htmlEscape` (or `esc`) function to `displayName` just as it was applied to `customerName` before.

- [ ] **Step 4: Test edge function locally**

Run: `npx supabase functions serve send-promotion-notification`

Test with curl — approval with no phone:
```bash
curl -X POST http://localhost:54321/functions/v1/send-promotion-notification \
  -H "Authorization: Bearer <test-token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"video_approved","customerEmail":"test@example.com","businessName":"Test Biz","discountType":"percentage","discountValue":15,"discountCode":"ABC123"}'
```

Expected: 200 response with `emailSent: true`, `smsSent: false`, no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-promotion-notification/index.ts
git commit -m "feat(edge): make customerName/customerPhone optional in send-promotion-notification"
```

---

### Task 5: Build and verify Phase 1

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: Clean build, no errors. (Migrations don't affect the frontend build, but the regenerated types.ts does.)

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: No new errors. The nullable types change may surface warnings in `usePromotions.ts` where `submission.customer_phone` is passed — these are expected and will be addressed in Phase 2 Task 8.

- [ ] **Step 3: Commit if any type fixes needed**

```bash
git add -A
git commit -m "fix: resolve type warnings from nullable customer fields"
```

---

## Phase 2: New Components (Zero User Impact)

> **Execution order:** Tasks 6, 7, **11, 12** (hook extensions), then 8, 9, 10, 13.
> Tasks 11–12 extend `usePromotions` and `usePromotionSubmission` with the
> social params and nullable types that Tasks 8–10 depend on. Execute them
> first to avoid compilation errors.

### Task 6: Create useCGCReviewSheet Hook

**Files:**
- Create: `src/hooks/useCGCReviewSheet.ts`

**Dependencies:** Uses `useLocationSocialAccounts` (`src/hooks/outstand/useLocationSocialAccounts.ts`), reads `business_profiles.cgc_posting_preferences`, calls `social-caption` and `donny-schedule` edge functions.

- [ ] **Step 1: Create the hook file**

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

interface CGCPostingPreferences {
  auto_post_enabled: boolean;
  default_platforms: string[];
  default_timing: 'immediate' | 'optimal';
  caption_style: 'ai' | 'template';
  custom_caption_template: string | null;
}

interface ReviewSheetData {
  caption: string;
  hashtags: string[];
  suggestedTime: string | null;
  defaultPlatforms: string[];
  connectedAccounts: Array<{
    id: string;
    platform: string;
    platform_handle: string | null;
    outstand_social_account_id: string;
  }>;
  preferences: CGCPostingPreferences | null;
  isLoading: boolean;
  error: string | null;
}

export function useCGCReviewSheet(
  submissionId: string | null,
  promotionTitle: string,
  videoUrl: string | null
): ReviewSheetData {
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggestedTime, setSuggestedTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const userId = user?.id;
  const { data: accounts = [] } = useLocationSocialAccounts(userId);

  const { data: prefsData } = useQuery({
    queryKey: ['cgc-posting-preferences', userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('business_profiles')
        .select('cgc_posting_preferences')
        .eq('user_id', userId)
        .single();
      return (data?.cgc_posting_preferences as CGCPostingPreferences) ?? null;
    },
  });

  useEffect(() => {
    if (!submissionId || accounts.length === 0) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchSocialData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;

      // Fetch caption and schedule in parallel
      const [captionRes, scheduleRes] = await Promise.allSettled([
        fetch(`${baseUrl}/functions/v1/social-caption`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            campaign_title: promotionTitle,
            campaign_description: '',
            content_type: 'video',
            party_role: 'restaurant',
            platform: accounts[0]?.platform || 'instagram',
            user_id: session.user.id,
            source: 'promotion',
            context: { promotion_title: promotionTitle },
          }),
        }).then(r => r.json()),
        fetch(`${baseUrl}/functions/v1/donny-schedule`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'suggest_times',
            platform: accounts[0]?.platform || 'instagram',
            content_type: 'video',
          }),
        }).then(r => r.json()),
      ]);

      if (cancelled) return;

      if (captionRes.status === 'fulfilled' && captionRes.value?.caption) {
        setCaption(captionRes.value.caption);
        setHashtags(captionRes.value.hashtags || []);
      }

      if (scheduleRes.status === 'fulfilled' && scheduleRes.value?.slots?.[0]) {
        setSuggestedTime(scheduleRes.value.slots[0].datetime);
      } else {
        // Fallback: +24 hours from now
        setSuggestedTime(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      }

      setIsLoading(false);
    };

    fetchSocialData().catch(err => {
      if (!cancelled) {
        console.error('CGC review sheet pre-fetch failed:', err);
        setError('Failed to load social posting data');
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [submissionId, accounts, promotionTitle]);

  const defaultPlatforms = prefsData?.default_platforms
    ?? accounts.map(a => a.platform);

  return {
    caption,
    hashtags,
    suggestedTime,
    defaultPlatforms,
    connectedAccounts: accounts.map(a => ({
      id: a.id,
      platform: a.platform,
      platform_handle: a.platform_handle ?? null,
      outstand_social_account_id: a.outstand_social_account_id,
    })),
    preferences: prefsData ?? null,
    isLoading,
    error,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCGCReviewSheet.ts
git commit -m "feat: add useCGCReviewSheet hook for pre-fetching social data"
```

---

### Task 7: Create SocialPostEditor Component

**Files:**
- Create: `src/components/promotions/SocialPostEditor.tsx`

**Dependencies:** Receives data from `useCGCReviewSheet`. Uses `dc-*` Tailwind tokens, shadcn/ui components.

- [ ] **Step 1: Create the component**

```typescript
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Download, Copy, ExternalLink } from 'lucide-react';

interface ConnectedAccount {
  id: string;
  platform: string;
  platform_handle: string | null;
  outstand_social_account_id: string;
}

interface SocialPostEditorProps {
  connectedAccounts: ConnectedAccount[];
  caption: string;
  onCaptionChange: (caption: string) => void;
  hashtags: string[];
  onHashtagsChange: (hashtags: string[]) => void;
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  scheduleForLater: boolean;
  onScheduleToggle: (schedule: boolean) => void;
  suggestedTime: string | null;
  scheduledAt: string | null;
  onScheduledAtChange: (time: string) => void;
  videoUrl: string | null;
  isLoading: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  twitter: 'X',
  youtube: 'YouTube',
  x: 'X',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-black text-white',
  x: 'bg-black text-white',
  youtube: 'bg-red-600 text-white',
};

export function SocialPostEditor({
  connectedAccounts,
  caption,
  onCaptionChange,
  hashtags,
  onHashtagsChange,
  selectedPlatforms,
  onPlatformsChange,
  scheduleForLater,
  onScheduleToggle,
  suggestedTime,
  scheduledAt,
  onScheduledAtChange,
  videoUrl,
  isLoading,
}: SocialPostEditorProps) {
  const hasAccounts = connectedAccounts.length > 0;

  if (!hasAccounts) {
    return (
      <div className="space-y-3 p-4 bg-dc-teal/5 rounded-2xl border border-dc-teal/20">
        <p className="text-sm text-dc-text-muted">
          Connect social accounts to auto-post approved content.
        </p>
        <div className="flex gap-2">
          {videoUrl && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                const a = document.createElement('a');
                a.href = videoUrl;
                a.download = 'approved-content';
                a.click();
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => navigator.clipboard.writeText(caption || '')}
          >
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Caption
          </Button>
        </div>
        <a
          href="/dashboard/business/settings"
          className="inline-flex items-center gap-1 text-xs text-dc-teal hover:underline"
        >
          Connect social accounts to auto-post
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  const togglePlatform = (platform: string) => {
    if (selectedPlatforms.includes(platform)) {
      onPlatformsChange(selectedPlatforms.filter(p => p !== platform));
    } else {
      onPlatformsChange([...selectedPlatforms, platform]);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-dc-teal/5 rounded-2xl border border-dc-teal/20">
      {/* Platform chips */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Post to
        </Label>
        <div className="flex flex-wrap gap-2">
          {connectedAccounts.map(account => {
            const isSelected = selectedPlatforms.includes(account.platform);
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => togglePlatform(account.platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isSelected
                    ? PLATFORM_COLORS[account.platform] || 'bg-dc-teal text-white'
                    : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
                }`}
              >
                {PLATFORM_LABELS[account.platform] || account.platform}
                {account.platform_handle && (
                  <span className="ml-1 opacity-75">@{account.platform_handle}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Caption editor */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Caption
        </Label>
        <Textarea
          value={caption}
          onChange={e => onCaptionChange(e.target.value)}
          placeholder={isLoading ? 'Generating caption...' : 'Write a caption or tap Generate to try again'}
          className="min-h-[80px] rounded-xl text-sm resize-none"
          disabled={isLoading}
        />
        {hashtags.length > 0 && (
          <p className="text-xs text-dc-text-muted mt-1">
            {hashtags.join(' ')}
          </p>
        )}
      </div>

      {/* Schedule toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-dc-text-muted">
          Schedule for best time
        </Label>
        <Switch
          checked={scheduleForLater}
          onCheckedChange={onScheduleToggle}
        />
      </div>

      {scheduleForLater && suggestedTime && (
        <div>
          <Label className="text-xs font-medium text-dc-text-muted mb-1 block">
            Scheduled for
          </Label>
          <input
            type="datetime-local"
            value={(scheduledAt || suggestedTime).slice(0, 16)}
            onChange={e => onScheduledAtChange(new Date(e.target.value).toISOString())}
            className="w-full rounded-xl border border-dc-teal/20 px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/promotions/SocialPostEditor.tsx
git commit -m "feat: add SocialPostEditor component for CGC approve-and-post flow"
```

---

### Task 8: Create CGCReviewSheet Component

**Files:**
- Create: `src/components/promotions/CGCReviewSheet.tsx`

**Dependencies:** Uses `SocialPostEditor`, `useCGCReviewSheet`, `useCrossPost`, `usePromotions.reviewSubmission`.

- [ ] **Step 1: Create the component**

This is the largest new component. It renders:
- Zone 1: Content preview (video/photo + customer info)
- Zone 2: `SocialPostEditor` (conditional on connected accounts)
- Zone 3: Action buttons (Approve & Post / Approve Only / Reject)
- Batch navigation (prev/next counter)

```typescript
import { useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SocialPostEditor } from './SocialPostEditor';
import { useCGCReviewSheet } from '@/hooks/useCGCReviewSheet';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import { usePromotions, type PromotionSubmission } from '@/hooks/usePromotions';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface CGCReviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissions: PromotionSubmission[];
  initialIndex: number;
  promotionTitle: string;
}

export function CGCReviewSheet({
  open,
  onOpenChange,
  submissions,
  initialIndex,
  promotionTitle,
}: CGCReviewSheetProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [scheduleForLater, setScheduleForLater] = useState(false);
  const [editedCaption, setEditedCaption] = useState('');
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [platformsInitialized, setPlatformsInitialized] = useState(false);

  const isMobile = useIsMobile();
  const submission = submissions[currentIndex];
  const { reviewSubmission } = usePromotions();
  const crossPost = useCrossPost();

  const {
    caption,
    hashtags,
    suggestedTime,
    defaultPlatforms,
    connectedAccounts,
    preferences,
    isLoading: socialLoading,
  } = useCGCReviewSheet(
    submission?.id ?? null,
    promotionTitle,
    submission?.video_url ?? null,
  );

  // Initialize platforms from defaults when data loads
  if (!platformsInitialized && defaultPlatforms.length > 0) {
    setSelectedPlatforms(defaultPlatforms);
    setEditedCaption(caption);
    setPlatformsInitialized(true);
  }

  // Sync caption when it loads from AI
  if (caption && !editedCaption) {
    setEditedCaption(caption);
  }

  const handleApprove = useCallback(async (withSocialPost: boolean) => {
    if (!submission) return;

    let socialAction: 'post_now' | 'schedule' | 'skip' = 'skip';
    if (withSocialPost && connectedAccounts.length > 0) {
      socialAction = scheduleForLater ? 'schedule' : 'post_now';
    }

    try {
      reviewSubmission.mutate({
        submissionId: submission.id,
        status: 'approved',
        socialAction,
        platforms: selectedPlatforms,
        caption: editedCaption,
        hashtags,
        scheduledAt: scheduleForLater ? (scheduledAt || suggestedTime || undefined) : undefined,
      });

      // If posting now via Outstand
      if (socialAction === 'post_now' && selectedPlatforms.length > 0) {
        const accountIds = connectedAccounts
          .filter(a => selectedPlatforms.includes(a.platform))
          .map(a => a.outstand_social_account_id);

        if (accountIds.length > 0) {
          try {
            await crossPost.mutateAsync({
              caption: `${editedCaption}\n\n${hashtags.join(' ')}`,
              mediaUrls: submission.video_url ? [submission.video_url] : [],
              accountIds,
            });
          } catch {
            toast.warning('Approved! Social posting failed — try again from Content Library.');
          }
        }
      }

      // Move to next or close
      if (currentIndex < submissions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setRejecting(false);
        setRejectionReason('');
        setPlatformsInitialized(false);
        setEditedCaption('');
      } else {
        onOpenChange(false);
      }
    } catch {
      toast.error('Failed to approve submission');
    }
  }, [submission, connectedAccounts, selectedPlatforms, editedCaption, hashtags, scheduleForLater, scheduledAt, suggestedTime, currentIndex, submissions.length]);

  const handleReject = useCallback(() => {
    if (!submission || !rejectionReason.trim()) return;
    reviewSubmission.mutate({
      submissionId: submission.id,
      status: 'rejected',
      rejectionReason: rejectionReason.trim(),
    });
    if (currentIndex < submissions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setRejecting(false);
      setRejectionReason('');
    } else {
      onOpenChange(false);
    }
  }, [submission, rejectionReason, currentIndex, submissions.length]);

  if (!submission) return null;

  const isPhoto = submission.video_url?.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i);
  const hasAccounts = connectedAccounts.length > 0;
  const isAutoPostEnabled = preferences?.auto_post_enabled ?? true;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[90vh] rounded-t-3xl' : 'w-[480px]'}
      >
        <SheetHeader className="pb-2">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-sm font-bold">Review Submission</SheetTitle>
            {submissions.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-dc-text-muted">
                <button
                  onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="p-1 rounded-full hover:bg-dc-teal/10 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>{currentIndex + 1} of {submissions.length}</span>
                <button
                  onClick={() => setCurrentIndex(prev => Math.min(submissions.length - 1, prev + 1))}
                  disabled={currentIndex === submissions.length - 1}
                  className="p-1 rounded-full hover:bg-dc-teal/10 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pb-24">
          {/* Zone 1: Content Preview */}
          <div className="rounded-2xl overflow-hidden bg-black aspect-video">
            {isPhoto ? (
              <img src={submission.video_url!} alt="Submission" className="w-full h-full object-contain" />
            ) : (
              <video src={submission.video_url!} controls className="w-full h-full" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-dc-text-muted px-1">
            <span>{submission.customer_name || submission.customer_email}</span>
            <span>{new Date(submission.created_at).toLocaleDateString()}</span>
          </div>

          {/* Zone 2: Social Post Editor */}
          {!rejecting && (
            <SocialPostEditor
              connectedAccounts={connectedAccounts}
              caption={editedCaption}
              onCaptionChange={setEditedCaption}
              hashtags={hashtags}
              onHashtagsChange={() => {}}
              selectedPlatforms={selectedPlatforms}
              onPlatformsChange={setSelectedPlatforms}
              scheduleForLater={scheduleForLater}
              onScheduleToggle={setScheduleForLater}
              suggestedTime={suggestedTime}
              scheduledAt={scheduledAt}
              onScheduledAtChange={setScheduledAt}
              videoUrl={submission.video_url}
              isLoading={socialLoading}
            />
          )}

          {/* Rejection reason input */}
          {rejecting && (
            <div className="space-y-2">
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection (required)"
                className="min-h-[80px] rounded-xl text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  onClick={handleReject}
                  disabled={!rejectionReason.trim()}
                >
                  Confirm Reject
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setRejecting(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3: Sticky Actions */}
        {!rejecting && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-dc-teal/10 space-y-2">
            {hasAccounts ? (
              <>
                <Button
                  className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
                  onClick={() => handleApprove(true)}
                  disabled={reviewSubmission.isPending || crossPost.isPending}
                >
                  {(reviewSubmission.isPending || crossPost.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Check className="h-4 w-4 mr-2" />
                  Approve & Post
                </Button>
                <Button
                  variant="outline"
                  className="w-full rounded-full"
                  onClick={() => handleApprove(false)}
                  disabled={reviewSubmission.isPending}
                >
                  Approve Only
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
                  onClick={() => handleApprove(false)}
                  disabled={reviewSubmission.isPending}
                >
                  {reviewSubmission.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Check className="h-4 w-4 mr-2" />
                  Approve{submission.video_url ? ' & Download' : ''}
                </Button>
              </>
            )}
            <button
              className="w-full text-center text-xs text-dc-text-muted hover:text-red-500 py-1"
              onClick={() => setRejecting(true)}
            >
              Reject
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors if Task 11 (extend usePromotions) was completed first per the execution order. If Task 11 is not yet done, `reviewSubmission.mutate` will have type errors on the social params.

- [ ] **Step 3: Commit**

```bash
git add src/components/promotions/CGCReviewSheet.tsx
git commit -m "feat: add CGCReviewSheet component for unified approve-and-post flow"
```

---

### Task 9: Create CGCContentLibrary Component

**Files:**
- Create: `src/components/promotions/CGCContentLibrary.tsx`

**Dependencies:** Uses `usePromotions` for submissions data, opens `CGCReviewSheet` for pending items.

- [ ] **Step 1: Create the component**

```typescript
import { useState, useMemo } from 'react';
import { usePromotions } from '@/hooks/usePromotions';
import { CGCReviewSheet } from './CGCReviewSheet';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Image } from 'lucide-react';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'published';

interface CGCContentLibraryProps {
  promotionTitle?: string;
}

export function CGCContentLibrary({ promotionTitle = '' }: CGCContentLibraryProps) {
  const {
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    discountCodes,
    reviewSubmission,
    redeemCode,
    socialPostStats,
  } = usePromotions();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [codeSearch, setCodeSearch] = useState('');
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  // Cross-reference approved submissions with published social posts
  // to derive the "published" status. socialPostStats contains submission IDs
  // that have been posted to social media.
  const publishedSubmissionIds = useMemo(() => {
    if (!socialPostStats?.publishedSubmissionIds) return new Set<string>();
    return new Set(socialPostStats.publishedSubmissionIds);
  }, [socialPostStats]);

  const allSubmissions = useMemo(() => {
    const pending = (pendingSubmissions || []).map(s => ({ ...s, _status: 'pending' as const }));
    const approved = (approvedSubmissions || []).map(s => ({
      ...s,
      _status: (publishedSubmissionIds.has(s.id) ? 'published' : 'approved') as 'published' | 'approved',
    }));
    const rejected = (rejectedSubmissions || []).map(s => ({ ...s, _status: 'rejected' as const }));
    return [...pending, ...approved, ...rejected].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [pendingSubmissions, approvedSubmissions, rejectedSubmissions, publishedSubmissionIds]);

  const filtered = useMemo(() => {
    if (filter === 'all') return allSubmissions;
    return allSubmissions.filter(s => s._status === filter);
  }, [allSubmissions, filter]);

  const handleCodeVerify = () => {
    if (!codeSearch.trim()) return;
    const code = discountCodes?.find(
      c => c.code.toLowerCase() === codeSearch.trim().toLowerCase()
    );
    if (!code) {
      return;
    }
    if (code.is_redeemed) {
      return;
    }
    redeemCode.mutate(codeSearch.trim());
    setCodeSearch('');
  };

  const pendingOnly = allSubmissions.filter(s => s._status === 'pending');

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-dc-yellow/20 text-yellow-800' },
    approved: { label: 'Approved', className: 'bg-dc-teal/10 text-teal-800' },
    published: { label: 'Published', className: 'bg-dc-teal/20 text-teal-900 font-semibold' },
    rejected: { label: 'Rejected', className: 'bg-dc-pink/20 text-red-800' },
  };

  const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: `Pending${pendingOnly.length ? ` (${pendingOnly.length})` : ''}` },
    { value: 'approved', label: 'Approved' },
    { value: 'published', label: 'Published' },
    { value: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="space-y-4">
      {/* Code verification bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dc-text-muted" />
          <Input
            value={codeSearch}
            onChange={e => setCodeSearch(e.target.value)}
            placeholder="Enter code to verify"
            className="pl-9 rounded-full text-sm"
            onKeyDown={e => e.key === 'Enter' && handleCodeVerify()}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === opt.value
                ? 'bg-dc-teal text-white'
                : 'bg-dc-teal/5 text-dc-text-muted hover:bg-dc-teal/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-dc-text-muted text-sm">
          No submissions {filter !== 'all' ? `with status "${filter}"` : 'yet'}.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {filtered.map((sub, idx) => {
            const isPhoto = sub.video_url?.match(/\.(jpg|jpeg|png|gif|webp|heic|heif)$/i);
            const badge = STATUS_BADGE[sub._status];
            const code = discountCodes?.find(c => c.submission_id === sub.id);

            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => {
                  if (sub._status === 'pending') {
                    const pendingIdx = pendingOnly.findIndex(p => p.id === sub.id);
                    setReviewIndex(pendingIdx >= 0 ? pendingIdx : 0);
                    setReviewSheetOpen(true);
                  }
                }}
                className="text-left bg-white rounded-2xl border border-dc-teal/10 overflow-hidden hover:border-dc-teal/40 transition-colors"
              >
                <div className="aspect-square bg-dc-teal/5 relative">
                  {sub.video_url && (
                    isPhoto ? (
                      <img src={sub.video_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <video src={sub.video_url} className="w-full h-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Play className="h-8 w-8 text-white drop-shadow-lg" />
                        </div>
                      </>
                    )
                  )}
                  <Badge className={`absolute top-2 right-2 text-[10px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-dc-text truncate">
                    {sub.customer_name || sub.customer_email}
                  </p>
                  {code && (
                    <p className="text-[10px] text-dc-text-muted mt-0.5 font-mono">
                      {code.code}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Review sheet for pending submissions */}
      <CGCReviewSheet
        open={reviewSheetOpen}
        onOpenChange={setReviewSheetOpen}
        submissions={pendingOnly}
        initialIndex={reviewIndex}
        promotionTitle={promotionTitle}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/promotions/CGCContentLibrary.tsx
git commit -m "feat: add CGCContentLibrary component merging Pending/Videos/Codes tabs"
```

---

### Task 10: Create CGCPostingPreferences Component

**Files:**
- Create: `src/components/promotions/CGCPostingPreferences.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';

interface CGCPrefs {
  auto_post_enabled: boolean;
  default_platforms: string[];
  default_timing: 'immediate' | 'optimal';
  caption_style: 'ai' | 'template';
  custom_caption_template: string | null;
}

const DEFAULT_PREFS: CGCPrefs = {
  auto_post_enabled: true,
  default_platforms: [],
  default_timing: 'immediate',
  caption_style: 'ai',
  custom_caption_template: null,
};

export function CGCPostingPreferences() {
  const [prefs, setPrefs] = useState<CGCPrefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  const { data: accounts = [] } = useLocationSocialAccounts(user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('business_profiles')
        .select('cgc_posting_preferences')
        .eq('user_id', user.id)
        .single();
      if (data?.cgc_posting_preferences) {
        setPrefs(data.cgc_posting_preferences as CGCPrefs);
      } else {
        setPrefs({ ...DEFAULT_PREFS, default_platforms: accounts.map(a => a.platform) });
      }
      setLoaded(true);
    };
    load();
  }, [accounts]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('business_profiles')
        .update({ cgc_posting_preferences: prefs as unknown as Record<string, unknown> })
        .eq('user_id', user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['cgc-posting-preferences'] });
      toast.success('CGC posting preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const togglePlatform = (platform: string) => {
    setPrefs(prev => ({
      ...prev,
      default_platforms: prev.default_platforms.includes(platform)
        ? prev.default_platforms.filter(p => p !== platform)
        : [...prev.default_platforms, platform],
    }));
  };

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-2xl border border-dc-teal/10 p-6 space-y-5">
      <h3 className="font-bold text-sm text-dc-text">CGC Auto-Post Preferences</h3>

      {/* Master toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm text-dc-text">Auto-post on approval</Label>
        <Switch
          checked={prefs.auto_post_enabled}
          onCheckedChange={v => setPrefs(p => ({ ...p, auto_post_enabled: v }))}
        />
      </div>

      {/* Default platforms */}
      {accounts.length > 0 && (
        <div>
          <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
            Default platforms
          </Label>
          <div className="flex flex-wrap gap-2">
            {accounts.map(account => (
              <button
                key={account.id}
                type="button"
                onClick={() => togglePlatform(account.platform)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  prefs.default_platforms.includes(account.platform)
                    ? 'bg-dc-teal text-white'
                    : 'bg-dc-teal/5 text-dc-text-muted'
                }`}
              >
                {account.platform} — @{account.platform_handle}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Default timing */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Default timing
        </Label>
        <div className="flex gap-2">
          {(['immediate', 'optimal'] as const).map(timing => (
            <button
              key={timing}
              type="button"
              onClick={() => setPrefs(p => ({ ...p, default_timing: timing }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                prefs.default_timing === timing
                  ? 'bg-dc-teal text-white'
                  : 'bg-dc-teal/5 text-dc-text-muted'
              }`}
            >
              {timing === 'immediate' ? 'Post immediately' : 'Schedule for optimal time'}
            </button>
          ))}
        </div>
      </div>

      {/* Caption style */}
      <div>
        <Label className="text-xs font-medium text-dc-text-muted mb-2 block">
          Caption style
        </Label>
        <div className="flex gap-2">
          {(['ai', 'template'] as const).map(style => (
            <button
              key={style}
              type="button"
              onClick={() => setPrefs(p => ({ ...p, caption_style: style }))}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                prefs.caption_style === style
                  ? 'bg-dc-teal text-white'
                  : 'bg-dc-teal/5 text-dc-text-muted'
              }`}
            >
              {style === 'ai' ? 'AI-generated' : 'Custom template'}
            </button>
          ))}
        </div>
        {prefs.caption_style === 'template' && (
          <Textarea
            value={prefs.custom_caption_template || ''}
            onChange={e => setPrefs(p => ({ ...p, custom_caption_template: e.target.value }))}
            placeholder="Use {{customer_name}}, {{restaurant_name}}, {{discount}} as merge tags"
            className="mt-2 rounded-xl text-sm min-h-[60px]"
          />
        )}
      </div>

      <Button
        onClick={save}
        disabled={saving}
        className="rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white"
      >
        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Preferences
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/components/promotions/CGCPostingPreferences.tsx
git commit -m "feat: add CGCPostingPreferences settings component"
```

---

### Task 11: Extend usePromotions Hook with Social Params

**Files:**
- Modify: `src/hooks/usePromotions.ts:326-447` (reviewSubmission mutation)

- [ ] **Step 1a: Update PromotionSubmission type for nullable customer fields**

In `src/hooks/usePromotions.ts`, find the exported `PromotionSubmission` interface/type. Update `customer_name` and `customer_phone` to be nullable to match the Migration 1 schema change:

```typescript
customer_name: string | null;
customer_phone: string | null;
```

Also update the `DiscountCode` interface/type in the same file (around line 52). Change `customer_phone` to nullable:

```typescript
customer_phone: string | null;
```

Both types must match the post-migration column nullability. The code in consuming components already uses `submission.customer_name || submission.customer_email` as a fallback, so no further changes are needed downstream.

- [ ] **Step 1b: Add social params to the reviewSubmission mutation interface**

In `src/hooks/usePromotions.ts`, find the `reviewSubmission` mutation (around line 326). Update the mutation parameter type to accept optional social posting fields. The current params are `{ submissionId, status, rejectionReason }`. Add:

```typescript
socialAction?: 'post_now' | 'schedule' | 'skip';
platforms?: string[];
caption?: string;
hashtags?: string[];
scheduledAt?: string;
```

These are all optional — existing callers without social params continue working unchanged.

- [ ] **Step 2: After existing approval logic, add social posting branch**

After the discount code generation and notification call (around line 425), add a block that checks for `socialAction` and records the social post in `donny_scheduled_posts`:

```typescript
// Record social posting outcome
// NOTE: Outstand uses 'x' but donny_scheduled_posts CHECK constraint uses 'twitter'.
// Normalize platform names before inserting.
const normalizePlatform = (p: string) => p === 'x' ? 'twitter' : p;

if (socialAction && socialAction !== 'skip' && platforms && platforms.length > 0) {
  const postStatus = socialAction === 'post_now' ? 'published' : 'scheduled';
  await supabase.from('donny_scheduled_posts').insert({
    user_id: (await supabase.auth.getUser()).data.user?.id,
    status: postStatus,
    caption: caption || '',
    hashtags: hashtags || [],
    media_urls: submission.video_url ? [submission.video_url] : [],
    platform: normalizePlatform(platforms[0]),
    content_type: 'video',
    scheduled_at: scheduledAt || new Date().toISOString(),
    metadata: {
      source: 'promotion',
      promotion_id: submission.promotion_id,
      submission_id: submissionId,
      platforms: platforms.map(normalizePlatform),
    },
  });
}
```

- [ ] **Step 3: Add social stats query**

Add a new query for the "Posted to Social" stat card:

```typescript
const { data: socialPostStats } = useQuery({
  queryKey: ['cgc-social-stats'],
  queryFn: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { total: 0, byPlatform: {}, publishedSubmissionIds: [] as string[] };
    const { data } = await supabase
      .from('donny_scheduled_posts')
      .select('id, platform, metadata')
      .eq('user_id', user.id)
      .eq('status', 'published')
      .filter('metadata->>source', 'eq', 'promotion');
    const byPlatform: Record<string, number> = {};
    const publishedSubmissionIds: string[] = [];
    (data || []).forEach(post => {
      const p = post.platform || 'unknown';
      byPlatform[p] = (byPlatform[p] || 0) + 1;
      const subId = (post.metadata as Record<string, unknown>)?.submission_id;
      if (typeof subId === 'string') publishedSubmissionIds.push(subId);
    });
    return { total: data?.length || 0, byPlatform, publishedSubmissionIds };
  },
});
```

Add `socialPostStats` to the hook's return object.

- [ ] **Step 4: Add cache invalidation for social stats**

In the `onSuccess` of `reviewSubmission`, add: `queryClient.invalidateQueries({ queryKey: ['cgc-social-stats'] });`

- [ ] **Step 5: Verify it compiles**

Run: `npm run typecheck`

Expected: Clean. All existing callers pass the old 3-param shape; new callers can pass social params.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePromotions.ts
git commit -m "feat: extend reviewSubmission mutation with social posting params and stats query"
```

---

### Task 12: Update usePromotionSubmission for Optional Fields

**Files:**
- Modify: `src/hooks/usePromotionSubmission.ts:18-25` (validation schema), `:21-40` (checkExistingSubmission)
- Modify: `src/components/promotions/CustomerInfoForm.tsx:18-25` (validation schema)

- [ ] **Step 1: Update the SubmissionData interface in usePromotionSubmission**

In `src/hooks/usePromotionSubmission.ts`, find the `SubmissionData` interface (lines 5-13). Make `customerName` and `customerPhone` optional:

```typescript
interface SubmissionData {
  promotionId: string;
  customerName?: string;    // Was required, now optional
  customerEmail: string;
  customerPhone?: string;   // Was required, now optional
  videoFile: File;
  marketingRightsAccepted: boolean;
  socialHandles?: Record<string, string>;
}
```

Note: This file uses a plain TypeScript interface, NOT a Zod schema. The Zod schema lives in `CustomerInfoForm.tsx` and is updated in Step 3.

- [ ] **Step 2: Update checkExistingSubmission to deduplicate by email only**

In `checkExistingSubmission` (around line 21), change the query filter from `email + phone` to `email + promotion_id` only:

```typescript
const { data } = await supabase
  .from('promotion_submissions')
  .select('id, status')
  .eq('promotion_id', promotionId)
  .eq('customer_email', email)
  .in('status', ['pending', 'approved']);
```

Remove the `.eq('customer_phone', ...)` filter.

- [ ] **Step 3: Update CustomerInfoForm schema to match**

In `src/components/promotions/CustomerInfoForm.tsx`, update the Zod schema at lines 18-25 to make name and phone optional. Update the form UI to show name and phone as optional fields (remove the red required asterisks, add placeholder text like "Name (optional)").

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePromotionSubmission.ts src/components/promotions/CustomerInfoForm.tsx
git commit -m "feat: make customer name and phone optional in submission flow"
```

---

### Task 13: Build and verify Phase 2

- [ ] **Step 1: Full build check**

Run: `npm run build`

Expected: Clean build, no errors.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: No errors. All new components and hooks compile.

- [ ] **Step 3: Run existing tests**

Run: `npm run test`

Expected: Existing tests still pass. New components don't have tests yet (they're UI components — tested via browser verification in Phase 3).

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve Phase 2 build issues"
```

---

## Phase 3: UI Swap (Visible Change)

### Task 14: Simplify CreatePromotionModal

**Files:**
- Modify: `src/components/promotions/CreatePromotionModal.tsx:36-54` (schema), `:67-81` (defaults), `:101-296` (form fields)

- [ ] **Step 1: Restructure the form to 3 primary fields + advanced expandable**

Replace the current 10-field form with:

**Primary section (always visible):**
1. Discount value — number input + toggle (% / $)
2. Title — text input, pre-populated with "Get {X}% Off Your Next Visit" (auto-updates when discount changes)
3. Duration — chip selector: 1 week / 2 weeks / 1 month / Custom

**Advanced section (collapsed `Collapsible` from shadcn/ui):**
All other fields with current defaults: content type = 'both', max video duration = 60, max redemptions = null (unlimited), terms = standard template, start date = today, end date = derived from duration, description = null.

Import `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `@/components/ui/collapsible`.

- [ ] **Step 2: Update form defaults**

```typescript
const form = useForm({
  defaultValues: {
    title: '',
    discount_type: 'percentage',
    discount_value: 15,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    accepted_content: 'both',
    max_redemptions: null,
    video_max_duration: 60,
    terms_conditions: 'By submitting content, you grant us permission to use it on our social media channels.',
    description: '',
    currency: 'USD',
  },
});
```

- [ ] **Step 3: Add duration chip selector**

Add a state variable for duration and chips that update `end_date` reactively:

```typescript
const [duration, setDuration] = useState<'1w' | '2w' | '1m' | 'custom'>('2w');

const handleDurationChange = (d: typeof duration) => {
  setDuration(d);
  const start = new Date(form.getValues('start_date'));
  const msMap = { '1w': 7, '2w': 14, '1m': 30, 'custom': 0 };
  if (d !== 'custom') {
    const end = new Date(start.getTime() + msMap[d] * 86400000);
    form.setValue('end_date', end.toISOString().split('T')[0]);
  }
};
```

- [ ] **Step 4: Add auto-suggest title from discount value**

```typescript
const discountValue = form.watch('discount_value');
const discountType = form.watch('discount_type');
useEffect(() => {
  if (!form.getFieldState('title').isDirty) {
    const label = discountType === 'percentage' ? `${discountValue}% Off` : `$${discountValue} Off`;
    form.setValue('title', `Get ${label} Your Next Visit`);
  }
}, [discountValue, discountType]);
```

- [ ] **Step 5: Verify it compiles and renders**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add src/components/promotions/CreatePromotionModal.tsx
git commit -m "feat: simplify CreatePromotionModal to 3 fields with advanced expandable"
```

---

### Task 15: Redesign BusinessPromotionalTools Dashboard

**Files:**
- Modify: `src/pages/BusinessPromotionalTools.tsx` (full rewrite of the component body)

- [ ] **Step 1: Replace the page content with new layout**

Replace the current 4-tab structure with:

1. **Priority banner** — conditional on `pendingCount > 0`
2. **3 stat cards** — Pending (with review link), Approved, Posted to Social
3. **2 tabs** — Promotions + Content Library

Import `CGCContentLibrary` from `@/components/promotions/CGCContentLibrary`. Import `socialPostStats` from the extended `usePromotions` hook. Keep `DashboardLayout`, `PrerequisiteGate`, and existing `ActivePromotionsTab`.

The priority banner:
```tsx
{pendingCount > 0 && (
  <div className="bg-dc-teal/10 border border-dc-teal/30 rounded-2xl p-4 flex items-center justify-between">
    <p className="text-sm font-medium text-dc-text">
      You have {pendingCount} video{pendingCount !== 1 ? 's' : ''} to review
    </p>
    <Button
      size="sm"
      className="rounded-full bg-dc-teal text-white"
      onClick={() => {/* open review sheet or switch to content library pending filter */}}
    >
      Review Now
    </Button>
  </div>
)}
```

Tabs reduced from 4 to 2:
```tsx
<Tabs defaultValue="promotions">
  <TabsList className="grid w-full grid-cols-2">
    <TabsTrigger value="promotions">Promotions</TabsTrigger>
    <TabsTrigger value="library">
      Content Library
      {pendingCount > 0 && (
        <span className="ml-1 bg-dc-teal text-white text-xs px-1.5 py-0.5 rounded-full">
          {pendingCount}
        </span>
      )}
    </TabsTrigger>
  </TabsList>
  <TabsContent value="promotions">
    <ActivePromotionsTab />
  </TabsContent>
  <TabsContent value="library">
    <CGCContentLibrary />
  </TabsContent>
</Tabs>
```

- [ ] **Step 2: Update empty state copy**

Replace the existing empty state text with:
"Turn your customers into content creators. They record, you approve, it posts to your social media automatically."

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessPromotionalTools.tsx
git commit -m "feat: redesign BusinessPromotionalTools with 2 tabs, priority banner, and 3 stat cards"
```

---

### Task 16: Camera-First Customer Submission Page

**Files:**
- Modify: `src/pages/PromotionSubmissionPage.tsx` (restructure step flow)

- [ ] **Step 1: Simplify the step machine**

Change the step type from `'welcome' | 'video' | 'info' | 'success' | 'error'` to `'welcome' | 'capture' | 'email' | 'success' | 'error'`.

- [ ] **Step 2: Redesign the welcome step**

Replace the current verbose welcome with a minimal splash:
- Restaurant logo (if available, via `resolvedLogoUrl`)
- "Record your experience → Get {X}% OFF" heading
- Big teal "Record" button (pill shape, `rounded-full`, full width)
- Smaller "Upload a photo/video instead" text link below
- "Details" link (small, opens promotion terms in a collapsible or modal)

- [ ] **Step 3: Simplify the capture step**

Keep the existing `VideoUploader` component. After capture, show preview with "Use this" / "Retake" buttons. No changes to the recorder itself.

- [ ] **Step 4: Simplify the email step**

Replace `CustomerInfoForm` integration with a minimal form:
- **Email** (required) — single input, prominent
- **Name** and **Phone** (optional) — below email, collapsed behind "Add more details" link
- **Marketing consent** — checkbox, **must default to unchecked** (legal compliance — pre-checked consent may violate CAN-SPAM/GDPR). Copy: "I agree to let {businessName} use my content on social media"
- Big teal "Submit & Get Your Discount" button

- [ ] **Step 5: Add post-submission social handle collection**

On the success step, after the "check your email" message, add:

```tsx
<div className="mt-6 p-4 bg-dc-teal/5 rounded-2xl">
  <p className="text-sm font-medium text-dc-text mb-2">
    Want to be featured on {businessName}'s social media?
  </p>
  <SocialHandleFields handles={handles} setHandles={setHandles} />
  <Button
    size="sm"
    className="mt-2 rounded-full"
    onClick={async () => {
      const sanitized = getSanitized();
      if (Object.values(sanitized).some(v => v)) {
        await supabase.from('promotion_submissions')
          .update({ social_handles: sanitized })
          .eq('id', submissionId);
        toast.success('Social handles saved!');
      }
    }}
  >
    Save
  </Button>
</div>
```

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/pages/PromotionSubmissionPage.tsx
git commit -m "feat: redesign customer submission as camera-first flow with email-only required"
```

---

### Task 17: Wire CGCPostingPreferences into Settings

**Files:**
- Modify: The business settings page (find the existing settings route component)

- [ ] **Step 1: Open the settings page**

The business settings page is at `src/pages/BusinessSettings.tsx`.

- [ ] **Step 2: Import and add CGCPostingPreferences**

Add the `CGCPostingPreferences` component as a new section/card in the settings page, below the existing social media account settings:

```tsx
import { CGCPostingPreferences } from '@/components/promotions/CGCPostingPreferences';

// In the settings page JSX, add:
<CGCPostingPreferences />
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/pages/BusinessSettings.tsx  # or actual path
git commit -m "feat: add CGCPostingPreferences to business settings page"
```

---

### Task 18: Full build + browser verification

- [ ] **Step 1: Full build**

Run: `npm run build`

Expected: Clean build, no errors.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`

- [ ] **Step 3: Test restaurant flow (desktop)**

Log in as restaurant account (`dwilliams@harbormill.net` / `Pdi@mondz1`).
Navigate to `/dashboard/business/promotions`.

Verify:
- Priority banner appears if pending submissions exist
- 3 stat cards show correct counts
- 2 tabs (Promotions, Content Library) — not 4
- "Create Promotion" modal has 3 primary fields + advanced expandable
- Content Library shows filterable submissions
- Tapping a pending submission opens the review sheet side panel

- [ ] **Step 4: Test restaurant flow (mobile viewport)**

Resize browser to 375px width. Verify:
- Review sheet opens as bottom sheet, not side panel
- Navigation between submissions uses prev/next buttons, not swipe
- All buttons are full-width pill shapes
- No horizontal overflow

- [ ] **Step 5: Test customer submission flow**

Open `/promo/{promotionId}` (use an existing promotion ID).

Verify:
- Welcome splash is minimal (logo + one line + Record button)
- Camera opens on tap
- Email step shows only email as required, name/phone collapsed
- Success screen shows social handle collection
- Under 45 seconds from landing to submit (if content is ready)

- [ ] **Step 6: Check Chrome DevTools for console errors**

Open DevTools → Console. Navigate through all CGC screens. Verify no new errors or warnings.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve browser verification issues in CGC optimization"
```

---

## Phase 4: Cleanup

### Task 19: Deprecate fire-promotion-social-hook Call

**Files:**
- Modify: `src/hooks/usePromotions.ts` (remove the `fire-promotion-social-hook` invoke)

- [ ] **Step 1: Find and remove the fire-and-forget social hook call**

In `usePromotions.ts`, find the line inside `reviewSubmission` that calls `supabase.functions.invoke('fire-promotion-social-hook')` (around line 412-420). Remove the entire try/catch block that invokes it.

The social posting is now handled inline by the `socialAction` branch added in Task 11. The old fire-and-forget path is no longer needed.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePromotions.ts
git commit -m "chore: remove deprecated fire-promotion-social-hook call from reviewSubmission"
```

---

### Task 20: Add First-Time Inline Callout

**Files:**
- Modify: `src/pages/BusinessPromotionalTools.tsx`

- [ ] **Step 1: Add a dismissible first-time callout above the Content Library tab**

When no promotions exist yet, show a callout in the Promotions tab:

```tsx
{promotions.length === 0 && (
  <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-2xl p-4 text-center space-y-2">
    <p className="text-sm font-medium text-dc-text">
      Turn your customers into content creators
    </p>
    <p className="text-xs text-dc-text-muted">
      Create a promotion → Customers scan your QR code → Record content → Get a discount. Their content posts to your social media automatically.
    </p>
  </div>
)}
```

This replaces a formal onboarding step — the value proposition is shown inline where the user can act on it immediately.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/pages/BusinessPromotionalTools.tsx
git commit -m "feat: add first-time inline callout on CGC promotions tab"
```

---

### Task 21: Update Help Article

**Files:**
- Modify: Help article content for CGC Campaigns (if help articles are managed in `help_articles` table via Supabase)

- [ ] **Step 1: Check for existing CGC/promotions help article**

Query `help_articles` for any article with title containing "promotion" or "CGC":

```sql
SELECT id, title, slug FROM help_articles WHERE title ILIKE '%promotion%' OR title ILIKE '%CGC%' OR slug ILIKE '%promotion%';
```

- [ ] **Step 2: Update or create the help article**

If an article exists, update its content to reflect the simplified flow (3-field creation, camera-first submission, approve-and-post). If none exists, insert a new one with:
- Title: "Customer Content Promotions (CGC)"
- Content: Step-by-step for creating a promotion, what customers see, how to approve and post to social media
- Category: Business Tools

- [ ] **Step 3: Commit if code changes were needed**

```bash
git commit -m "docs: update help article for CGC campaigns optimization"
```

---

### Task 22: Clean Up Orphaned Scheduled Posts

**Files:**
- One-time database operation (no code changes)

- [ ] **Step 1: Identify orphaned posts**

Check for `donny_scheduled_posts` records with `metadata->>'source' = 'promotion'` and `status = 'draft'` from the old `fire-promotion-social-hook` flow that were never published:

```sql
SELECT id, created_at, status, metadata
FROM donny_scheduled_posts
WHERE metadata->>'source' = 'promotion'
  AND status = 'draft'
ORDER BY created_at DESC
LIMIT 20;
```

- [ ] **Step 2: Cancel orphaned drafts**

If any exist, update their status to `'cancelled'` so they don't clutter the scheduled posts table:

```sql
UPDATE donny_scheduled_posts
SET status = 'cancelled', updated_at = now()
WHERE metadata->>'source' = 'promotion'
  AND status = 'draft';
```

- [ ] **Step 3: Verify**

```sql
SELECT count(*) FROM donny_scheduled_posts WHERE metadata->>'source' = 'promotion' AND status = 'draft';
```

Expected: 0 rows.

---

### Task 23: Final build + push verification

- [ ] **Step 1: Run full build**

Run: `npm run build`

Expected: Clean build.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`

Expected: All existing tests pass.

- [ ] **Step 4: Push to main**

```bash
git push origin main
```

- [ ] **Step 5: Verify on dragoncandy.io after deploy**

After Lovable auto-deploys:
- Navigate to `dragoncandy.io/dashboard/business/promotions` as restaurant account
- Take screenshot of the new dashboard
- Open Chrome DevTools, check for console errors
- Test both desktop and mobile viewports
- Verify the approve-and-post flow works end-to-end

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| Phase 1: Backend | Tasks 1-5 | 3 migrations, 1 edge function update |
| Phase 2: New Components | Tasks 6-13 (execute: 6, 7, 11, 12, 8, 9, 10, 13) | 4 new components, 1 new hook, 2 modified hooks |
| Phase 3: UI Swap | Tasks 14-18 | 3 page rewrites, settings integration, browser verification |
| Phase 4: Cleanup | Tasks 19-23 | Deprecate hook, inline callout, help article, orphan cleanup, final verification |

**Total: 23 tasks across 4 phases.**
