# Campaign-to-Content Delivery Plumbing Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix P0/P1 gaps in the campaign-to-content delivery flow — state machine enforcement, content rejection/disputes, auto-approval timers, platform fee visibility, brand budget enforcement, joint approval, and file access tightening.

**Architecture:** State-machine-first approach. A Postgres function `transition_content_status` enforces all valid content status transitions. All fixes (reject, dispute, auto-approve, timer extension) are modeled as state transitions. Edge functions call the transition function instead of updating `content_status` directly. UI components read the state and render accordingly.

**Tech Stack:** Supabase (Postgres migrations, Edge Functions in Deno/TypeScript), React + TypeScript, TanStack React Query, Tailwind CSS, Stripe API, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-04-25-campaign-delivery-plumbing-fixes-design.md`

---

## File Structure

### New Files
- `supabase/migrations/20260425000000_collaboration_state_machine.sql` — state machine function, new columns, disputes table, joint approval trigger, budget RPC, bucket policy
- `supabase/functions/_shared/platform-fee.ts` — shared `PLATFORM_FEE_RATE` constant
- `supabase/functions/reject-content/index.ts` — content rejection edge function
- `supabase/functions/resolve-dispute/index.ts` — dispute resolution edge function
- `supabase/functions/extend-review/index.ts` — review extension edge function
- `src/components/projects/ReviewCountdownTimer.tsx` — auto-approval countdown UI
- `src/components/projects/RejectContentModal.tsx` — rejection reason modal
- `src/components/projects/DisputeStatusBanner.tsx` — dispute status for both parties
- `src/components/campaigns/BudgetProgressBar.tsx` — brand budget tracking UI
- `src/components/applications/JointApprovalStatus.tsx` — three-party approval badges
- `src/hooks/useReviewExtension.ts` — review extension mutation
- `src/hooks/useRejectContent.ts` — content rejection mutation
- `src/hooks/useBudgetStatus.ts` — brand budget query

### Modified Files
- `supabase/functions/auto-approve-content/index.ts` — use `submitted_at` + `review_extended`
- `supabase/functions/get-watermarked-preview/index.ts` — access matrix enforcement
- `supabase/functions/create-campaign-escrow/index.ts` — use shared constant
- `supabase/functions/release-creator-payout/index.ts` — use shared constant
- `supabase/functions/create-sponsorship-checkout/index.ts` — use shared constant
- `supabase/functions/release-sponsorship-payout/index.ts` — use shared constant
- `supabase/functions/verify-campaign-escrow/index.ts` — budget validation
- `src/components/projects/ContentApprovalPanel.tsx` — countdown timer, reject button, dispute status
- `src/components/projects/CreatorContentSubmit.tsx` — set `submitted_at`, dispute status
- `src/components/projects/ProtectedFilePreview.tsx` — access matrix UI
- `src/components/campaigns/CampaignFinalizeStep.tsx` — fee breakdown card
- `src/components/payments/PaymentTimeline.tsx` — fee line items
- `src/pages/CreatorEarnings.tsx` — fee visibility
- `src/hooks/useManageApplication.ts` — brand/restaurant approval support
- `src/hooks/useCollaboration.ts` — fetch new columns
- `src/components/applications/DetailedApplicationCard.tsx` — joint approval UI

---

## Task 1: Database Migration — State Machine, Disputes, Joint Approval, Budget

**Files:**
- Create: `supabase/migrations/20260425000000_collaboration_state_machine.sql`

This single migration adds all database-level changes: expanded content_status values, new columns, the state transition function, the disputes table, the joint approval trigger, and the budget RPC functions.

- [ ] **Step 1: Create the migration file with content_status expansion**

```sql
-- supabase/migrations/20260425000000_collaboration_state_machine.sql

-- ============================================================
-- 1. Expand content_status CHECK constraint
-- ============================================================
ALTER TABLE campaign_collaborations
  DROP CONSTRAINT IF EXISTS campaign_collaborations_content_status_check;

ALTER TABLE campaign_collaborations
  ADD CONSTRAINT campaign_collaborations_content_status_check
  CHECK (content_status IN (
    'pending', 'in_progress', 'submitted', 'revision_requested',
    'approved', 'auto_approved', 'rejected', 'disputed', 'resolved'
  ));

-- ============================================================
-- 2. Add new columns to campaign_collaborations
-- ============================================================
ALTER TABLE campaign_collaborations
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_extended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS dispute_outcome TEXT CHECK (dispute_outcome IN ('refund', 'partial_payment', 'approved'));

-- ============================================================
-- 3. State transition function
-- ============================================================
CREATE OR REPLACE FUNCTION transition_content_status(
  p_collaboration_id UUID,
  p_new_status TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
) RETURNS TABLE(old_status TEXT, new_status TEXT) AS $$
DECLARE
  v_current_status TEXT;
  v_revision_count INTEGER;
  v_valid BOOLEAN := false;
BEGIN
  SELECT content_status, revision_count
  INTO v_current_status, v_revision_count
  FROM campaign_collaborations
  WHERE id = p_collaboration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collaboration % not found', p_collaboration_id;
  END IF;

  -- Validate transition
  v_valid := CASE
    WHEN v_current_status = 'pending' AND p_new_status = 'in_progress' THEN true
    WHEN v_current_status = 'in_progress' AND p_new_status = 'submitted' THEN true
    WHEN v_current_status = 'submitted' AND p_new_status = 'approved' THEN true
    WHEN v_current_status = 'submitted' AND p_new_status = 'auto_approved' THEN true
    WHEN v_current_status = 'submitted' AND p_new_status = 'revision_requested' THEN true
    WHEN v_current_status = 'revision_requested' AND p_new_status = 'submitted' THEN true
    WHEN v_current_status = 'revision_requested' AND p_new_status = 'rejected' AND v_revision_count >= 2 THEN true
    WHEN v_current_status = 'rejected' AND p_new_status = 'disputed' THEN true
    WHEN v_current_status = 'disputed' AND p_new_status = 'resolved' THEN true
    ELSE false
  END;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'Invalid transition: % → % (revision_count=%)',
      v_current_status, p_new_status, v_revision_count;
  END IF;

  -- Apply side effects
  IF p_new_status = 'submitted' AND v_current_status = 'revision_requested' THEN
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        submitted_at = now(),
        review_extended = false,
        revision_count = revision_count + 1,
        updated_at = now()
    WHERE id = p_collaboration_id;
  ELSIF p_new_status = 'submitted' THEN
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        submitted_at = now(),
        review_extended = false,
        updated_at = now()
    WHERE id = p_collaboration_id;
  ELSIF p_new_status = 'in_progress' THEN
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        content_started_at = COALESCE(content_started_at, now()),
        updated_at = now()
    WHERE id = p_collaboration_id;
  ELSIF p_new_status = 'revision_requested' THEN
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        submitted_at = NULL,
        review_extended = false,
        updated_at = now()
    WHERE id = p_collaboration_id;
  ELSIF p_new_status = 'rejected' THEN
    UPDATE campaign_collaborations
    SET content_status = 'rejected',
        dispute_reason = p_reason,
        updated_at = now()
    WHERE id = p_collaboration_id;
    -- Auto-transition to disputed
    UPDATE campaign_collaborations
    SET content_status = 'disputed',
        updated_at = now()
    WHERE id = p_collaboration_id;
    -- Override return value
    RETURN QUERY SELECT v_current_status, 'disputed'::TEXT;
    RETURN;
  ELSIF p_new_status = 'resolved' THEN
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        updated_at = now()
    WHERE id = p_collaboration_id;
  ELSE
    UPDATE campaign_collaborations
    SET content_status = p_new_status,
        updated_at = now()
    WHERE id = p_collaboration_id;
  END IF;

  RETURN QUERY SELECT v_current_status, p_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Content disputes table
-- ============================================================
CREATE TABLE IF NOT EXISTS content_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id UUID NOT NULL REFERENCES campaign_collaborations(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  outcome TEXT CHECK (outcome IN ('refund', 'partial_payment', 'approved')),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_disputes_collaboration
  ON content_disputes(collaboration_id);

CREATE INDEX IF NOT EXISTS idx_content_disputes_status
  ON content_disputes(status);

-- RLS for content_disputes
ALTER TABLE content_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view disputes"
  ON content_disputes FOR SELECT
  USING (
    initiated_by = auth.uid()
    OR collaboration_id IN (
      SELECT cc.id FROM campaign_collaborations cc
      WHERE cc.creator_id = auth.uid()
    )
    OR collaboration_id IN (
      SELECT cc.id FROM campaign_collaborations cc
      JOIN campaigns c ON c.id = cc.campaign_id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages disputes"
  ON content_disputes FOR ALL
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- ============================================================
-- 5. Joint approval trigger
-- ============================================================
CREATE OR REPLACE FUNCTION recompute_final_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_has_sponsorship BOOLEAN;
BEGIN
  -- Check if this campaign has an associated sponsorship
  SELECT EXISTS(
    SELECT 1 FROM campaign_sponsorships cs
    JOIN campaigns c ON c.id = cs.campaign_id
    WHERE c.id = (SELECT campaign_id FROM campaign_applications WHERE id = NEW.id)
  ) INTO v_has_sponsorship;

  IF v_has_sponsorship THEN
    -- Three-party: both must approve
    IF NEW.brand_approval_status = 'rejected' OR NEW.restaurant_approval_status = 'rejected' THEN
      NEW.final_approval_status := 'rejected';
    ELSIF NEW.brand_approval_status = 'approved' AND NEW.restaurant_approval_status = 'approved' THEN
      NEW.final_approval_status := 'approved';
    ELSE
      NEW.final_approval_status := 'pending';
    END IF;
  ELSE
    -- Two-party: restaurant approval is final
    NEW.final_approval_status := NEW.restaurant_approval_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_final_approval ON campaign_applications;
CREATE TRIGGER trg_recompute_final_approval
  BEFORE UPDATE OF brand_approval_status, restaurant_approval_status
  ON campaign_applications
  FOR EACH ROW
  EXECUTE FUNCTION recompute_final_approval();

-- ============================================================
-- 6. Brand budget tracking
-- ============================================================
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS budget_spent NUMERIC DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role != 'service_role' THEN
    RAISE EXCEPTION 'increment_budget_spent is server-only';
  END IF;

  UPDATE campaigns
  SET budget_spent = COALESCE(budget_spent, 0) + p_amount
  WHERE id = p_campaign_id
  RETURNING budget_spent INTO new_spent;

  RETURN new_spent;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_budget_spent(
  p_campaign_id UUID,
  p_amount NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
  new_spent NUMERIC;
  caller_role TEXT;
BEGIN
  caller_role := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  IF caller_role != 'service_role' THEN
    RAISE EXCEPTION 'decrement_budget_spent is server-only';
  END IF;

  UPDATE campaigns
  SET budget_spent = GREATEST(COALESCE(budget_spent, 0) - p_amount, 0)
  WHERE id = p_campaign_id
  RETURNING budget_spent INTO new_spent;

  RETURN new_spent;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Bucket policy: make campaign-deliverables private
-- ============================================================
UPDATE storage.buckets
SET public = false
WHERE id = 'campaign-deliverables';

-- Drop overly permissive policies and replace with service-role-only
DROP POLICY IF EXISTS "Participants can view deliverables" ON storage.objects;

CREATE POLICY "Service role accesses deliverables"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campaign-deliverables'
    AND (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Keep upload policy for creators
CREATE POLICY "Creators can upload deliverables"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campaign-deliverables'
    AND auth.uid() IS NOT NULL
  );

-- ============================================================
-- 8. Whitelist new event types in insert_payment_event RPC
-- ============================================================
CREATE OR REPLACE FUNCTION insert_payment_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_campaign_id UUID,
  p_metadata JSONB DEFAULT '{}'
) RETURNS void AS $$
DECLARE
  v_actor_id UUID;
  v_actor_role TEXT;
  v_allowed_types TEXT[] := ARRAY[
    'content_started', 'content_submitted', 'revision_requested',
    'content_resubmitted', 'review_extended', 'file_accessed'
  ];
BEGIN
  IF NOT (p_event_type = ANY(v_allowed_types)) THEN
    RAISE EXCEPTION 'Event type % not allowed from client', p_event_type;
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT CASE
    WHEN EXISTS(SELECT 1 FROM creator_profiles WHERE user_id = v_actor_id) THEN 'creator'
    WHEN EXISTS(SELECT 1 FROM business_profiles WHERE user_id = v_actor_id) THEN 'business'
    ELSE 'system'
  END INTO v_actor_role;

  INSERT INTO payment_events (event_type, entity_type, entity_id, campaign_id, actor_id, actor_role, metadata)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_campaign_id, v_actor_id, v_actor_role, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Verify migration syntax locally**

Run: `npx supabase db lint --level warning`
Expected: No errors on the new migration file.

- [ ] **Step 3: Apply migration to local database**

Run: `npx supabase db push` (or `npx supabase migration up` if using local dev)
Expected: Migration applied successfully.

- [ ] **Step 4: Verify state machine function works**

Run these SQL test queries against the local database (via Supabase SQL editor or `psql`):

```sql
-- Test: valid transition pending → in_progress
SELECT * FROM transition_content_status(
  '<test_collaboration_id>', 'in_progress'
);
-- Expected: returns old_status='pending', new_status='in_progress'

-- Test: invalid transition pending → approved (should fail)
SELECT * FROM transition_content_status(
  '<test_collaboration_id>', 'approved'
);
-- Expected: ERROR 'Invalid transition: in_progress → approved'

-- Test: rejected auto-transitions to disputed
-- (set up a collaboration with revision_count=2, content_status='revision_requested')
SELECT * FROM transition_content_status(
  '<test_collaboration_id>', 'rejected', NULL, 'Content does not match brief'
);
-- Expected: returns old_status='revision_requested', new_status='disputed'
```

- [ ] **Step 5: Verify joint approval trigger works**

```sql
-- Test: update restaurant_approval_status triggers final recomputation
UPDATE campaign_applications
SET restaurant_approval_status = 'approved'
WHERE id = '<test_application_id>';

SELECT final_approval_status FROM campaign_applications WHERE id = '<test_application_id>';
-- Expected for non-sponsored campaign: final_approval_status = 'approved'
-- Expected for sponsored campaign: final_approval_status = 'pending' (brand still pending)
```

- [ ] **Step 6: Commit migration**

```bash
git add supabase/migrations/20260425000000_collaboration_state_machine.sql
git commit -m "feat(db): add collaboration state machine, disputes table, joint approval trigger, budget RPCs

State machine function enforces valid content_status transitions.
Content disputes table with RLS for participant access.
Joint approval trigger auto-computes final_approval_status.
Budget tracking RPCs for brand spend enforcement.
Campaign-deliverables bucket set to private."
```

---

## Task 2: Platform Fee Shared Constant

**Files:**
- Create: `supabase/functions/_shared/platform-fee.ts`
- Modify: `supabase/functions/create-campaign-escrow/index.ts`
- Modify: `supabase/functions/release-creator-payout/index.ts`
- Modify: `supabase/functions/create-sponsorship-checkout/index.ts`
- Modify: `supabase/functions/release-sponsorship-payout/index.ts`

- [ ] **Step 1: Create the shared platform fee module**

```typescript
// supabase/functions/_shared/platform-fee.ts
export const PLATFORM_FEE_RATE = 0.05;

export function calculatePlatformFee(amountDollars: number): {
  feeCents: number;
  netPayoutDollars: number;
  feeDollars: number;
} {
  const feeDollars = amountDollars * PLATFORM_FEE_RATE;
  return {
    feeCents: Math.round(feeDollars * 100),
    netPayoutDollars: amountDollars - feeDollars,
    feeDollars,
  };
}
```

- [ ] **Step 2: Update create-campaign-escrow to use shared constant**

In `supabase/functions/create-campaign-escrow/index.ts`, replace the inline calculation:

Replace:
```typescript
    // Calculate platform fee (5%)
    const platformFee = Math.round(totalAmount * 0.05 * 100); // Convert to cents
```

With:
```typescript
    import { PLATFORM_FEE_RATE } from "../_shared/platform-fee.ts";
    // ...
    const platformFee = Math.round(totalAmount * PLATFORM_FEE_RATE * 100);
```

Note: The import goes at the top of the file with other imports.

- [ ] **Step 3: Update release-creator-payout to use shared constant**

In `supabase/functions/release-creator-payout/index.ts`, replace:

```typescript
    // Platform takes 5%
    const platformFee = payoutAmount * 0.05;
    const creatorPayout = payoutAmount - platformFee;
```

With:
```typescript
    import { calculatePlatformFee } from "../_shared/platform-fee.ts";
    // ...
    const { feeDollars: platformFee, netPayoutDollars: creatorPayout } = calculatePlatformFee(payoutAmount);
```

- [ ] **Step 4: Update create-sponsorship-checkout to use shared constant**

In `supabase/functions/create-sponsorship-checkout/index.ts`, replace:

```typescript
    // Calculate platform fee (5%)
    const platformFee = Math.round(amount * 0.05 * 100); // Convert to cents
```

With:
```typescript
    import { PLATFORM_FEE_RATE } from "../_shared/platform-fee.ts";
    // ...
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE * 100);
```

- [ ] **Step 5: Update release-sponsorship-payout to use shared constant**

In `supabase/functions/release-sponsorship-payout/index.ts`, replace:

```typescript
    // Platform takes 5%
    const platformFee = sponsorshipAmount * 0.05;
    const restaurantPayout = sponsorshipAmount - platformFee;
```

With:
```typescript
    import { calculatePlatformFee } from "../_shared/platform-fee.ts";
    // ...
    const { feeDollars: platformFee, netPayoutDollars: restaurantPayout } = calculatePlatformFee(sponsorshipAmount);
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/platform-fee.ts supabase/functions/create-campaign-escrow/index.ts supabase/functions/release-creator-payout/index.ts supabase/functions/create-sponsorship-checkout/index.ts supabase/functions/release-sponsorship-payout/index.ts
git commit -m "refactor(fees): extract PLATFORM_FEE_RATE to shared constant

All four payment edge functions now use a single source of truth
for the 5% platform fee rate."
```

---

## Task 3: File Access Tightening — Edge Function

**Files:**
- Modify: `supabase/functions/get-watermarked-preview/index.ts`

- [ ] **Step 1: Rewrite the access control logic in get-watermarked-preview**

Replace the current simple `isApproved` check with the full access matrix. The key section to replace starts after the collaboration lookup (around line 70). Replace the existing download logic with:

```typescript
    // Access matrix based on content_status and user role
    const contentStatus = collab.content_status;
    const isCreator = collab.creator_id === userId;
    const isBusiness = (collab as any).campaigns?.user_id === userId;

    // Check for brand access on sponsored campaigns
    let isBrand = false;
    if (!isCreator && !isBusiness) {
      const { data: sponsorship } = await adminClient
        .from('campaign_sponsorships')
        .select('brand_id')
        .eq('campaign_id', collab.campaign_id)
        .single();
      if (sponsorship) {
        const { data: brandProfile } = await adminClient
          .from('business_profiles')
          .select('user_id')
          .eq('id', sponsorship.brand_id)
          .single();
        isBrand = brandProfile?.user_id === userId;
      }
    }

    if (!isCreator && !isBusiness && !isBrand) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const isApprovedStatus = ['approved', 'auto_approved'].includes(contentStatus || '');
    const isResolvedApproved = contentStatus === 'resolved' &&
      (collab as any).dispute_outcome === 'approved';
    const canDownload = isApprovedStatus || isResolvedApproved;
    const isResolvedRefund = contentStatus === 'resolved' &&
      (collab as any).dispute_outcome === 'refund';

    // Business loses access on refund resolution
    if ((isBusiness || isBrand) && isResolvedRefund) {
      return new Response(
        JSON.stringify({ error: "Access revoked after refund" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Business cannot access files before submission
    if ((isBusiness || isBrand) && ['pending', 'in_progress'].includes(contentStatus || '')) {
      return new Response(
        JSON.stringify({ error: "Content not yet submitted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Log file access event (fire-and-forget)
    writePaymentEvent(adminClient, {
      event_type: 'file_accessed',
      entity_type: 'collaboration',
      entity_id: collaboration_id,
      campaign_id: collab.campaign_id,
      actor_id: userId,
      actor_role: isCreator ? 'creator' : isBrand ? 'brand' : 'business',
      metadata: { file_path, can_download: canDownload },
    }, '[GET-WATERMARKED-PREVIEW]');

    if (canDownload || isCreator) {
      // Full download: 1-hour expiry with Content-Disposition attachment
      const { data: signedUrl, error: signError } = await adminClient.storage
        .from(bucket_name)
        .createSignedUrl(file_path, 3600, {
          download: canDownload ? true : false,
        });
      if (signError || !signedUrl) {
        return new Response(
          JSON.stringify({ error: "Failed to generate download URL" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
      return new Response(
        JSON.stringify({ url: signedUrl.signedUrl, canDownload }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    } else {
      // Preview only: 15-minute expiry, no download header
      const { data: signedUrl, error: signError } = await adminClient.storage
        .from(bucket_name)
        .createSignedUrl(file_path, 900);
      if (signError || !signedUrl) {
        return new Response(
          JSON.stringify({ error: "Failed to generate preview URL" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
      return new Response(
        JSON.stringify({
          url: signedUrl.signedUrl,
          canDownload: false,
          message: "Preview only. Download available after content approval.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
```

Also update the collaboration query to include `dispute_outcome`:

```typescript
    const { data: collab } = await adminClient
      .from('campaign_collaborations')
      .select('id, content_status, creator_id, campaign_id, dispute_outcome, campaigns!inner(user_id)')
      .eq('id', collaboration_id)
      .single();
```

Add the import for `writePaymentEvent` at the top:

```typescript
import { writePaymentEvent } from "../_shared/payment-events.ts";
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/get-watermarked-preview/index.ts
git commit -m "fix(files): enforce access matrix in get-watermarked-preview

Preview-only (15min expiry) for unapproved content.
Full download (1h expiry) only for approved/resolved-approved.
Business blocked before submission and after refund.
Brand access supported for sponsored campaigns.
All file access logged as payment events."
```

---

## Task 4: File Access Tightening — UI

**Files:**
- Modify: `src/components/projects/ProtectedFilePreview.tsx`

- [ ] **Step 1: Update ProtectedFilePreview to use canDownload from edge function**

The current component uses a local `canDownload = isApproved || !isBusinessClient` check. Update it to use the `canDownload` flag returned by the edge function, and add "Preview Only" badge and right-click disable.

In `src/components/projects/ProtectedFilePreview.tsx`, update the signed URL fetch to capture `canDownload` from the response, and update the UI:

Replace the existing `canDownload` logic with reading it from the edge function response. Add the preview badge:

```tsx
// After the signed URL fetch, use the response's canDownload field:
const [canDownload, setCanDownload] = useState(false);

// In the fetch handler:
const data = await response.json();
setPreviewUrl(data.url);
setCanDownload(data.canDownload ?? false);
```

Add the "Preview Only" badge in the JSX (inside the card, top-right):

```tsx
{!canDownload && (
  <div className="absolute top-2 right-2 z-10">
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800">
      <Lock className="h-3 w-3" />
      Preview Only
    </span>
  </div>
)}
```

Add right-click disable on the preview container:

```tsx
<div onContextMenu={(e) => { if (!canDownload) e.preventDefault(); }}>
  {/* existing image/video preview */}
</div>
```

Show/hide the download button based on `canDownload`:

```tsx
{canDownload && (
  <Button variant="outline" size="sm" onClick={handleDownload}>
    <Download className="h-4 w-4 mr-1" />
    Download
  </Button>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projects/ProtectedFilePreview.tsx
git commit -m "fix(files): add Preview Only badge and hide download for unapproved content

Uses canDownload from edge function response.
Right-click disabled on preview-only content.
Download button hidden until content approved."
```

---

## Task 5: Auto-Approval — Update Cron Function

**Files:**
- Modify: `supabase/functions/auto-approve-content/index.ts`

- [ ] **Step 1: Update the auto-approve cron to use submitted_at and review_extended**

Replace the current time calculation that uses `updated_at` with `submitted_at`, and add extension support.

In `supabase/functions/auto-approve-content/index.ts`, update the query to include `submitted_at` and `review_extended`:

```typescript
    const { data: collaborations } = await supabaseClient
      .from('campaign_collaborations')
      .select(`
        id, content_status, submitted_at, review_extended,
        campaigns!inner(delivery_type, pricing_type, fixed_price, budget_max, delivery_fee)
      `)
      .eq('content_status', 'submitted')
      .eq('status', 'active')
      .not('submitted_at', 'is', null);
```

Replace the hours-elapsed calculation:

```typescript
    const AUTO_APPROVE_HOURS: Record<string, number> = {
      standard: 48,
      expedited: 24,
      dragonrush: 4,
    };

    const EXTENSION_HOURS: Record<string, number> = {
      standard: 24,
      expedited: 24,
      dragonrush: 2,
    };

    for (const collab of collaborations) {
      const deliveryType = (collab as any).campaigns?.delivery_type || 'standard';
      const baseHours = AUTO_APPROVE_HOURS[deliveryType] || 48;
      const extensionHours = collab.review_extended
        ? (EXTENSION_HOURS[deliveryType] || 24)
        : 0;
      const approveAfterHours = baseHours + extensionHours;

      const submittedAt = new Date(collab.submitted_at!).getTime();
      const hoursElapsed = (now - submittedAt) / (1000 * 60 * 60);

      if (hoursElapsed < approveAfterHours) continue;

      logStep("Auto-approving", { collaborationId: collab.id, hoursElapsed, approveAfterHours });

      // Use state machine transition
      const { error: transitionError } = await supabaseClient
        .rpc('transition_content_status', {
          p_collaboration_id: collab.id,
          p_new_status: 'auto_approved',
        });

      if (transitionError) {
        logStep("Transition failed", { error: transitionError.message });
        continue;
      }

      // Write payment event
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_auto_approved',
        entity_type: 'collaboration',
        entity_id: collab.id,
        campaign_id: (collab as any).campaigns?.id,
        actor_role: 'system',
        metadata: { auto_approved: true, hours_elapsed: hoursElapsed, delivery_type: deliveryType },
      }, '[AUTO-APPROVE-CONTENT]');

      // Trigger payout
      const payoutResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/release-creator-payout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ collaborationId: collab.id }),
        }
      );
      logStep("Payout response", { status: payoutResponse.status });
    }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/auto-approve-content/index.ts
git commit -m "fix(auto-approve): use submitted_at and review_extended for deadline calculation

Replaces updated_at with submitted_at for accurate timing.
Adds extension hours when review_extended is true.
Uses transition_content_status for state machine enforcement."
```

---

## Task 6: Auto-Approval — Review Extension Edge Function

**Files:**
- Create: `supabase/functions/extend-review/index.ts`

- [ ] **Step 1: Create the extend-review edge function**

```typescript
// supabase/functions/extend-review/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[EXTEND-REVIEW] ${step}`, details ? JSON.stringify(details) : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { collaborationId } = await req.json();
    if (!collaborationId) {
      return new Response(
        JSON.stringify({ error: "collaborationId required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Extending review", { collaborationId, userId: user.id });

    // Fetch collaboration with campaign owner check
    const { data: collab, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, content_status, review_extended, submitted_at, campaign_id, campaigns!inner(user_id, delivery_type)')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Only business owner can extend
    if ((collab as any).campaigns?.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only the campaign owner can extend review time" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Must be in submitted status
    if (collab.content_status !== 'submitted') {
      return new Response(
        JSON.stringify({ error: "Can only extend review for submitted content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Can only extend once
    if (collab.review_extended) {
      return new Response(
        JSON.stringify({ error: "Review has already been extended" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Set review_extended = true
    const { error: updateError } = await supabaseClient
      .from('campaign_collaborations')
      .update({ review_extended: true, updated_at: new Date().toISOString() })
      .eq('id', collaborationId);

    if (updateError) {
      logStep("Extension failed", { error: updateError.message });
      return new Response(
        JSON.stringify({ error: "Failed to extend review" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Write payment event
    await writePaymentEvent(supabaseClient, {
      event_type: 'review_extended',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { delivery_type: (collab as any).campaigns?.delivery_type },
    }, '[EXTEND-REVIEW]');

    logStep("Review extended successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/extend-review/index.ts
git commit -m "feat(auto-approve): add extend-review edge function

Allows restaurant to extend review window once per submission.
Validates ownership, submitted status, and single-use constraint."
```

---

## Task 7: Auto-Approval — Countdown Timer Component + Hook

**Files:**
- Create: `src/hooks/useReviewExtension.ts`
- Create: `src/components/projects/ReviewCountdownTimer.tsx`

- [ ] **Step 1: Create the review extension hook**

```typescript
// src/hooks/useReviewExtension.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useReviewExtension() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId }: { collaborationId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("extend-review", {
        body: { collaborationId },
      });

      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Review time extended");
      queryClient.invalidateQueries({ queryKey: ["collaboration"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to extend review time");
    },
  });
}
```

- [ ] **Step 2: Create the ReviewCountdownTimer component**

```tsx
// src/components/projects/ReviewCountdownTimer.tsx
import { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useReviewExtension } from "@/hooks/useReviewExtension";

const AUTO_APPROVE_HOURS: Record<string, number> = {
  standard: 48,
  expedited: 24,
  dragonrush: 4,
};

const EXTENSION_HOURS: Record<string, number> = {
  standard: 24,
  expedited: 24,
  dragonrush: 2,
};

interface ReviewCountdownTimerProps {
  collaborationId: string;
  submittedAt: string | null;
  reviewExtended: boolean;
  deliveryType: string;
  contentStatus: string | null;
}

export function ReviewCountdownTimer({
  collaborationId,
  submittedAt,
  reviewExtended,
  deliveryType,
  contentStatus,
}: ReviewCountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const extendMutation = useReviewExtension();

  const tier = deliveryType || "standard";
  const baseHours = AUTO_APPROVE_HOURS[tier] || 48;
  const extensionHours = reviewExtended ? (EXTENSION_HOURS[tier] || 24) : 0;
  const totalMs = (baseHours + extensionHours) * 60 * 60 * 1000;

  useEffect(() => {
    if (contentStatus !== "submitted" || !submittedAt) return;

    const deadline = new Date(submittedAt).getTime() + totalMs;

    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setTimeLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [submittedAt, totalMs, contentStatus]);

  if (contentStatus !== "submitted" || !submittedAt) return null;

  const totalDuration = totalMs;
  const percentRemaining = Math.max(0, (timeLeft / totalDuration) * 100);

  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  const colorClass =
    percentRemaining > 50
      ? "bg-green-50 border-green-200 text-green-800"
      : percentRemaining > 25
        ? "bg-yellow-50 border-yellow-200 text-yellow-800"
        : "bg-red-50 border-red-200 text-red-800";

  const barColor =
    percentRemaining > 50
      ? "bg-green-500"
      : percentRemaining > 25
        ? "bg-yellow-500"
        : "bg-red-500";

  if (timeLeft <= 0) {
    return (
      <div className="rounded-xl border bg-gray-50 border-gray-200 p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Clock className="h-4 w-4" />
          <span className="font-medium">Auto-approval processing...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 ${colorClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {percentRemaining <= 25 ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Clock className="h-5 w-5" />
          )}
          <div>
            <p className="font-semibold">
              {hours}h {minutes}m left to review
            </p>
            <p className="text-xs opacity-75">
              Content will be auto-approved and payment released when the timer expires
            </p>
          </div>
        </div>

        {!reviewExtended ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => extendMutation.mutate({ collaborationId })}
            disabled={extendMutation.isPending}
            className="shrink-0"
          >
            Need more time?
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" disabled className="shrink-0">
                Extended
              </Button>
            </TooltipTrigger>
            <TooltipContent>Extension already used</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="mt-3 h-2 rounded-full bg-black/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${barColor}`}
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useReviewExtension.ts src/components/projects/ReviewCountdownTimer.tsx
git commit -m "feat(auto-approve): add ReviewCountdownTimer component and useReviewExtension hook

Countdown timer shows time remaining before auto-approval.
Color shifts green→yellow→red based on percentage remaining.
One-time extension button calls extend-review edge function."
```

---

## Task 8: Auto-Approval — Integrate Timer into ContentApprovalPanel

**Files:**
- Modify: `src/components/projects/ContentApprovalPanel.tsx`
- Modify: `src/hooks/useCollaboration.ts`

- [ ] **Step 1: Update useCollaboration to fetch new columns**

In `src/hooks/useCollaboration.ts`, add `submitted_at`, `review_extended`, `dispute_reason`, `dispute_outcome` to the select query on `campaign_collaborations`. Find the `.select(...)` call and add the new fields:

```typescript
    .select(`
      id, campaign_id, creator_id, status, content_status,
      content_started_at, content_deadline, revision_count,
      submitted_at, review_extended, dispute_reason, dispute_outcome,
      business_completion_status, creator_completion_status, completed_at,
      created_at, updated_at,
      campaigns!inner(id, title, description, status, deadline, budget_min, budget_max, fixed_price, pricing_type, delivery_type, delivery_fee, user_id)
    `)
```

Update the `CollaborationDetails` interface to include the new fields:

```typescript
export interface CollaborationDetails {
  // ... existing fields ...
  submitted_at: string | null;
  review_extended: boolean;
  dispute_reason: string | null;
  dispute_outcome: string | null;
}
```

- [ ] **Step 2: Add ReviewCountdownTimer to ContentApprovalPanel**

In `src/components/projects/ContentApprovalPanel.tsx`, import and render the timer above the action buttons when content is submitted:

```typescript
import { ReviewCountdownTimer } from "./ReviewCountdownTimer";
```

Add the timer in the JSX, right before the approve/revision/reject buttons section (around line 250):

```tsx
{contentStatus === 'submitted' && (
  <ReviewCountdownTimer
    collaborationId={collaborationId}
    submittedAt={submittedAt}
    reviewExtended={reviewExtended}
    deliveryType={deliveryType}
    contentStatus={contentStatus}
  />
)}
```

This requires passing `submittedAt`, `reviewExtended`, and `deliveryType` as props. Update the component's props interface:

```typescript
interface ContentApprovalPanelProps {
  collaborationId: string;
  campaignId: string;
  contentStatus: string | null;
  revisionCount: number;
  creatorId: string;
  creatorName: string;
  submittedAt: string | null;
  reviewExtended: boolean;
  deliveryType: string;
  onApproved?: () => void;
}
```

- [ ] **Step 3: Update ContentApprovalPanel mutations to use state machine**

Replace the direct `content_status` update in the `requestRevision` mutation with a call to the `transition_content_status` RPC:

```typescript
const requestRevision = useMutation({
  mutationFn: async (feedback: string) => {
    const { error } = await supabase.rpc('transition_content_status', {
      p_collaboration_id: collaborationId,
      p_new_status: 'revision_requested',
    });
    if (error) throw error;

    // Insert feedback message
    // ... existing message insertion code ...

    // Insert payment event
    await supabase.rpc('insert_payment_event', {
      p_event_type: 'revision_requested',
      p_entity_type: 'collaboration',
      p_entity_id: collaborationId,
      p_campaign_id: campaignId,
      p_metadata: JSON.stringify({ feedback, revision_count: revisionCount + 1 }),
    });
  },
  // ... existing onSuccess/onError handlers ...
});
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCollaboration.ts src/components/projects/ContentApprovalPanel.tsx
git commit -m "feat(auto-approve): integrate countdown timer into ContentApprovalPanel

Timer shown when content is submitted with green/yellow/red states.
useCollaboration fetches submitted_at, review_extended, dispute columns.
requestRevision now uses transition_content_status RPC."
```

---

## Task 9: Platform Fee UI — Finalize Step + Earnings + Timeline

**Files:**
- Modify: `src/components/campaigns/CampaignFinalizeStep.tsx`
- Modify: `src/pages/CreatorEarnings.tsx`
- Modify: `src/components/payments/PaymentTimeline.tsx`

- [ ] **Step 1: Add fee breakdown to CampaignFinalizeStep**

In `src/components/campaigns/CampaignFinalizeStep.tsx`, find the DragonDash Summary Card section (around line 312). Add a clear cost breakdown below the existing pricing display:

```tsx
<div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
  <h4 className="font-semibold text-sm text-gray-600 uppercase tracking-wide">Payment Summary</h4>
  <div className="flex justify-between text-sm">
    <span className="text-gray-600">Content budget</span>
    <span className="font-medium">${campaignData.pricingType === 'fixed' ? campaignData.fixedPrice?.toFixed(2) : `${campaignData.budgetMin}–${campaignData.budgetMax}`}</span>
  </div>
  {campaignData.deliveryFee > 0 && (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">Delivery fee ({campaignData.deliveryType})</span>
      <span className="font-medium">${campaignData.deliveryFee.toFixed(2)}</span>
    </div>
  )}
  <div className="border-t pt-2 flex justify-between text-sm font-bold">
    <span>Total you pay</span>
    <span>${getTotalCost().toFixed(2)}</span>
  </div>
  <p className="text-xs text-gray-400">A 5% service fee is deducted from the creator's payout — you are not charged extra.</p>
</div>
```

- [ ] **Step 2: Add fee visibility to CreatorEarnings**

In `src/pages/CreatorEarnings.tsx`, find the Payment History section (around line 406). The earnings query already calculates a 5% platform fee. Update the payment history items to show the fee explicitly:

```tsx
{/* Inside the payment history list item */}
<div className="flex flex-col gap-0.5">
  <div className="flex justify-between text-sm">
    <span className="text-gray-600">Campaign value</span>
    <span>${item.amount.toFixed(2)}</span>
  </div>
  <div className="flex justify-between text-sm text-red-500">
    <span>DragonCandy fee (5%)</span>
    <span>-${item.platformFee.toFixed(2)}</span>
  </div>
  <div className="flex justify-between text-sm font-bold border-t pt-1">
    <span>Your payout</span>
    <span className="text-teal-600">${(item.amount - item.platformFee).toFixed(2)}</span>
  </div>
</div>
```

- [ ] **Step 3: Surface platform_fee in PaymentTimeline**

In `src/components/payments/PaymentTimeline.tsx`, update the event rendering to show the platform fee when present in metadata. After the existing event description rendering (around line 90):

```tsx
{event.metadata?.platform_fee && (
  <p className="text-xs text-gray-400 mt-0.5">
    Platform fee: ${(Number(event.metadata.platform_fee) / 100).toFixed(2)}
  </p>
)}
```

Also add `'content_auto_approved'`, `'content_rejected'`, `'dispute_opened'`, `'dispute_resolved'`, `'review_extended'` to the event type icon mapping in `getStepIcon`:

```typescript
const failureEvents = new Set([
  'escrow_failed', 'escrow_expired', 'transfer_failed',
  'dispute_created', 'content_rejected', 'dispute_opened',
]);

const warningEvents = new Set([
  'review_extended', 'revision_requested',
]);
```

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CampaignFinalizeStep.tsx src/pages/CreatorEarnings.tsx src/components/payments/PaymentTimeline.tsx
git commit -m "feat(fees): make 5% platform fee visible across the app

Restaurant sees total cost with note about creator fee deduction.
Creator sees campaign value minus 5% fee in earnings history.
Payment timeline shows platform fee from event metadata.
New event types added to timeline icon mapping."
```

---

## Task 10: Joint Approval — Hook + UI Updates

**Files:**
- Modify: `src/hooks/useManageApplication.ts`
- Create: `src/components/applications/JointApprovalStatus.tsx`
- Modify: `src/components/applications/DetailedApplicationCard.tsx`

- [ ] **Step 1: Update useManageApplication for brand/restaurant specific approval**

In `src/hooks/useManageApplication.ts`, update the mutation to set the correct approval column based on the caller's role:

```typescript
// src/hooks/useManageApplication.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ManageApplicationParams {
  applicationId: string;
  status: 'accepted' | 'rejected' | 'counter_offered';
  approvalRole?: 'brand' | 'restaurant';
}

export function useManageApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ applicationId, status, approvalRole }: ManageApplicationParams) => {
      if (approvalRole) {
        // Joint approval: set role-specific column, trigger handles final_approval_status
        const column = approvalRole === 'brand'
          ? 'brand_approval_status'
          : 'restaurant_approval_status';

        const approvalStatus = status === 'accepted' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending';

        const { error } = await supabase
          .from('campaign_applications')
          .update({ [column]: approvalStatus })
          .eq('id', applicationId);

        if (error) throw error;

        // Check if final_approval_status is now resolved
        const { data: app } = await supabase
          .from('campaign_applications')
          .select('final_approval_status, campaign_id')
          .eq('id', applicationId)
          .single();

        if (app?.final_approval_status === 'approved') {
          // Also set the legacy status column for backwards compat
          await supabase
            .from('campaign_applications')
            .update({ status: 'accepted' })
            .eq('id', applicationId);
        } else if (app?.final_approval_status === 'rejected') {
          await supabase
            .from('campaign_applications')
            .update({ status: 'rejected' })
            .eq('id', applicationId);
        }

        return app;
      } else {
        // Non-sponsored: direct status update (existing behavior)
        const { error } = await supabase
          .from('campaign_applications')
          .update({ status, restaurant_approval_status: status === 'accepted' ? 'approved' : 'rejected' })
          .eq('id', applicationId);

        if (error) throw error;
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['campaign-applications'] });
      queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
      const message = status === 'accepted'
        ? 'Application accepted. Please proceed with escrow payment to start the project.'
        : status === 'rejected'
          ? 'Application rejected.'
          : 'Counter offer sent.';
      toast.success(message);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update application');
    },
  });
}
```

- [ ] **Step 2: Create JointApprovalStatus component**

```tsx
// src/components/applications/JointApprovalStatus.tsx
import { CheckCircle, Clock, XCircle } from "lucide-react";

interface JointApprovalStatusProps {
  brandApprovalStatus: string;
  restaurantApprovalStatus: string;
  finalApprovalStatus: string;
  viewerRole: 'brand' | 'restaurant' | 'creator';
}

const statusConfig = {
  pending: { icon: Clock, label: 'Pending', className: 'text-yellow-600' },
  approved: { icon: CheckCircle, label: 'Approved', className: 'text-green-600' },
  rejected: { icon: XCircle, label: 'Rejected', className: 'text-red-600' },
};

export function JointApprovalStatus({
  brandApprovalStatus,
  restaurantApprovalStatus,
  finalApprovalStatus,
  viewerRole,
}: JointApprovalStatusProps) {
  if (viewerRole === 'creator') {
    if (finalApprovalStatus === 'approved') {
      return (
        <div className="flex items-center gap-1.5 text-green-600 text-sm">
          <CheckCircle className="h-4 w-4" />
          <span>You've been accepted! Payment is being processed.</span>
        </div>
      );
    }
    if (finalApprovalStatus === 'rejected') {
      return (
        <div className="flex items-center gap-1.5 text-red-600 text-sm">
          <XCircle className="h-4 w-4" />
          <span>Your application was not selected for this campaign.</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-yellow-600 text-sm">
        <Clock className="h-4 w-4" />
        <span>Application under review</span>
      </div>
    );
  }

  const otherRole = viewerRole === 'brand' ? 'Restaurant' : 'Brand';
  const otherStatus = viewerRole === 'brand' ? restaurantApprovalStatus : brandApprovalStatus;
  const myStatus = viewerRole === 'brand' ? brandApprovalStatus : restaurantApprovalStatus;
  const other = statusConfig[otherStatus as keyof typeof statusConfig] || statusConfig.pending;
  const OtherIcon = other.icon;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-1.5 text-sm ${other.className}`}>
        <OtherIcon className="h-4 w-4" />
        <span>{otherRole}: {other.label}</span>
      </div>
      {myStatus === 'approved' && otherStatus === 'pending' && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-700">
          Waiting on {otherRole.toLowerCase()} approval
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Integrate JointApprovalStatus into DetailedApplicationCard**

In `src/components/applications/DetailedApplicationCard.tsx`, import `JointApprovalStatus` and render it when the application has joint approval fields. The component needs to know if this is a sponsored campaign and the viewer's role. Add this check near the status display section:

```tsx
import { JointApprovalStatus } from "./JointApprovalStatus";

// Inside the component, after the status badge section:
{application.brand_approval_status && (
  <JointApprovalStatus
    brandApprovalStatus={application.brand_approval_status}
    restaurantApprovalStatus={application.restaurant_approval_status || 'pending'}
    finalApprovalStatus={application.final_approval_status || 'pending'}
    viewerRole={viewerRole}
  />
)}
```

Where `viewerRole` is determined by checking whether the current user matches the brand or restaurant profile.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useManageApplication.ts src/components/applications/JointApprovalStatus.tsx src/components/applications/DetailedApplicationCard.tsx
git commit -m "feat(joint-approval): role-specific approval with JointApprovalStatus UI

useManageApplication sets brand_approval_status or restaurant_approval_status.
Postgres trigger auto-computes final_approval_status.
JointApprovalStatus shows each party's status and waiting banners."
```

---

## Task 11: Content Reject — Edge Functions

**Files:**
- Create: `supabase/functions/reject-content/index.ts`
- Create: `supabase/functions/resolve-dispute/index.ts`

- [ ] **Step 1: Create reject-content edge function**

```typescript
// supabase/functions/reject-content/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[REJECT-CONTENT] ${step}`, details ? JSON.stringify(details) : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { collaborationId, reason } = await req.json();
    if (!collaborationId || !reason || reason.length < 20) {
      return new Response(
        JSON.stringify({ error: "collaborationId and reason (min 20 chars) required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Rejecting content", { collaborationId, userId: user.id });

    // Fetch collaboration + verify ownership
    const { data: collab, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, content_status, revision_count, creator_id, campaign_id, campaigns!inner(user_id, title)')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if ((collab as any).campaigns?.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only the campaign owner can reject content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Use state machine — validates revision_count >= 2 and correct current state
    const { error: transitionError } = await supabaseClient
      .rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'rejected',
        p_actor_id: user.id,
        p_reason: reason,
      });

    if (transitionError) {
      logStep("Transition failed", { error: transitionError.message });
      return new Response(
        JSON.stringify({ error: transitionError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create dispute record
    const { error: disputeError } = await supabaseClient
      .from('content_disputes')
      .insert({
        collaboration_id: collaborationId,
        initiated_by: user.id,
        reason,
        status: 'open',
      });

    if (disputeError) {
      logStep("Dispute creation failed", { error: disputeError.message });
    }

    // Write payment events
    await writePaymentEvent(supabaseClient, {
      event_type: 'content_rejected',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { reason },
    }, '[REJECT-CONTENT]');

    await writePaymentEvent(supabaseClient, {
      event_type: 'dispute_opened',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { reason },
    }, '[REJECT-CONTENT]');

    // Ensure conversation exists between parties
    const { data: existingConvo } = await supabaseClient
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id)
      .in('conversation_id',
        supabaseClient
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', collab.creator_id)
      );

    if (!existingConvo || existingConvo.length === 0) {
      const { data: newConvo } = await supabaseClient
        .from('conversations')
        .insert({ created_by: user.id })
        .select('id')
        .single();

      if (newConvo) {
        await supabaseClient
          .from('conversation_participants')
          .insert([
            { conversation_id: newConvo.id, user_id: user.id },
            { conversation_id: newConvo.id, user_id: collab.creator_id },
          ]);
      }
    }

    logStep("Content rejected and dispute opened");

    return new Response(
      JSON.stringify({ success: true, status: 'disputed' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

- [ ] **Step 2: Create resolve-dispute edge function**

```typescript
// supabase/functions/resolve-dispute/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { calculatePlatformFee } from "../_shared/platform-fee.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[RESOLVE-DISPUTE] ${step}`, details ? JSON.stringify(details) : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    // Admin-only: verify service_role or admin user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!isServiceRole) {
      // For future: validate admin role from user token
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    const { disputeId, outcome, notes, splitPercentage } = await req.json();
    if (!disputeId || !outcome) {
      return new Response(
        JSON.stringify({ error: "disputeId and outcome required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!['refund', 'partial_payment', 'approved'].includes(outcome)) {
      return new Response(
        JSON.stringify({ error: "outcome must be refund, partial_payment, or approved" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Resolving dispute", { disputeId, outcome });

    // Fetch dispute + collaboration + campaign
    const { data: dispute } = await supabaseClient
      .from('content_disputes')
      .select('id, collaboration_id, status')
      .eq('id', disputeId)
      .eq('status', 'open')
      .single();

    if (!dispute) {
      return new Response(
        JSON.stringify({ error: "Open dispute not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const { data: collab } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, campaign_id, creator_id, campaigns!inner(user_id, escrow_payment_intent_id, fixed_price, budget_max, pricing_type, delivery_fee)')
      .eq('id', dispute.collaboration_id)
      .single();

    if (!collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const campaign = (collab as any).campaigns;
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Resolve payment intent ID
    let paymentIntentId = campaign.escrow_payment_intent_id;
    if (paymentIntentId?.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(paymentIntentId);
      paymentIntentId = session.payment_intent as string;
    }

    // Calculate amounts
    const baseAmount = campaign.pricing_type === 'fixed' ? campaign.fixed_price : campaign.budget_max;
    const totalAmount = (baseAmount || 0) + (campaign.delivery_fee || 0);
    const totalAmountCents = Math.round(totalAmount * 100);

    // Execute outcome
    if (outcome === 'refund') {
      await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: totalAmountCents,
      });

      await supabaseClient.rpc('decrement_budget_spent', {
        p_campaign_id: collab.campaign_id,
        p_amount: baseAmount || 0,
      });

      logStep("Full refund issued", { amount: totalAmountCents });
    } else if (outcome === 'partial_payment') {
      const creatorSplit = splitPercentage ? splitPercentage / 100 : 0.5;
      const creatorAmountCents = Math.round(totalAmountCents * creatorSplit);
      const refundAmountCents = totalAmountCents - creatorAmountCents;

      // Refund restaurant's portion
      if (refundAmountCents > 0) {
        await stripe.refunds.create({
          payment_intent: paymentIntentId,
          amount: refundAmountCents,
        });
      }

      // Pay creator's portion (minus platform fee)
      const creatorAmount = creatorAmountCents / 100;
      const { netPayoutDollars } = calculatePlatformFee(creatorAmount);

      const { data: creatorProfile } = await supabaseClient
        .from('creator_profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('user_id', collab.creator_id)
        .single();

      if (creatorProfile?.stripe_account_id && creatorProfile?.stripe_onboarding_complete) {
        await stripe.transfers.create({
          amount: Math.round(netPayoutDollars * 100),
          currency: 'usd',
          destination: creatorProfile.stripe_account_id,
          metadata: { dispute_id: disputeId, type: 'dispute_partial_payment' },
        }, { idempotencyKey: `dispute_partial_${disputeId}` });
      } else {
        await supabaseClient.rpc('increment_pending_balance', {
          p_user_id: collab.creator_id,
          p_amount: netPayoutDollars,
          p_profile_type: 'creator',
        });
      }

      logStep("Partial payment", { creatorSplit, creatorAmountCents, refundAmountCents });
    } else if (outcome === 'approved') {
      // Approve content and release full payout
      const payoutResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/release-creator-payout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ collaborationId: dispute.collaboration_id }),
        }
      );
      logStep("Payout via release-creator-payout", { status: payoutResponse.status });
    }

    // Transition content_status to resolved
    await supabaseClient.rpc('transition_content_status', {
      p_collaboration_id: dispute.collaboration_id,
      p_new_status: 'resolved',
    });

    // Store dispute outcome on collaboration
    await supabaseClient
      .from('campaign_collaborations')
      .update({ dispute_outcome: outcome })
      .eq('id', dispute.collaboration_id);

    // Resolve the dispute record
    await supabaseClient
      .from('content_disputes')
      .update({
        status: 'resolved',
        outcome,
        resolved_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', disputeId);

    // Write payment event
    await writePaymentEvent(supabaseClient, {
      event_type: 'dispute_resolved',
      entity_type: 'collaboration',
      entity_id: dispute.collaboration_id,
      campaign_id: collab.campaign_id,
      actor_role: 'system',
      metadata: { dispute_id: disputeId, outcome, notes },
    }, '[RESOLVE-DISPUTE]');

    logStep("Dispute resolved", { outcome });

    return new Response(
      JSON.stringify({ success: true, outcome }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/reject-content/index.ts supabase/functions/resolve-dispute/index.ts
git commit -m "feat(disputes): add reject-content and resolve-dispute edge functions

reject-content: validates revision_count >= 2, transitions to disputed,
creates dispute record, ensures conversation exists.
resolve-dispute: admin-only, handles refund/partial/approved outcomes
with Stripe refunds and creator payouts."
```

---

## Task 12: Content Reject — UI

**Files:**
- Create: `src/components/projects/RejectContentModal.tsx`
- Create: `src/components/projects/DisputeStatusBanner.tsx`
- Create: `src/hooks/useRejectContent.ts`
- Modify: `src/components/projects/ContentApprovalPanel.tsx`
- Modify: `src/components/projects/CreatorContentSubmit.tsx`

- [ ] **Step 1: Create useRejectContent hook**

```typescript
// src/hooks/useRejectContent.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useRejectContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ collaborationId, reason }: { collaborationId: string; reason: string }) => {
      const response = await supabase.functions.invoke("reject-content", {
        body: { collaborationId, reason },
      });
      if (response.error) throw new Error(response.error.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success("Content rejected. A dispute has been opened.");
      queryClient.invalidateQueries({ queryKey: ["collaboration"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to reject content");
    },
  });
}
```

- [ ] **Step 2: Create RejectContentModal**

```tsx
// src/components/projects/RejectContentModal.tsx
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRejectContent } from "@/hooks/useRejectContent";

interface RejectContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collaborationId: string;
}

export function RejectContentModal({ open, onOpenChange, collaborationId }: RejectContentModalProps) {
  const [reason, setReason] = useState("");
  const rejectMutation = useRejectContent();

  const handleReject = () => {
    rejectMutation.mutate(
      { collaborationId, reason },
      { onSuccess: () => { onOpenChange(false); setReason(""); } }
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject Content</AlertDialogTitle>
          <AlertDialogDescription>
            This will open a dispute for mediation. Please explain why this content doesn't meet the campaign brief.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          placeholder="Explain why this content doesn't meet the brief (min 20 characters)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="min-h-[100px]"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReject}
            disabled={reason.length < 20 || rejectMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {rejectMutation.isPending ? "Rejecting..." : "Reject & Open Dispute"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 3: Create DisputeStatusBanner**

```tsx
// src/components/projects/DisputeStatusBanner.tsx
import { AlertTriangle, CheckCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DisputeStatusBannerProps {
  contentStatus: string | null;
  disputeReason: string | null;
  disputeOutcome: string | null;
  viewerRole: 'business' | 'creator';
  conversationLink?: string;
}

export function DisputeStatusBanner({
  contentStatus,
  disputeReason,
  disputeOutcome,
  viewerRole,
  conversationLink,
}: DisputeStatusBannerProps) {
  if (!['disputed', 'rejected', 'resolved'].includes(contentStatus || '')) return null;

  if (contentStatus === 'disputed') {
    return (
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 space-y-2">
        <div className="flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-semibold">Disputed — Awaiting Resolution</span>
        </div>
        {disputeReason && (
          <p className="text-sm text-yellow-700">
            <span className="font-medium">Reason: </span>{disputeReason}
          </p>
        )}
        {conversationLink && (
          <Button variant="outline" size="sm" asChild>
            <a href={conversationLink}>
              <MessageCircle className="h-4 w-4 mr-1" />
              Open Conversation
            </a>
          </Button>
        )}
      </div>
    );
  }

  if (contentStatus === 'resolved') {
    const outcomeLabels: Record<string, string> = {
      refund: 'Full refund issued to restaurant',
      partial_payment: 'Partial payment — split between both parties',
      approved: 'Content approved by mediation',
    };

    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-4">
        <div className="flex items-center gap-2 text-green-800">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">Dispute Resolved</span>
        </div>
        <p className="text-sm text-green-700 mt-1">
          {outcomeLabels[disputeOutcome || ''] || 'Resolution complete'}
        </p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 4: Integrate reject button and dispute banner into ContentApprovalPanel**

In `src/components/projects/ContentApprovalPanel.tsx`:

Import the new components:
```typescript
import { RejectContentModal } from "./RejectContentModal";
import { DisputeStatusBanner } from "./DisputeStatusBanner";
```

Add state for the reject modal:
```typescript
const [rejectModalOpen, setRejectModalOpen] = useState(false);
```

Replace the existing reject button logic. After the revision request button, add:

```tsx
{/* Show reject button only when revision_count >= 2 and content is in revision_requested state */}
{revisionCount >= 2 && contentStatus === 'revision_requested' && (
  <Button
    variant="destructive"
    className="w-full rounded-full"
    onClick={() => setRejectModalOpen(true)}
  >
    Reject Content
  </Button>
)}

<RejectContentModal
  open={rejectModalOpen}
  onOpenChange={setRejectModalOpen}
  collaborationId={collaborationId}
/>
```

Add the dispute banner at the top of the panel, passing the new props from `useCollaboration`:

```tsx
<DisputeStatusBanner
  contentStatus={contentStatus}
  disputeReason={disputeReason}
  disputeOutcome={disputeOutcome}
  viewerRole="business"
/>
```

Add `disputeReason` and `disputeOutcome` to the component's props interface:

```typescript
interface ContentApprovalPanelProps {
  // ... existing props ...
  disputeReason: string | null;
  disputeOutcome: string | null;
}
```

- [ ] **Step 5: Add dispute banner to CreatorContentSubmit**

In `src/components/projects/CreatorContentSubmit.tsx`, import and add the dispute banner:

```typescript
import { DisputeStatusBanner } from "./DisputeStatusBanner";
```

Add to props:
```typescript
interface CreatorContentSubmitProps {
  // ... existing props ...
  disputeReason: string | null;
  disputeOutcome: string | null;
}
```

Add at the top of the returned JSX:
```tsx
<DisputeStatusBanner
  contentStatus={contentStatus}
  disputeReason={disputeReason}
  disputeOutcome={disputeOutcome}
  viewerRole="creator"
/>
```

- [ ] **Step 6: Update CreatorContentSubmit to use state machine for submission**

Replace the direct `content_status` update with a call to `transition_content_status`:

```typescript
const submitContent = useMutation({
  mutationFn: async () => {
    const { error } = await supabase.rpc('transition_content_status', {
      p_collaboration_id: collaborationId,
      p_new_status: 'submitted',
    });
    if (error) throw error;

    const eventType = revisionCount > 0 ? 'content_resubmitted' : 'content_submitted';
    await supabase.rpc('insert_payment_event', {
      p_event_type: eventType,
      p_entity_type: 'collaboration',
      p_entity_id: collaborationId,
      p_campaign_id: campaignId,
      p_metadata: JSON.stringify({ revision_count: revisionCount }),
    });
  },
  // ... existing handlers ...
});
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useRejectContent.ts src/components/projects/RejectContentModal.tsx src/components/projects/DisputeStatusBanner.tsx src/components/projects/ContentApprovalPanel.tsx src/components/projects/CreatorContentSubmit.tsx
git commit -m "feat(disputes): add content rejection UI with dispute status banners

RejectContentModal requires min 20 char reason.
DisputeStatusBanner shows status for both parties.
Reject button only appears after 2 revisions.
Content submission uses transition_content_status RPC."
```

---

## Task 13: Brand Budget Enforcement — Edge Function + UI

**Files:**
- Modify: `supabase/functions/verify-campaign-escrow/index.ts`
- Create: `src/hooks/useBudgetStatus.ts`
- Create: `src/components/campaigns/BudgetProgressBar.tsx`

- [ ] **Step 1: Add budget validation to verify-campaign-escrow**

In `supabase/functions/verify-campaign-escrow/index.ts`, add budget validation after payment is verified and before the collaboration is created (around line 143). Insert this block:

```typescript
    // Budget validation for brand campaigns
    const { data: application } = await supabaseClient
      .from('campaign_applications')
      .select('proposed_rate')
      .eq('campaign_id', campaignId)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (application && campaign.per_creator_cap && application.proposed_rate > campaign.per_creator_cap) {
      logStep("Per-creator cap exceeded", {
        proposed: application.proposed_rate,
        cap: campaign.per_creator_cap,
      });
      // Refund payment
      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      }
      return new Response(
        JSON.stringify({ error: `Creator's rate ($${application.proposed_rate}) exceeds per-creator cap ($${campaign.per_creator_cap})` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const budgetMax = campaign.budget_max || campaign.fixed_price || 0;
    const budgetSpent = campaign.budget_spent || 0;
    const proposedRate = application?.proposed_rate || 0;

    if (budgetMax > 0 && budgetSpent + proposedRate > budgetMax) {
      logStep("Budget pool exceeded", {
        budgetSpent,
        proposedRate,
        budgetMax,
      });
      if (paymentIntentId) {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      }
      return new Response(
        JSON.stringify({ error: `Accepting at $${proposedRate} would exceed remaining budget ($${budgetMax - budgetSpent} remaining)` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (campaign.creator_count) {
      const { count } = await supabaseClient
        .from('campaign_collaborations')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'active');

      if ((count || 0) >= campaign.creator_count) {
        logStep("Creator count full", { current: count, max: campaign.creator_count });
        if (paymentIntentId) {
          await stripe.refunds.create({ payment_intent: paymentIntentId });
        }
        return new Response(
          JSON.stringify({ error: `Campaign already has ${campaign.creator_count} active creators` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // After collaboration creation, track budget
    if (proposedRate > 0) {
      await supabaseClient.rpc('increment_budget_spent', {
        p_campaign_id: campaignId,
        p_amount: proposedRate,
      });
    }
```

Also update the campaign select to include `per_creator_cap`, `creator_count`, `budget_spent`:

```typescript
    const { data: campaign } = await supabaseClient
      .from('campaigns')
      .select('id, user_id, escrow_status, escrow_payment_intent_id, title, status, fixed_price, budget_max, pricing_type, delivery_fee, delivery_type, per_creator_cap, creator_count, budget_spent')
      .eq('id', campaignId)
      .single();
```

- [ ] **Step 2: Create useBudgetStatus hook**

```typescript
// src/hooks/useBudgetStatus.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BudgetStatus {
  budgetMax: number;
  budgetSpent: number;
  budgetRemaining: number;
  creatorCount: number | null;
  activeCreators: number;
  perCreatorCap: number | null;
}

export function useBudgetStatus(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["budget-status", campaignId],
    queryFn: async (): Promise<BudgetStatus> => {
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .select("budget_max, fixed_price, pricing_type, budget_spent, creator_count, per_creator_cap")
        .eq("id", campaignId!)
        .single();

      if (error || !campaign) throw error || new Error("Campaign not found");

      const budgetMax = campaign.budget_max || campaign.fixed_price || 0;
      const budgetSpent = campaign.budget_spent || 0;

      const { count } = await supabase
        .from("campaign_collaborations")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId!)
        .eq("status", "active");

      return {
        budgetMax,
        budgetSpent,
        budgetRemaining: budgetMax - budgetSpent,
        creatorCount: campaign.creator_count,
        activeCreators: count || 0,
        perCreatorCap: campaign.per_creator_cap,
      };
    },
    enabled: !!campaignId,
  });
}
```

- [ ] **Step 3: Create BudgetProgressBar component**

```tsx
// src/components/campaigns/BudgetProgressBar.tsx
import { DollarSign, Users } from "lucide-react";

interface BudgetProgressBarProps {
  budgetMax: number;
  budgetSpent: number;
  creatorCount: number | null;
  activeCreators: number;
}

export function BudgetProgressBar({
  budgetMax,
  budgetSpent,
  creatorCount,
  activeCreators,
}: BudgetProgressBarProps) {
  const percentSpent = budgetMax > 0 ? Math.min(100, (budgetSpent / budgetMax) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <DollarSign className="h-4 w-4" />
          Budget
        </div>
        <span className="text-sm font-semibold">
          ${budgetSpent.toLocaleString()} of ${budgetMax.toLocaleString()} committed
        </span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percentSpent > 90 ? "bg-red-500" : percentSpent > 70 ? "bg-yellow-500" : "bg-teal-500"
          }`}
          style={{ width: `${percentSpent}%` }}
        />
      </div>

      {creatorCount && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Users className="h-4 w-4" />
          <span>{activeCreators} of {creatorCount} creators</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/verify-campaign-escrow/index.ts src/hooks/useBudgetStatus.ts src/components/campaigns/BudgetProgressBar.tsx
git commit -m "feat(budget): enforce per-creator cap and budget pool in escrow verification

verify-campaign-escrow validates rate, budget pool, and creator count.
Auto-refunds if any check fails.
Increments budget_spent on successful collaboration creation.
BudgetProgressBar shows spend progress on brand dashboard."
```

---

## Implementation Order & Dependencies

```
Task 1  (DB migration)          ─── foundation, no dependencies
  ├── Task 2  (Platform fee constant)     ─── parallel with Task 1
  ├── Task 3  (File access edge fn)       ─── depends on Task 1 (dispute_outcome column)
  ├── Task 4  (File access UI)            ─── depends on Task 3
  ├── Task 5  (Auto-approve cron)         ─── depends on Task 1 (submitted_at, review_extended)
  ├── Task 6  (Extend-review edge fn)     ─── depends on Task 1
  ├── Task 7  (Timer component + hook)    ─── depends on Task 6
  ├── Task 8  (Timer integration)         ─── depends on Task 7 + Task 1
  ├── Task 9  (Fee UI)                    ─── depends on Task 2
  ├── Task 10 (Joint approval hook + UI)  ─── depends on Task 1 (trigger)
  ├── Task 11 (Reject edge functions)     ─── depends on Task 1 (state machine + disputes table)
  ├── Task 12 (Reject UI)                 ─── depends on Task 11
  └── Task 13 (Budget enforcement)        ─── depends on Task 1 (budget_spent column + RPCs)
```

**Parallelizable groups:**
- Group A (no deps): Task 1 + Task 2
- Group B (after Task 1): Tasks 3, 5, 6, 10, 11, 13
- Group C (after Group B): Tasks 4, 7, 8, 9, 12

---

## Note: Notification Wiring

The spec defines notification triggers (content submitted, 50%/25% timer warnings, auto-approved, extension used, dispute opened, etc.). The codebase already has `src/hooks/useEmailNotifications.ts` with a `sendNotification()` utility that calls the `send-notification-email` edge function. 

After the core tasks above are complete, add `sendNotification()` calls in:
- `reject-content` edge function → notify creator of rejection
- `extend-review` edge function → notify creator of extended deadline
- `resolve-dispute` edge function → notify both parties of outcome
- `useManageApplication` (joint approval) → notify other party when one approves
- Auto-approval timer notifications (50%/25% warnings) require a separate notification cron — not covered in this plan, add as a follow-up task

New notification types to add to `NotificationType` in `useEmailNotifications.ts`: `'content_rejected'`, `'dispute_opened'`, `'dispute_resolved'`, `'review_extended'`, `'content_auto_approved'`.

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] State machine rejects invalid transitions (test with SQL queries)
- [ ] Content can be rejected only after 2 revisions
- [ ] Dispute is auto-created on rejection
- [ ] Auto-approval uses `submitted_at` + extension hours
- [ ] Countdown timer displays and updates in real-time
- [ ] Extension button works once and disables
- [ ] 5% fee visible on finalize step, earnings page, and timeline
- [ ] Joint approval requires both brand + restaurant for sponsored campaigns
- [ ] Budget validation blocks over-budget acceptances and refunds payment
- [ ] File preview returns 15min URLs for unapproved, 1h for approved
- [ ] Business cannot download unapproved content
- [ ] Run `npm run dev` and test the full flow in browser
