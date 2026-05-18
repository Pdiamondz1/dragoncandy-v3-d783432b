# Fix Content Delivery System Visibility

## Context

All 10 steps of the Content Delivery & Social Posting System spec were coded (11 commits, 13 files, 2 new components). But existing campaigns show zero changes because **collaboration records don't exist** for them — and every new UI feature gates on `campaign_collaborations`.

Root cause: `useManageApplication.ts` (lines 76-84) only creates a `campaign_collaborations` record when `campaign.escrow_status === 'held'`. If a business accepts an application before paying escrow (common flow), the application gets `status='accepted'` but **no collaboration record is created**. The Stripe webhook then sets `escrow_status='held'` but also doesn't create a collaboration. Result: accepted applications with no collaboration → creator stuck in "applied" phase → business stuck in "pre_hire" phase → all content delivery UI invisible.

Secondary problem: messaging page (`CampaignMessagesPage.tsx`) has zero navigation to campaign detail pages where content delivery UI lives.

---

## Phase 1: Unblock Collaboration Creation (Worktree Session 1)

**Branch**: `fix/collaboration-creation-gap`

Goal: every accepted application gets a collaboration record, past and future. This unblocks ALL existing content delivery UI.

### 1A. Remove escrow guard from `useManageApplication.ts`
**File**: `src/hooks/useManageApplication.ts`

Remove `if (campaign?.escrow_status === 'held')` guard around collaboration creation (lines 76-84). Always create collaboration on accept.

- Keep idempotency check (existing collab query)
- Keep insert logic  
- Only set `campaign.status = 'active'` when escrow IS held
- Content delivery UI already handles escrow-not-held (ApplicationCard shows "Pay Escrow", DeliverableCard disables uploads)

### 1B. Add `application_id` + idempotency to donny-chat
**File**: `supabase/functions/donny-chat/index.ts` (around line 881)

- Add `application_id: data.id` to collaboration insert
- Add idempotency check before insert (match pattern from `verify-campaign-escrow`)

### 1C. Create backfill migration (local file only)
**New file**: `supabase/migrations/20260515000000_backfill_missing_collaborations.sql`

```sql
INSERT INTO campaign_collaborations (campaign_id, creator_id, application_id, status)
SELECT ca.campaign_id, ca.creator_id, ca.id, 'active'
FROM campaign_applications ca
WHERE ca.status = 'accepted'
AND NOT EXISTS (
  SELECT 1 FROM campaign_collaborations cc
  WHERE cc.campaign_id = ca.campaign_id AND cc.creator_id = ca.creator_id
);
```

### Phase 1 Verification
- `npm run build` passes
- `npm run typecheck` clean
- Accept an application via UI without escrow → collaboration record created
- After applying migration: existing campaigns show ActivePhaseView / active_delivery phase

---

## Phase 2: Bridge Messaging → Content Delivery (Worktree Session 2)

**Branch**: `feat/messaging-content-delivery-nav`

Goal: users can navigate from messaging threads to content delivery UI, and see delivery status inline.

### 2A. Add content delivery context bar to messaging page
**File**: `src/pages/CampaignMessagesPage.tsx`

Add between page header and message thread:
- Query `campaign_collaborations` for this campaign + current user
- Compact bar: content status badge (colored pill) + "View Campaign Details" button
- Navigate by role:
  - Creator → `/dashboard/creator/my-campaigns/${campaignId}`
  - Business → `/dashboard/business/campaigns/${campaignId}`
- Only show when collaboration exists
- Style: `bg-white border-2 border-dc-teal rounded-2xl p-3`, flex row
- Status badge colors: pending=gray-warm, in_progress=dc-teal/10, submitted=dc-pink/10, approved=green, revision_requested=amber

### Phase 2 Verification
- `npm run build` passes
- Messaging page shows status bar with "View Campaign Details" button
- Button navigates to correct page per role
- Mobile viewport (375px): bar stacks vertically, button full-width

---

## Phase 3: Close Webhook Race Condition (Worktree Session 3)

**Branch**: `fix/stripe-webhook-collaboration`

Goal: belt-and-suspenders — Stripe webhook creates collaboration if accept happened before payment.

### 3A. Add collaboration creation to Stripe webhook
**File**: `supabase/functions/stripe-webhook/index.ts` (after line 111)

After setting `escrow_status='held'`:
- Query accepted applications without collaborations for this campaign
- Create collaboration record if missing
- Same idempotency pattern as other paths

### Phase 3 Verification
- Edge function deploys cleanly
- Stripe webhook test: `checkout.session.completed` → collaboration created for accepted app

---

## Key Files (all phases)

| File | Phase | Change |
|------|-------|--------|
| `src/hooks/useManageApplication.ts` | 1 | Remove escrow guard |
| `supabase/functions/donny-chat/index.ts` | 1 | Add application_id + idempotency |
| `supabase/migrations/20260515000000_backfill_missing_collaborations.sql` | 1 | New file, local only |
| `src/pages/CampaignMessagesPage.tsx` | 2 | Add content delivery nav bar |
| `supabase/functions/stripe-webhook/index.ts` | 3 | Add collaboration creation |

## What This Deletes
- Escrow guard that silently swallowed collaboration creation

## What This Simplifies
- Single rule: accept = collaboration, always

## Keystroke Reduction
- Messaging → campaign details: 1 tap (currently impossible)
