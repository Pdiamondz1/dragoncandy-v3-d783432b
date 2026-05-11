# Creator UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three creator-side UX issues — Projects page crash, pending application status visibility, and social prerequisite gate for creators.

**Architecture:** Three independent fixes touching backend (Supabase RLS + RPC migrations) and frontend (React components + hooks). Each fix is self-contained. Fix 1 is the largest — RLS policy, null guards, a new `revision_feedback` JSONB column, and wiring feedback data through the collaboration hook to DeliverableCard. Fix 2 is a single-file UI addition. Fix 3 is a frontend hook change plus RPC migration.

**Tech Stack:** React, TypeScript, Supabase (Postgres RLS, SQL functions), Tailwind CSS, React Query, date-fns

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260511000000_creator_ux_fixes.sql` | RLS policy fix, composite index, `revision_feedback` column, RPC update |
| Modify | `src/hooks/useCollaboration.ts` | Add `revision_feedback` to SELECT and typed interface |
| Modify | `src/components/projects/ProjectCard.tsx` | Null guards for `project.campaigns` |
| Modify | `src/pages/CreatorProjects.tsx` | Mark `campaigns` as nullable in type |
| Modify | `src/pages/CreatorEarnings.tsx` | Null guards for campaign data |
| Modify | `src/pages/ProjectDetailsPage.tsx` | Wire `revision_feedback` into DeliverableCard's `feedback` prop |
| Modify | `src/components/projects/ContentApprovalPanel.tsx` | Save structured feedback to `revision_feedback` column |
| Modify | `src/components/projects/CreatorContentSubmit.tsx` | Clear `revision_feedback` on content resubmit |
| Modify | `src/components/applications/DetailedApplicationCard.tsx` | Add pending context message + relative time |
| Modify | `src/hooks/usePrerequisiteStatus.ts` | Filter out `social` item for creators |

---

## Task 1: Supabase Migration — RLS, Index, Column, RPC

**Files:**
- Create: `supabase/migrations/20260511000000_creator_ux_fixes.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 1a: Fix campaigns RLS policy — grant creators read access for campaigns
-- they have collaborations on (fixes Projects page crash)
DROP POLICY IF EXISTS "Users can view own campaigns or published campaigns" ON campaigns;
CREATE POLICY "Users can view accessible campaigns" ON campaigns FOR SELECT USING (
  user_id = auth.uid()
  OR status = 'published'
  OR EXISTS (
    SELECT 1 FROM campaign_collaborations
    WHERE campaign_collaborations.campaign_id = campaigns.id
      AND campaign_collaborations.creator_id = auth.uid()
  )
);

-- 1b: Composite index for the EXISTS subquery performance
CREATE INDEX IF NOT EXISTS idx_campaign_collaborations_campaign_creator
  ON campaign_collaborations(campaign_id, creator_id);

-- 1c: Add revision_feedback JSONB column
ALTER TABLE campaign_collaborations
  ADD COLUMN IF NOT EXISTS revision_feedback JSONB DEFAULT NULL;

-- 1d: Update check_prerequisite_status RPC — creators always pass social check
CREATE OR REPLACE FUNCTION check_prerequisite_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  IF v_role = 'content_creator' THEN
    SELECT jsonb_build_object(
      'role', v_role,
      'profile_complete', (
        creator_name IS NOT NULL AND creator_name != '' AND
        bio IS NOT NULL AND bio != '' AND
        avatar_url IS NOT NULL AND avatar_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM creator_profiles WHERE id = p_user_id;
  ELSE
    SELECT jsonb_build_object(
      'role', COALESCE(account_type, 'business_client'),
      'profile_complete', (
        business_name IS NOT NULL AND business_name != '' AND
        description IS NOT NULL AND description != '' AND
        logo_url IS NOT NULL AND logo_url != ''
      ),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM business_profiles WHERE id = p_user_id;
  END IF;

  result = result || jsonb_build_object(
    'social_connected',
    CASE WHEN v_role = 'content_creator' THEN true
    ELSE EXISTS(SELECT 1 FROM business_outstand_accounts WHERE user_id = p_user_id)
    END
  );

  RETURN COALESCE(result, '{"role":"unknown","profile_complete":false,"social_connected":false,"stripe_complete":false}'::jsonb);
END;
$$;
```

- [ ] **Step 2: Verify build still passes**

Run: `npm run build`
Expected: Clean build with no errors (migration file is not bundled by Vite)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260511000000_creator_ux_fixes.sql
git commit -m "feat: add migration for creator UX fixes — RLS, index, revision_feedback, RPC"
```

---

## Task 2: Update useCollaboration Hook — Add revision_feedback

**Files:**
- Modify: `src/hooks/useCollaboration.ts`

- [ ] **Step 1: Add `revision_feedback` to `CollaborationDetails` interface**

In `src/hooks/useCollaboration.ts`, add to the interface (after `deliverables_status` on line 22):

```typescript
// Add this line after line 22:
  revision_feedback: Record<string, string> | null;
```

- [ ] **Step 2: Add `revision_feedback` to the SELECT query**

In the `.select()` call (line 60-94), add `revision_feedback` after `deliverables_status` on line 78:

```typescript
          deliverables_status,
          revision_feedback,
          campaigns!inner (
```

- [ ] **Step 3: Add `revision_feedback` to the return mapping**

In the return object (line 118-141), add after the `deliverables_status` line (136):

```typescript
        deliverables_status: (data.deliverables_status as Record<string, string>) ?? null,
        revision_feedback: (data.revision_feedback as Record<string, string>) ?? null,
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCollaboration.ts
git commit -m "feat: add revision_feedback to collaboration hook"
```

---

## Task 3: Null Guards — ProjectCard, CreatorProjects, CreatorEarnings

**Files:**
- Modify: `src/components/projects/ProjectCard.tsx`
- Modify: `src/pages/CreatorProjects.tsx`
- Modify: `src/pages/CreatorEarnings.tsx`

- [ ] **Step 1: Make campaigns nullable in CreatorProjects type**

In `src/pages/CreatorProjects.tsx`, change the `campaigns` property in `ProjectCollaboration` interface (line 32-43) from required to optional:

```typescript
  campaigns: {
    title: string;
    description?: string;
    deadline?: string;
    budget_min?: number;
    budget_max?: number;
    fixed_price?: number;
    pricing_type?: string;
    delivery_type?: string;
    deliverables?: string[];
  } | null;
```

- [ ] **Step 2: Make campaigns nullable in ProjectCard interface**

In `src/components/projects/ProjectCard.tsx`, change the `campaigns` property in the `ProjectCardProps` interface (line 13-19) to allow null:

```typescript
    campaigns: {
      title: string;
      delivery_type?: string;
      fixed_price?: number;
      budget_min?: number;
      budget_max?: number;
    } | null;
```

- [ ] **Step 3: Add null guard in ProjectCard render**

In `src/components/projects/ProjectCard.tsx`, add a null check at the top of the component body (after line 48, before line 49):

```typescript
export function ProjectCard({ project }: ProjectCardProps) {
  const navigate = useNavigate();

  if (!project.campaigns) {
    return (
      <div className="bg-white rounded-2xl p-4 border-l-4 border-l-gray-300 opacity-70">
        <p className="text-sm font-bold text-gray-400">Campaign unavailable</p>
        <p className="text-xs text-gray-400">This project's campaign data could not be loaded</p>
      </div>
    );
  }

  const deliveryType = project.campaigns.delivery_type || 'standard';
```

- [ ] **Step 4: Add null guard in CreatorEarnings**

In `src/pages/CreatorEarnings.tsx`, the earnings map (line 112-126) already uses optional chaining (`campaign?.fixed_price`, `campaign?.title`). Verify this by reading the code — no changes needed if optional chaining is already present. If any bare `.property` access exists on the campaign object, add optional chaining.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add src/components/projects/ProjectCard.tsx src/pages/CreatorProjects.tsx src/pages/CreatorEarnings.tsx
git commit -m "fix: add null guards for campaigns data in creator project views"
```

---

## Task 4: Wire Revision Feedback to DeliverableCard

**Files:**
- Modify: `src/pages/ProjectDetailsPage.tsx`

- [ ] **Step 1: Pass feedback prop to DeliverableCard**

In `src/pages/ProjectDetailsPage.tsx`, inside the deliverables map (lines 379-392), add the `feedback` prop to `DeliverableCard`. Change from:

```tsx
                    <DeliverableCard
                      key={d.id}
                      deliverable={d}
                      status={status}
                      uploadedFile={matchingFile ? { file_name: matchingFile.original_filename, file_size_bytes: matchingFile.file_size } : null}
                      disabled={collaboration.campaign.escrow_status !== 'held'}
                      onUpload={() => setUploadingDeliverableId(d.id)}
                    />
```

To:

```tsx
                    <DeliverableCard
                      key={d.id}
                      deliverable={d}
                      status={status}
                      uploadedFile={matchingFile ? { file_name: matchingFile.original_filename, file_size_bytes: matchingFile.file_size } : null}
                      feedback={collaboration.revision_feedback?.[d.id] ?? null}
                      disabled={collaboration.campaign.escrow_status !== 'held'}
                      onUpload={() => setUploadingDeliverableId(d.id)}
                    />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build. The `DeliverableCard` component already accepts a `feedback?: string | null` prop (line 22 of `DeliverableCard.tsx`) and renders it when `isRevision && feedback` (lines 78-82).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectDetailsPage.tsx
git commit -m "feat: wire per-deliverable revision feedback to DeliverableCard"
```

---

## Task 5: Save Structured Feedback on Revision Request

**Files:**
- Modify: `src/components/projects/ContentApprovalPanel.tsx`

- [ ] **Step 1: Save structured feedback to revision_feedback column**

In `src/components/projects/ContentApprovalPanel.tsx`, the `RevisionRequestModal`'s `onSubmit` handler (lines 332-335) currently flattens the feedback map. Add a Supabase update to save the structured feedback before flattening:

Change from:

```tsx
            <RevisionRequestModal
              open={showRevisionForm}
              onOpenChange={setShowRevisionForm}
              deliverables={campaignDeliverables}
              revisionCount={revisionCount}
              maxRevisions={MAX_REVISIONS}
              onSubmit={async (feedback) => {
                const combinedFeedback = Object.values(feedback).filter(Boolean).join('\n\n');
                await requestRevision.mutateAsync(combinedFeedback || 'Revision requested');
              }}
            />
```

To:

```tsx
            <RevisionRequestModal
              open={showRevisionForm}
              onOpenChange={setShowRevisionForm}
              deliverables={campaignDeliverables}
              revisionCount={revisionCount}
              maxRevisions={MAX_REVISIONS}
              onSubmit={async (feedback) => {
                await supabase
                  .from('campaign_collaborations')
                  .update({ revision_feedback: feedback })
                  .eq('id', collaborationId);
                const combinedFeedback = Object.values(feedback).filter(Boolean).join('\n\n');
                await requestRevision.mutateAsync(combinedFeedback || 'Revision requested');
              }}
            />
```

Note: `supabase` is already imported in this file (line 26: `import { supabase } from '@/integrations/supabase/client';`).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ContentApprovalPanel.tsx
git commit -m "feat: persist structured revision feedback to campaign_collaborations"
```

---

## Task 6: Clear Revision Feedback on Content Resubmit

**Files:**
- Modify: `src/components/projects/CreatorContentSubmit.tsx`

- [ ] **Step 1: Clear revision_feedback when creator resubmits**

In `src/components/projects/CreatorContentSubmit.tsx`, inside the `submitContent` mutation's `mutationFn` (line 117), add a Supabase update to clear revision feedback after the status transition succeeds. Add after line 121 (after the `transition_content_status` RPC call):

Change from:

```typescript
  const submitContent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'submitted',
      });
      if (error) throw error;

      const eventType = revisionCount > 0 ? 'content_resubmitted' : 'content_submitted';
```

To:

```typescript
  const submitContent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'submitted',
      });
      if (error) throw error;

      await supabase
        .from('campaign_collaborations')
        .update({ revision_feedback: null })
        .eq('id', collaborationId);

      const eventType = revisionCount > 0 ? 'content_resubmitted' : 'content_submitted';
```

Note: `supabase` is already imported in this file (line 16: `import { supabase } from '@/integrations/supabase/client';`).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/CreatorContentSubmit.tsx
git commit -m "fix: clear revision feedback when creator resubmits content"
```

---

## Task 7: Pending Application Context Message

**Files:**
- Modify: `src/components/applications/DetailedApplicationCard.tsx`

- [ ] **Step 1: Add import for formatDistanceToNow**

At the top of `src/components/applications/DetailedApplicationCard.tsx`, add after the existing imports (line 29):

```typescript
import { formatDistanceToNow } from 'date-fns';
```

- [ ] **Step 2: Add context message below the Pending badge**

In the `CardHeader` section, after the `ApplicationStatusBadge` (line 125) and before the `JointApprovalStatus` conditional (line 127), add the pending context block:

Change from:

```tsx
          <ApplicationStatusBadge status={application.status} />
        </div>
        {application.brand_approval_status && application.brand_approval_status !== 'pending' && (
```

To:

```tsx
          <ApplicationStatusBadge status={application.status} />
        </div>
        {application.status === 'pending' && (
          <div className="mt-2">
            <p className="text-sm text-gray-500">Awaiting business review</p>
            <p className="text-xs text-gray-400">
              Applied {formatDistanceToNow(new Date(application.created_at), { addSuffix: true })}
            </p>
          </div>
        )}
        {application.brand_approval_status && application.brand_approval_status !== 'pending' && (
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/components/applications/DetailedApplicationCard.tsx
git commit -m "feat: add pending status context message with relative time on applications"
```

---

## Task 8: Remove Social Prerequisite for Creators

**Files:**
- Modify: `src/hooks/usePrerequisiteStatus.ts`

- [ ] **Step 1: Filter out social item for creators in buildItems**

In `src/hooks/usePrerequisiteStatus.ts`, change the `buildItems` function (lines 27-62) to conditionally exclude the social item:

Change from:

```typescript
function buildItems(rpc: RpcResult): PrerequisiteItem[] {
  const isCreator = rpc.role === 'content_creator';
  const dashBase = isCreator ? '/dashboard/creator' : '/dashboard/business';

  return [
    {
      key: 'profile',
      met: rpc.profile_complete,
      label: rpc.profile_complete
        ? 'Profile complete'
        : isCreator
          ? 'Add your name, bio, and photo'
          : 'Add your business name, description, and logo',
      actionLabel: 'Complete Profile',
      actionPath: `${dashBase}/settings`,
    },
    {
      key: 'social',
      met: rpc.social_connected,
      label: rpc.social_connected
        ? 'Social media connected'
        : 'Connect at least one social account',
      actionLabel: 'Connect Social',
      actionPath: `${dashBase}/settings?section=social`,
    },
    {
      key: 'stripe',
      met: rpc.stripe_complete,
      label: rpc.stripe_complete
        ? 'Stripe account active'
        : 'Set up your payment account',
      actionLabel: 'Setup Stripe',
      actionPath: `${dashBase}/settings?section=payments`,
    },
  ];
}
```

To:

```typescript
function buildItems(rpc: RpcResult): PrerequisiteItem[] {
  const isCreator = rpc.role === 'content_creator';
  const dashBase = isCreator ? '/dashboard/creator' : '/dashboard/business';

  const items: PrerequisiteItem[] = [
    {
      key: 'profile',
      met: rpc.profile_complete,
      label: rpc.profile_complete
        ? 'Profile complete'
        : isCreator
          ? 'Add your name, bio, and photo'
          : 'Add your business name, description, and logo',
      actionLabel: 'Complete Profile',
      actionPath: `${dashBase}/settings`,
    },
  ];

  if (!isCreator) {
    items.push({
      key: 'social',
      met: rpc.social_connected,
      label: rpc.social_connected
        ? 'Social media connected'
        : 'Connect at least one social account',
      actionLabel: 'Connect Social',
      actionPath: `${dashBase}/settings?section=social`,
    });
  }

  items.push({
    key: 'stripe',
    met: rpc.stripe_complete,
    label: rpc.stripe_complete
      ? 'Stripe account active'
      : 'Set up your payment account',
    actionLabel: 'Setup Stripe',
    actionPath: `${dashBase}/settings?section=payments`,
  });

  return items;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePrerequisiteStatus.ts
git commit -m "feat: remove social/Outstand prerequisite for creator role"
```

---

## Task 9: Final Build Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Clean build with zero errors and zero TypeScript warnings

- [ ] **Step 2: Verify all changes are committed**

Run: `git status`
Expected: Clean working tree — all changes committed

- [ ] **Step 3: Review commit log**

Run: `git log --oneline -8`
Expected: 8 commits matching the tasks above (migration, hook, null guards, wire feedback, save feedback, clear feedback, pending context, social gate)
