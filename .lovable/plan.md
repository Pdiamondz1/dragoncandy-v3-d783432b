

# Add Counter-Offer / Bidding System to Campaign Applications

## Problem

Currently, when a creator applies to a campaign, the restaurant/brand can only **Accept** or **Reject**. There is no way to negotiate -- if the proposed rate or timeline doesn't match, the only option is rejection. This loses potential deals that could have been saved through negotiation.

## Solution Overview

Add a **Counter-Offer** flow where restaurants/brands can propose different terms (rate, timeline, message) instead of outright rejecting. Creators can then accept, reject, or counter back. This creates a back-and-forth negotiation until both parties agree.

## How It Works

1. Creator applies with a proposed rate/timeline
2. Restaurant/Brand reviews and can: **Accept**, **Reject**, or **Counter-Offer**
3. If counter-offered, the creator sees the new terms and can: **Accept**, **Decline**, or **Counter** back
4. The negotiation continues until one side accepts or declines
5. On acceptance, the collaboration is created as normal

## Database Changes

### New table: `application_counter_offers`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| application_id | uuid (FK) | Links to campaign_applications |
| sender_id | uuid | The user making the counter-offer |
| sender_role | text | 'business' or 'creator' |
| proposed_rate | numeric | Counter-offered rate |
| proposed_timeline | text | Counter-offered timeline |
| message | text | Explanation/negotiation message |
| status | text | 'pending', 'accepted', 'declined' (default: 'pending') |
| created_at | timestamptz | Auto-generated |

### Update `campaign_applications` table

- Add new status value: extend the `application_status` enum to include `'counter_offered'`

### RLS Policies

- **SELECT**: Application creator or campaign owner can view counter-offers
- **INSERT**: Application creator or campaign owner can create counter-offers
- **UPDATE**: Only the recipient (not the sender) can update status

## Frontend Changes

### 1. New Component: `CounterOfferModal`
A dialog where the business enters their counter-offer (rate, timeline, message). Opens when they click "Counter Offer" instead of Accept/Reject.

### 2. New Component: `CounterOfferThread`
Displays the negotiation history as a threaded conversation showing each offer/counter-offer with amounts and timelines.

### 3. New Hook: `useCounterOffers`
- Fetches counter-offers for an application
- Mutations to create and respond to counter-offers

### 4. Update `ApplicationCard` (business view)
Add a third "Counter Offer" button alongside Accept/Reject for pending applications.

### 5. Update `DetailedApplicationCard` (creator view)
- Show counter-offer notification when status is `counter_offered`
- Display the business's proposed terms
- Allow creator to Accept, Decline, or Counter back

### 6. Update `CreatorApplicationsCard` (campaign details view)
Show counter-offer status badge and negotiation thread.

### 7. Update `useManageApplication` hook
Add `counter_offered` as a valid status transition.

### 8. Update `CampaignApplication` type
Add `counter_offered` to the status union type.

### 9. Update `ApplicationStatusBadge`
Add styling for the new `counter_offered` status (amber/orange color).

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/campaigns/CounterOfferModal.tsx` | Modal form for submitting counter-offers |
| `src/components/campaigns/CounterOfferThread.tsx` | Displays negotiation history |
| `src/hooks/useCounterOffers.ts` | Fetch and manage counter-offers |

## Files to Modify

| File | Change |
|------|---------|
| `src/types/applications.ts` | Add `'counter_offered'` to status type |
| `src/components/campaigns/ApplicationCard.tsx` | Add Counter Offer button |
| `src/components/applications/DetailedApplicationCard.tsx` | Show counter-offer UI for creators |
| `src/components/campaigns/CreatorApplicationsCard.tsx` | Show counter-offer status |
| `src/components/campaigns/ApplicationStatusBadge.tsx` | Add counter_offered badge style |
| `src/hooks/useManageApplication.ts` | Support counter_offered status |
| `src/pages/CreatorApplications.tsx` | Add counter_offered filter tab |

## Database Migration (SQL)

```sql
-- Add 'counter_offered' to the application_status enum
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'counter_offered';

-- Create counter-offers table
CREATE TABLE public.application_counter_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES campaign_applications(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('business', 'creator')),
  proposed_rate numeric,
  proposed_timeline text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.application_counter_offers ENABLE ROW LEVEL SECURITY;

-- SELECT: participants can view counter-offers for their applications
CREATE POLICY "Users can view counter-offers for their applications"
ON public.application_counter_offers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);

-- INSERT: participants can create counter-offers
CREATE POLICY "Users can create counter-offers for their applications"
ON public.application_counter_offers FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);

-- UPDATE: only the other party (not sender) can accept/decline
CREATE POLICY "Recipients can respond to counter-offers"
ON public.application_counter_offers FOR UPDATE
USING (
  sender_id != auth.uid()
  AND EXISTS (
    SELECT 1 FROM campaign_applications ca
    WHERE ca.id = application_counter_offers.application_id
    AND (
      ca.creator_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM campaigns c
        WHERE c.id = ca.campaign_id AND c.user_id = auth.uid()
      )
    )
  )
);
```

## User Experience

**Business/Restaurant sees a pending application:**
- Three buttons: Accept | Counter Offer | Reject
- Clicking "Counter Offer" opens a modal to propose new rate, timeline, and a message

**Creator sees a counter-offered application:**
- Application status shows "Counter Offered" in amber
- The counter-offer details are displayed (proposed rate, timeline, message)
- Three buttons: Accept Offer | Counter Back | Decline
- Accepting creates the collaboration at the agreed terms
- "Counter Back" opens the same modal for the creator to propose different terms

