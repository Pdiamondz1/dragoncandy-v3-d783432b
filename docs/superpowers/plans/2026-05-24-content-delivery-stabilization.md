# Content Delivery System Stabilization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 14 bugs across the content delivery pipeline (escrow, payout, upload, auto-approve, UI) so the system is production-safe before switching Stripe to live mode.

**Architecture:** Three severity passes with build/typecheck gates between each. Pass 1 fixes critical financial bugs (pricing desync, no rollback, audit crash, role misclassification, missing profile crash). Pass 2 fixes operational issues (escrow filter, race condition, hardcoded origin, session ID confusion, orphaned thumbnails, email silence, localStorage staleness). Pass 3 hardens defensively (customerId init, delivery fee type safety).

**Tech Stack:** Deno edge functions (Supabase), React 18 + TypeScript (strict), Supabase JS v2, Stripe Connect, Tailwind/shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-24-content-delivery-stabilization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/_shared/pricing-utils.ts` | Create | Shared pricing resolution: counter-offer → fixed_price → budget_max |
| `supabase/functions/release-creator-payout/index.ts` | Modify | Use shared pricing, two-phase commit, non-blocking audit, maybeSingle |
| `supabase/functions/create-campaign-escrow/index.ts` | Modify | Use shared pricing, fix origin fallback, session ID handling, customerId, delivery fee |
| `supabase/functions/auto-approve-content/index.ts` | Modify | Add escrow status filter, race condition guard |
| `supabase/functions/verify-campaign-escrow/index.ts` | Modify | Populate `escrow_checkout_session_id` after payment |
| `src/hooks/useProjectFileUpload.ts` | Modify | Move profile query before upload, track all artifacts for cleanup |
| `src/components/campaigns/detail/ContentReviewSection.tsx` | Modify | Email warning toast, localStorage timestamp + cleanup |
| Migration SQL (new) | Create | Add `'releasing'` to escrow_status CHECK, add `escrow_checkout_session_id` column |

---

## Pass 1: Critical & High Severity (5 Fixes)

### Task 1: Create shared pricing resolution utility

**Spec ref:** Fix 1.1  
**Files:**
- Create: `supabase/functions/_shared/pricing-utils.ts`

- [ ] **Step 1: Create `pricing-utils.ts`**

This utility resolves the correct payout amount by checking counter-offers first, then falling back to campaign pricing. Both `create-campaign-escrow` and `release-creator-payout` will call it.

```typescript
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface PricingResult {
  amount: number;
  source: 'counter_offer' | 'application_rate' | 'fixed_price' | 'budget_max';
}

/**
 * Resolve the authoritative payout amount for a campaign collaboration.
 * Priority: accepted counter-offer → accepted application rate → campaign fixed_price → campaign budget_max.
 */
export async function resolvePayoutAmount(
  supabaseClient: SupabaseClient,
  campaignId: string,
): Promise<PricingResult | null> {
  // Find the accepted application for this campaign
  const appQuery = supabaseClient
    .from('campaign_applications')
    .select('id, proposed_rate')
    .eq('campaign_id', campaignId)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle();

  const { data: acceptedApp } = await appQuery;

  if (acceptedApp) {
    // Check for an accepted counter-offer on this application
    const { data: acceptedOffer } = await supabaseClient
      .from('application_counter_offers')
      .select('proposed_rate')
      .eq('application_id', acceptedApp.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (acceptedOffer?.proposed_rate && acceptedOffer.proposed_rate > 0) {
      return { amount: acceptedOffer.proposed_rate, source: 'counter_offer' };
    }

    if (acceptedApp.proposed_rate && acceptedApp.proposed_rate > 0) {
      return { amount: acceptedApp.proposed_rate, source: 'application_rate' };
    }
  }

  // Fall back to campaign-level pricing
  const { data: campaign } = await supabaseClient
    .from('campaigns')
    .select('fixed_price, budget_max, pricing_type')
    .eq('id', campaignId)
    .single();

  if (!campaign) return null;

  if (campaign.pricing_type === 'fixed' && campaign.fixed_price && campaign.fixed_price > 0) {
    return { amount: campaign.fixed_price, source: 'fixed_price' };
  }

  if (campaign.budget_max && campaign.budget_max > 0) {
    return { amount: campaign.budget_max, source: 'budget_max' };
  }

  return null;
}
```

- [ ] **Step 2: Verify the file is valid**

Run: `npx deno check supabase/functions/_shared/pricing-utils.ts` (or just confirm syntax is correct — Deno edge functions are checked at deploy time).

Since we can't easily type-check a standalone Deno file locally, verify no syntax errors by reading the file.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/pricing-utils.ts
git commit -m "feat: add shared pricing resolution utility for escrow/payout consistency"
```

---

### Task 2: Wire `release-creator-payout` to shared pricing + two-phase commit + non-blocking audit + maybeSingle

**Spec ref:** Fixes 1.1, 1.2, 1.3, 1.5  
**Files:**
- Modify: `supabase/functions/release-creator-payout/index.ts`

This is the largest single task. Four fixes applied to one file, in this order:
1. Import and use `resolvePayoutAmount` instead of inline pricing logic (Fix 1.1)
2. Use `.maybeSingle()` for creator profile and handle missing Stripe account gracefully (Fix 1.5)
3. Wrap all `writePaymentEvent` calls in try/catch (Fix 1.3)
4. Add two-phase commit: `'releasing'` intermediate state before Stripe transfer (Fix 1.2)

- [ ] **Step 1: Add import for shared pricing utility**

At the top of `release-creator-payout/index.ts`, add after existing imports:

```typescript
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
```

- [ ] **Step 2: Replace inline pricing logic with `resolvePayoutAmount`**

Replace lines 98–109 (the `payoutAmount` calculation block):

**Old code (lines 98-109):**
```typescript
    // Calculate payout amount
    let payoutAmount = 0;
    if (campaign.pricing_type === 'fixed' && campaign.fixed_price) {
      payoutAmount = campaign.fixed_price;
    } else if (campaign.budget_max) {
      // For bid range, use the accepted bid amount or budget_max
      payoutAmount = campaign.budget_max;
    }

    // Add delivery fee if applicable (goes to creator)
    const deliveryFee = campaign.delivery_fee || 0;
    payoutAmount += deliveryFee;
```

**New code:**
```typescript
    // Resolve pricing from negotiated agreement (counter-offer → application → campaign)
    const pricing = await resolvePayoutAmount(supabaseClient, campaign.id);
    if (!pricing) {
      throw new Error('Cannot determine payout amount: no pricing found for campaign');
    }
    logStep("Pricing resolved", { amount: pricing.amount, source: pricing.source });

    const deliveryFee = Number(campaign.delivery_fee) || 0;
    const payoutAmount = pricing.amount + deliveryFee;
```

- [ ] **Step 3: Change `.single()` to `.maybeSingle()` for creator profile query**

Replace lines 81–89:

**Old code:**
```typescript
    const { data: creatorProfile, error: creatorError } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', collaboration.creator_id)
      .single();

    if (creatorError) {
      throw new Error(`Failed to fetch creator profile: ${creatorError.message}`);
    }
```

**New code:**
```typescript
    const { data: creatorProfile } = await supabaseClient
      .from('creator_profiles')
      .select('stripe_account_id, stripe_onboarding_complete, pending_balance')
      .eq('user_id', collaboration.creator_id)
      .maybeSingle();
```

This allows the function to continue even if the creator profile is missing — it will fall through to the pending balance path at line 126's `if` check (`creatorProfile?.stripe_account_id && ...`).

- [ ] **Step 4: Wrap all `writePaymentEvent` calls in non-blocking try/catch**

There are 6 `writePaymentEvent` calls in this file. Wrap each one. Example pattern:

```typescript
    try {
      await writePaymentEvent(supabaseClient, {
        event_type: 'content_approved',
        // ... existing fields ...
      }, '[RELEASE-CREATOR-PAYOUT]');
    } catch (auditErr) {
      console.error('Payment event logging failed (non-blocking):', auditErr);
    }
```

Apply this wrapper to all 6 calls:
- Line 128 (`content_approved` — Stripe path)
- Line 137 (`payment_release_initiated`)
- Line 162 (`payment_released`)
- Line 173 (`transfer_created`)
- Line 230 (`content_approved` — pending balance path)
- Line 239 (`payout_pending_wallet`)

- [ ] **Step 5: Add two-phase commit for Stripe transfer**

Restructure the Stripe transfer block (lines 126–216) to use a three-phase approach:

**Phase 1 — Before Stripe transfer, set escrow to `'releasing'`:**
```typescript
      // Phase 1: Mark escrow as releasing (before moving money)
      const { error: preCommitError } = await supabaseClient
        .from('campaigns')
        .update({ escrow_status: 'releasing' })
        .eq('id', campaign.id)
        .eq('escrow_status', 'held');

      if (preCommitError) {
        throw new Error(`Failed to set releasing state: ${preCommitError.message}`);
      }
```

**Phase 2 — Stripe transfer (existing code), with rollback on failure:**
After the `stripe.transfers.create()` call, add error handling:
```typescript
      let transfer;
      try {
        transfer = await stripe.transfers.create({
          // ... existing transfer params ...
        }, { idempotencyKey: `payout_${collaborationId}` });
      } catch (stripeErr) {
        // Rollback: revert escrow to held
        await supabaseClient
          .from('campaigns')
          .update({ escrow_status: 'held' })
          .eq('id', campaign.id);
        throw stripeErr;
      }
```

**Phase 3 — Finalize DB state:**
The existing DB updates (lines 185–206) become Phase 3. Add critical error logging if this phase fails (money already moved):

```typescript
      // Phase 3: Finalize DB state
      const { error: collabUpdateError } = await supabaseClient
        .from('campaign_collaborations')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          content_status: 'approved',
        })
        .eq('id', collaborationId);

      if (collabUpdateError) {
        console.error('CRITICAL: Transfer succeeded but collaboration update failed. Manual reconciliation needed.', {
          collaborationId, transferId: transfer.id, error: collabUpdateError.message
        });
      }

      const { error: campaignUpdateError } = await supabaseClient
        .from('campaigns')
        .update({ escrow_status: 'released' })
        .eq('id', campaign.id);

      if (campaignUpdateError) {
        console.error('CRITICAL: Transfer succeeded but campaign escrow update failed. Manual reconciliation needed.', {
          campaignId: campaign.id, transferId: transfer.id, error: campaignUpdateError.message
        });
      }
```

Note: Phase 3 failures log critical errors but do NOT throw — the money has already moved, and the `'releasing'` intermediate state makes the inconsistency visible for manual reconciliation.

- [ ] **Step 6: Run build**

Run: `npm run build && npm run typecheck`
Expected: Both pass. Edge functions aren't checked by Vite/tsc, but the build verifies no frontend regressions.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/release-creator-payout/index.ts
git commit -m "fix: release-creator-payout — shared pricing, two-phase commit, non-blocking audit, maybeSingle"
```

---

### Task 3: Wire `create-campaign-escrow` to shared pricing utility

**Spec ref:** Fix 1.1 (second half)  
**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

The escrow function already has correct pricing logic (lines 70–104). Replace the inline logic with the shared utility to guarantee both functions use identical resolution.

- [ ] **Step 1: Add import**

Add after existing imports:
```typescript
import { resolvePayoutAmount } from "../_shared/pricing-utils.ts";
```

- [ ] **Step 2: Replace inline pricing logic**

Replace lines 69–104 (from `// Derive pricing` through the `if (!amount || amount <= 0)` error response):

**New code:**
```typescript
    // Resolve pricing from the shared utility (same logic payout will use)
    const pricing = await resolvePayoutAmount(supabaseClient, campaignId);
    let amount = pricing?.amount ?? null;

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Campaign has no valid budget set' }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    logStep("Pricing resolved", { amount, source: pricing!.source });
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts
git commit -m "fix: create-campaign-escrow — use shared pricing utility"
```

---

### Task 4: Fix uploader role misclassification in `useProjectFileUpload.ts`

**Spec ref:** Fix 1.4  
**Files:**
- Modify: `src/hooks/useProjectFileUpload.ts`

The profile query (lines 157–163) runs after upload succeeds and is inside a try/catch that swallows errors. If it fails due to RLS, `uploaderRole` defaults to `'restaurant'`. Move it before the upload loop so a failure stops the upload early.

- [ ] **Step 1: Move profile query before the upload loop**

After the session check (line 47: `throw new Error('Authentication required...')`), and before `const uploadedFiles = [];` (line 48), insert:

```typescript
      // Determine uploader role BEFORE uploading — fail early if profile unreadable
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        throw new Error('Could not determine your account role. Please refresh and try again.');
      }
      const uploaderRole = profile.role === 'content_creator' ? 'creator' : 'restaurant';
```

- [ ] **Step 2: Remove the old profile query block**

Remove the post-upload profile query (lines 156–173). Replace the notification call to use the pre-fetched `uploaderRole`:

**Old code (lines 156-173):**
```typescript
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        const uploaderRole = profile?.role === 'content_creator' ? 'creator' : 'restaurant';

        await notifyFileUpload(
          campaignId,
          campaignTitle,
          uploadedFiles.length,
          uploaderRole
        );
      } catch (error) {
        console.error('Failed to send file upload notification:', error);
      }
```

**New code:**
```typescript
      try {
        await notifyFileUpload(
          campaignId,
          campaignTitle,
          uploadedFiles.length,
          uploaderRole
        );
      } catch (error) {
        console.error('Failed to send file upload notification:', error);
      }
```

- [ ] **Step 3: Run build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useProjectFileUpload.ts
git commit -m "fix: useProjectFileUpload — move profile query before upload to prevent role misclassification"
```

---

### Task 5: Create migration for `'releasing'` escrow status

**Spec ref:** Fix 1.2 (migration)  
**Files:**
- Create: `supabase/migrations/20260524000001_add_releasing_escrow_status.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Add 'releasing' intermediate state to escrow_status CHECK constraint.
-- This state signals "Stripe transfer in progress" for the two-phase commit
-- pattern in release-creator-payout.

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
  WHERE conrelid = 'campaigns'::regclass
    AND conname LIKE '%escrow_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaigns DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE campaigns ADD CONSTRAINT campaigns_escrow_status_check
  CHECK (escrow_status IN ('none', 'pending', 'held', 'releasing', 'released', 'refunded'));
```

- [ ] **Step 2: Apply migration**

Use the Supabase MCP tool `apply_migration` to apply this to the remote database, or note it for manual application.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260524000001_add_releasing_escrow_status.sql
git commit -m "migration: add 'releasing' to escrow_status CHECK constraint"
```

---

### Task 6: Pass 1 gate — build + typecheck

- [ ] **Step 1: Run full build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass with zero errors.

- [ ] **Step 2: Verify no regressions**

Quick sanity check: `npm run dev` starts without errors. (Don't need to test features yet — that's the verification plan.)

---

## Pass 2: Medium Severity (7 Fixes)

### Task 7: Add escrow status filter to `auto-approve-content`

**Spec ref:** Fix 2.1  
**Files:**
- Modify: `supabase/functions/auto-approve-content/index.ts`

- [ ] **Step 1: Add escrow status check inside the processing loop**

After line 65 (`if (!campaign) continue;`), add:

```typescript
      if (campaign.escrow_status !== 'held') {
        logStep('Skipping — escrow not held', {
          collaborationId: collab.id,
          escrowStatus: campaign.escrow_status,
        });
        continue;
      }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/auto-approve-content/index.ts
git commit -m "fix: auto-approve-content — skip collaborations without held escrow"
```

---

### Task 8: Add race condition guard to `auto-approve-content`

**Spec ref:** Fix 2.2  
**Files:**
- Modify: `supabase/functions/auto-approve-content/index.ts`

- [ ] **Step 1: Re-read content_status after transition and skip payout if manually approved**

After the `transition_content_status` RPC call succeeds (after line 108), add:

```typescript
      // Guard: if a business manually approved between fetch and transition,
      // content_status will be 'approved' (not 'auto_approved'). Skip payout —
      // the manual approval path already handled it.
      const { data: postTransition } = await supabaseClient
        .from('campaign_collaborations')
        .select('content_status')
        .eq('id', collab.id)
        .single();

      if (postTransition?.content_status === 'approved') {
        logStep('Skipping payout — manually approved during transition', { collaborationId: collab.id });
        continue;
      }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/auto-approve-content/index.ts
git commit -m "fix: auto-approve-content — guard against race condition with manual approval"
```

---

### Task 9: Fix hardcoded Lovable origin fallback in `create-campaign-escrow`

**Spec ref:** Fix 2.3  
**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

- [ ] **Step 1: Replace line 138**

**Old code (line 138):**
```typescript
    const origin = req.headers.get("origin") || "https://dragoncandy-v3.lovable.app";
```

**New code:**
```typescript
    const origin = req.headers.get("origin")
      || Deno.env.get("PUBLIC_SITE_URL")
      || "https://dragoncandy.io";
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts
git commit -m "fix: create-campaign-escrow — replace hardcoded Lovable origin with dragoncandy.io"
```

---

### Task 10: Fix session ID stored as payment intent ID + add `escrow_checkout_session_id`

**Spec ref:** Fix 2.4  
**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`
- Modify: `supabase/functions/verify-campaign-escrow/index.ts`
- Create: `supabase/migrations/20260524000002_add_escrow_checkout_session_id.sql`

- [ ] **Step 1: Create migration for new column**

```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS escrow_checkout_session_id TEXT;
```

- [ ] **Step 2: Update `create-campaign-escrow` to store both IDs**

Replace lines 193–199 (the `update` call):

**Old code:**
```typescript
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ 
        escrow_status: 'pending',
        escrow_payment_intent_id: session.id, // Store session ID for now
      })
      .eq('id', campaignId);
```

**New code:**
```typescript
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id;

    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ 
        escrow_status: 'pending',
        escrow_payment_intent_id: paymentIntentId || session.id,
        escrow_checkout_session_id: session.id,
      })
      .eq('id', campaignId);
```

- [ ] **Step 3: Update `verify-campaign-escrow` to also populate `escrow_checkout_session_id`**

In `verify-campaign-escrow/index.ts`, update line 123 (the update after payment verified):

**Old code:**
```typescript
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update({ escrow_status: 'held', status: 'published', escrow_payment_intent_id: actualPaymentIntentId })
      .eq('id', campaignId);
```

**New code:**
```typescript
    const updateFields: Record<string, unknown> = {
      escrow_status: 'held',
      status: 'published',
      escrow_payment_intent_id: actualPaymentIntentId,
    };
    // Preserve the checkout session ID if we used it to verify
    if (sessionId) {
      updateFields.escrow_checkout_session_id = sessionId;
    }
    const { error: updateError } = await supabaseClient
      .from('campaigns')
      .update(updateFields)
      .eq('id', campaignId);
```

- [ ] **Step 4: Apply migration**

Use the Supabase MCP tool or note for manual application.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260524000002_add_escrow_checkout_session_id.sql supabase/functions/create-campaign-escrow/index.ts supabase/functions/verify-campaign-escrow/index.ts
git commit -m "fix: store checkout session ID separately from payment intent ID"
```

---

### Task 11: Track all uploaded artifacts for cleanup in `useProjectFileUpload.ts`

**Spec ref:** Fix 2.5  
**Files:**
- Modify: `src/hooks/useProjectFileUpload.ts`

- [ ] **Step 1: Add `uploadedPaths` tracker before the file loop**

After the `uploaderRole` block (added in Task 4) and before `const uploadedFiles = [];`, add:

```typescript
      const uploadedPaths: string[] = [];
```

- [ ] **Step 2: Track paths after each storage upload**

After the main file upload succeeds (after line 91, `if (uploadError)` block), add:
```typescript
        uploadedPaths.push(uploadData.path);
```

After the thumbnail upload succeeds (after `if (!thumbErr) thumbnailPath = thumbPath;`), add:
```typescript
          if (!thumbErr) {
            thumbnailPath = thumbPath;
            uploadedPaths.push(thumbPath);
          }
```
(This replaces the existing `if (!thumbErr) thumbnailPath = thumbPath;` line.)

- [ ] **Step 3: Update the catch block cleanup to use `uploadedPaths`**

In the DB error catch block (lines 136-148), replace the cleanup logic:

**Old code (lines 139-145):**
```typescript
          const pathsToRemove = [uploadData.path];
          if (thumbnailPath) pathsToRemove.push(thumbnailPath);
          try {
            await supabase.storage.from('campaign-deliverables').remove(pathsToRemove);
          } catch (cleanupError) {
            console.error('Failed to cleanup storage files:', cleanupError);
          }
```

**New code:**
```typescript
          try {
            if (uploadedPaths.length > 0) {
              await supabase.storage.from('campaign-deliverables').remove(uploadedPaths);
            }
          } catch (cleanupError) {
            console.error('Failed to cleanup storage files:', cleanupError);
          }
```

- [ ] **Step 4: Run build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProjectFileUpload.ts
git commit -m "fix: useProjectFileUpload — clean up all uploaded artifacts (including thumbnails) on failure"
```

---

### Task 12: Surface email notification failures as toast warning in `ContentReviewSection.tsx`

**Spec ref:** Fix 2.6  
**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`

- [ ] **Step 1: Replace the silent email catch with a warning toast**

In the `approveContent` mutation's `onSuccess` handler, replace lines 87–103:

**Old code:**
```typescript
      try {
        const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
        const creatorProfile = await fetchRecipientEmail(creatorId);

        if (creatorProfile?.email) {
          await supabase.functions.invoke('send-notification-email', {
            body: {
              to: creatorProfile.email,
              recipientName: creatorProfile.full_name,
              type: 'content_approved',
              data: { campaignId, creatorName: creatorName },
            },
          });
        }
      } catch (e) {
        console.error('Failed to send content approval email:', e);
      }
```

**New code:**
```typescript
      try {
        const { fetchRecipientEmail } = await import('@/lib/recipientEmail');
        const creatorProfile = await fetchRecipientEmail(creatorId);

        if (creatorProfile?.email) {
          const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
            body: {
              to: creatorProfile.email,
              recipientName: creatorProfile.full_name,
              type: 'content_approved',
              data: { campaignId, creatorName: creatorName },
            },
          });
          if (emailError) {
            toast({ variant: 'default', title: 'Content approved', description: 'Email notification to creator failed. They may not be notified immediately.' });
          }
        }
      } catch (e) {
        console.error('Failed to send content approval email:', e);
        toast({ variant: 'default', title: 'Content approved', description: 'Email notification to creator failed. They may not be notified immediately.' });
      }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "fix: ContentReviewSection — surface email notification failures as toast warning"
```

---

### Task 13: Fix localStorage auto-approve state staleness in `ContentReviewSection.tsx`

**Spec ref:** Fix 2.7  
**Files:**
- Modify: `src/components/campaigns/detail/ContentReviewSection.tsx`

- [ ] **Step 1: Add timestamp to localStorage write**

In `handlePayAndApprove` (line 135), update the localStorage write to include a timestamp:

**Old code (line 135):**
```typescript
    localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId }));
```

**New code:**
```typescript
    localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId, timestamp: Date.now() }));
```

- [ ] **Step 2: Move localStorage write to after checkout URL is confirmed**

Move the `localStorage.setItem` call to inside the `if (data?.url && checkoutWindow)` block (line 148). The current location (line 135) sets it before the escrow call even returns.

Restructure `handlePayAndApprove`:

```typescript
  const handlePayAndApprove = async () => {
    setIsPayingEscrow(true);
    const checkoutWindow = window.open('about:blank', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: { campaignId },
      });
      if (error) throw error;
      if (data?.alreadyPaid) {
        checkoutWindow?.close();
        approveContent.mutate();
        return;
      }
      if (data?.url && checkoutWindow) {
        localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId, timestamp: Date.now() }));
        checkoutWindow.location.href = data.url;
        toast({ title: 'Complete Payment', description: 'Finish payment in the new tab. Content will be auto-approved.' });
      } else if (data?.url) {
        checkoutWindow?.close();
        localStorage.setItem('autoApproveAfterPayment', JSON.stringify({ collaborationId, campaignId, timestamp: Date.now() }));
        toast({
          title: 'Popup Blocked',
          description: 'Click below to open payment.',
          action: (
            <a href={data.url} target="_blank" rel="noopener noreferrer" className="text-dc-teal underline text-sm">
              Open Payment
            </a>
          ),
        });
      }
    } catch {
      checkoutWindow?.close();
      localStorage.removeItem('autoApproveAfterPayment');
      toast({ variant: 'destructive', title: 'Payment Setup Failed', description: 'Could not initiate payment. Try again.' });
    } finally {
      setIsPayingEscrow(false);
    }
  };
```

- [ ] **Step 3: Add useEffect cleanup for stale localStorage flags**

Add a `useEffect` inside the component (after the existing state declarations, around line 67):

```typescript
  // Clean up stale autoApproveAfterPayment flags (older than 1 hour)
  React.useEffect(() => {
    const stored = localStorage.getItem('autoApproveAfterPayment');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const timestamp = parsed.timestamp;
        if (!timestamp || Date.now() - timestamp > 3600000) {
          localStorage.removeItem('autoApproveAfterPayment');
        }
      } catch {
        localStorage.removeItem('autoApproveAfterPayment');
      }
    }
  }, []);
```

- [ ] **Step 4: Run build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/detail/ContentReviewSection.tsx
git commit -m "fix: ContentReviewSection — add timestamp to localStorage flag, clean up stale entries"
```

---

### Task 14: Pass 2 gate — build + typecheck

- [ ] **Step 1: Run full build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass with zero errors.

---

## Pass 3: Low/Defensive (2 Fixes)

### Task 15: Fix uninitialized `customerId` in `create-campaign-escrow`

**Spec ref:** Fix 3.1  
**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

- [ ] **Step 1: Replace lines 127-131**

**Old code:**
```typescript
    let customerId;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }
```

**New code:**
```typescript
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;
    if (customerId) {
      logStep("Found existing customer", { customerId });
    }
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts
git commit -m "fix: create-campaign-escrow — explicit customerId initialization"
```

---

### Task 16: Fix delivery fee type safety in `create-campaign-escrow`

**Spec ref:** Fix 3.2  
**Files:**
- Modify: `supabase/functions/create-campaign-escrow/index.ts`

- [ ] **Step 1: Replace line 105**

**Old code:**
```typescript
    const deliveryFee = campaign.delivery_fee || 0;
```

**New code:**
```typescript
    const deliveryFee = Number(campaign.delivery_fee) || 0;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/create-campaign-escrow/index.ts
git commit -m "fix: create-campaign-escrow — explicit Number() coercion for delivery fee"
```

---

### Task 17: Pass 3 gate — final build + typecheck

- [ ] **Step 1: Run full build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: Both pass with zero errors.

- [ ] **Step 2: Deploy edge functions**

Deploy all modified edge functions to Supabase:
```bash
supabase functions deploy release-creator-payout
supabase functions deploy create-campaign-escrow
supabase functions deploy auto-approve-content
supabase functions deploy verify-campaign-escrow
```

Or deploy via the Supabase MCP tool.

---

## Verification Checklist

After all three passes are complete and deployed:

### Pass 1 Verification
- [ ] Create test campaign with counter-offer → verify escrow amount matches negotiated rate
- [ ] Approve content → verify payout amount matches escrow amount (pricing consistency)
- [ ] Simulate creator with no Stripe account → verify pending balance fallback (no crash)
- [ ] Disconnect `payment_events` table (if possible) → verify payout still completes

### Pass 2 Verification
- [ ] Auto-approve cron skips campaigns without `held` escrow status
- [ ] Stripe checkout returns to `dragoncandy.io` (not Lovable URL)
- [ ] Upload a video, force-fail the DB insert → verify thumbnail gets cleaned up
- [ ] Trigger content approval with email service offline → verify warning toast appears
- [ ] Check localStorage cleanup: set a stale flag, reload page, verify it's removed

### Pass 3 Verification
- [ ] Escrow creation with no existing Stripe customer works correctly
- [ ] Delivery fee of string `"50.00"` is handled correctly

---

## Summary

| Pass | Tasks | Fixes | Risk if skipped |
|------|-------|-------|-----------------|
| 1 | 1–6 | 1.1, 1.2, 1.3, 1.4, 1.5 | Wrong payout amounts, lost money, silent failures |
| 2 | 7–14 | 2.1–2.7 | Wasted function calls, wrong redirects, orphaned files, confused users |
| 3 | 15–17 | 3.1, 3.2 | Edge-case type errors in production |

Total: 17 tasks, 14 fixes, 8 files modified/created, 2 migrations.
