# Campaign Settled Price Consistency & Counter-Offer Fixes

## Context

After a multi-round counter-offer negotiation between Harbormill (restaurant)
and Ricky Ricardo (creator) on the "Edgewater's Most-Watched TikTok Drop"
campaign, three different prices appear across the platform:

- **$875** on the "Pay Escrow" button (correct agreed rate, missing delivery fee)
- **$900** on Stripe checkout ($875 + $25 delivery — correct total charge)
- **$907.50** on the campaign status banner ($800 original budget + $25 delivery
  + $82.50 phantom platform fee — wrong base, wrong fee model)

Additionally: portfolio sample thumbnails break on application forms, and the
counter-offer message field is incorrectly required.

## Important: Edge function is the pricing authority

The `create-campaign-escrow` edge function only reads `campaignId` from the
request body (line 49). It ignores any `amount`, `deliveryFee`, or other
pricing fields the frontend passes. All pricing is resolved server-side via
`resolvePayoutAmount()` + `campaign.delivery_fee` from the DB.

This means the Stripe charge is always correct — the bugs are purely in
frontend **display** components showing inconsistent numbers.

`CampaignDetailsPage.tsx` also calls `create-campaign-escrow`, but only in the
`pre_hire` phase (before any counter-offers exist), so `campaign.fixed_price`
is the correct base at that point. No changes needed there.

## Root Causes

### Price inconsistency

1. `CampaignStatusBanner.tsx` passes `campaign.fixed_price` (original $800
   budget) to `EscrowFeeBreakdown` instead of the agreed counter-offer value.
2. `EscrowFeeBreakdown.tsx` adds a platform fee as a business-facing surcharge.
   Per STRIPE_PRICES.md and `platform-fee.ts`, the platform fee is a take rate
   deducted from the creator's payout — not charged to the business.
3. `ApplicationCard.tsx` shows "Pay Escrow - $875" (creator rate only) while
   Stripe charges $900 (creator rate + $25 delivery fee). The delivery fee
   data is not available in this component — it needs to be passed via props
   or added to the `CampaignApplication` type.
4. The `['agreed-value']` query is not invalidated when a counter-offer is
   accepted, so stale prices can persist across components.

### Portfolio sample broken image

The `apply_to_campaign` RPC function does not accept a `p_portfolio_url`
parameter. The `useCreateApplication` hook accepts `portfolioUrl` but discards
it (prefixed `_portfolioUrl`). The data is never saved, so application views
show broken images.

The apply form preview also fails for video files: the `toThumbnailUrl()`
helper returns raw video URLs which `<img>` cannot render.

### Counter-offer message required

`CounterOfferModal.tsx` enforces the message via label asterisk, HTML `required`
attribute, and JS validation guards. The backend RPC (`create_counter_offer`)
already defaults the message to `''`.

## Design

### Fix 1: Portfolio sample storage and display

**Migration — `apply_to_campaign` RPC:**

Add `p_portfolio_url text DEFAULT NULL` parameter. Include `portfolio_url` in
the INSERT and ON CONFLICT UPDATE clauses.

```sql
CREATE OR REPLACE FUNCTION apply_to_campaign(
  p_campaign_id uuid,
  p_creator_id uuid,
  p_proposed_rate numeric,
  p_intro_message text,
  p_proposed_timeline text DEFAULT NULL,
  p_is_counter_offer boolean DEFAULT false,
  p_portfolio_url text DEFAULT NULL          -- NEW
)
...
INSERT INTO campaign_applications (
  campaign_id, creator_id, proposed_rate, intro_message,
  proposed_timeline, status, portfolio_url               -- ADD portfolio_url
)
VALUES (
  p_campaign_id, p_creator_id, p_proposed_rate, p_intro_message,
  p_proposed_timeline, v_app_status, p_portfolio_url     -- ADD p_portfolio_url
)
ON CONFLICT ... DO UPDATE SET
  ...
  portfolio_url = EXCLUDED.portfolio_url,                -- ADD
  ...
```

**`useCreateApplication.ts`:** Remove `_` prefix from `portfolioUrl`, pass it
to the RPC as `p_portfolio_url`.

**`CampaignApplyForm.tsx` — preview thumbnail:** For video portfolio samples
(`.mp4`, `.mov`, `.webm`), use an inline `<video>` element with `preload="metadata"`
and seek to first frame, wrapped in the same thumbnail container. The existing
`VideoFrameThumbnail` component requires a `fileId` for persistence to storage,
which portfolio URLs don't have. A lightweight inline approach avoids that
dependency. Detect video files using the same regex as `toThumbnailUrl()`:
`/\.(mp4|mov|webm|avi)(\?|$)/i`.

**`ApplicationCard.tsx` and `DetailedApplicationCard.tsx` — display:** Keep
`useResolvedLogoUrl` for image portfolio URLs (it's an alias for
`useResolvedStorageUrl`, which correctly signs private-bucket URLs). Add video
detection: if the URL matches a video extension, render an inline `<video>`
with poster frame instead of `<img>`. This avoids the `VideoFrameThumbnail`
`fileId` dependency.

**Note on re-application:** If a creator re-applies with a different portfolio
sample, the `ON CONFLICT DO UPDATE` clause will overwrite the stored
`portfolio_url`. This is desired behavior — the latest sample is always shown.

### Fix 2: Counter-offer message optional

**`CounterOfferModal.tsx`:**

| Change | Before | After |
|--------|--------|-------|
| Label | `Message *` | `Message (optional)` |
| Textarea | `required` attribute | Remove `required` |
| Submit guard | `if (!message.trim() \|\| !proposedRate \|\| ...)` | `if (!proposedRate \|\| parseFloat(proposedRate) < 50)` |
| Button disabled | `!message.trim() \|\| !proposedRate \|\| ...` | `!proposedRate \|\| parseFloat(proposedRate) < 50 \|\| ...` |

No backend changes needed — `create_counter_offer` RPC defaults `p_message`
to `''`.

### Fix 3: Pricing consistency

**Principle:** The platform fee is a take rate (per STRIPE_PRICES.md). The
business pays: agreed creator rate + delivery fee = total. Platform fee is
deducted from the creator's payout during release.

**a) `EscrowFeeBreakdown.tsx`:**

Remove the `platformRate` prop and platform fee line item. Rename the
`baseAmount` prop to `creatorRate` and change the label text from
"Campaign Budget" to "Creator Rate". The component shows only:

```
Creator Rate:       $875.00
Express Delivery:    $25.00
─────────────────────────────
Total:              $900.00
```

Remove the `platformRate` prop and its default value. Remove the platform fee
calculation and display row entirely.

**b) `CampaignStatusBanner.tsx`:**

Add `agreedValue?: number | null` prop. Use it as the base amount for
`EscrowFeeBreakdown`:

```tsx
<EscrowFeeBreakdown
  creatorRate={agreedValue ?? campaign.fixed_price ?? campaign.budget_max ?? 0}
  deliveryFee={campaign.delivery_fee || 0}
  deliveryType={campaign.delivery_type || 'standard'}
/>
```

The parent page must pass `agreedValue` from `useAgreedValue(campaignId)`.

**c) `ApplicationCard.tsx` — escrow payment section:**

Add `campaignDeliveryFee?: number` and `campaignDeliveryType?: string` to
`ApplicationCardProps`. The parent component passes these from the campaign
data. Update the `CampaignApplication` type in `src/types/applications.ts`
to include `delivery_fee` and `delivery_type` in the `campaign` sub-type,
and update the select query in `useFetchApplications.ts` to fetch those
fields.

Update the escrow notice and button to show total:

```tsx
// Notice text
<p>Creator rate: {formatCurrency(agreedAmount)} + {deliveryLabel}: {formatCurrency(deliveryFee)}</p>
<p>Total: {formatCurrency(agreedAmount + deliveryFee)}</p>

// Button
Pay Escrow - {formatCurrency(agreedAmount + deliveryFee)}
```

Note: the edge function ignores frontend-provided amounts. These display
changes are purely for UX clarity — the Stripe charge is always resolved
server-side from the DB.

**d) Query invalidation — `useRespondToCounterOffer` and
`useManageApplication`:**

Add to both `onSuccess` callbacks:

```ts
queryClient.invalidateQueries({ queryKey: ['agreed-value'] });
```

This ensures the settled price propagates instantly when a counter-offer is
accepted or an application status changes.

### Fix 4: Creator-side display (no changes needed)

`CompensationSection.tsx` already uses `useAgreedValue` and displays
"Your earnings: $875" for the creator view. This is correct.

## Files to modify

| File | Change |
|------|--------|
| `supabase/migrations/NEW_add_portfolio_url_to_apply_rpc.sql` | Add `p_portfolio_url` param |
| `src/hooks/useCreateApplication.ts` | Pass `portfolioUrl` to RPC |
| `src/components/campaigns/CampaignApplyForm.tsx` | `VideoFrameThumbnail` for video previews |
| `src/components/campaigns/ApplicationCard.tsx` | Portfolio display fix, escrow total display |
| `src/components/applications/DetailedApplicationCard.tsx` | Portfolio display fix |
| `src/components/campaigns/CounterOfferModal.tsx` | Message field optional |
| `src/components/payments/EscrowFeeBreakdown.tsx` | Remove platform fee, rename prop + label |
| `src/components/campaigns/detail/CampaignStatusBanner.tsx` | Use agreed value for breakdown |
| `src/types/applications.ts` | Add `delivery_fee`, `delivery_type` to campaign sub-type |
| `src/hooks/useFetchApplications.ts` | Add `delivery_fee`, `delivery_type` to select |
| `src/hooks/useCounterOffers.ts` | Invalidate `['agreed-value']` |
| `src/hooks/useManageApplication.ts` | Invalidate `['agreed-value']` |
| Parent page passing `agreedValue` to `CampaignStatusBanner` | Wire up `useAgreedValue` |

## Existing utilities to reuse

| Utility | Location | Purpose |
|---------|----------|---------|
| `useAgreedValue` | `src/hooks/useAgreedValue.ts` | Resolves settled price from counter-offers |
| `resolvePayoutAmount` | `supabase/functions/_shared/pricing-utils.ts` | Backend equivalent (already correct) |
| `useResolvedLogoUrl` | `src/hooks/useSignedUrl.ts` | Signs private-bucket URLs (keep for image portfolio URLs) |
| `toThumbnailUrl` | `src/components/campaigns/CampaignApplyForm.tsx` | Converts storage URLs to render endpoint |

## Verification

1. **Counter-offer flow:** Create a campaign → creator applies with counter-offer
   → business counters → creator counters → business accepts. Verify:
   - Application card shows correct agreed rate + delivery in escrow section
   - Campaign status banner shows correct total (no platform fee)
   - Stripe checkout shows the same total
   - All three match
2. **Straight accept flow:** Creator applies at campaign price, business accepts
   without negotiation. Verify the same consistency.
3. **Portfolio sample:** Creator applies and attaches a video sample. Verify
   thumbnail renders in both the apply form preview and the business's
   application card view.
4. **Counter-offer message:** Send a counter-offer without a message. Verify it
   succeeds.
5. **Real-time sync:** After acceptance, verify the campaign detail page updates
   the settled price without requiring a page refresh.
6. **Desktop and mobile:** All UI changes must render correctly on both
   viewports. Desktop changes use `lg:`/`xl:` prefixed classes; mobile uses
   base classes.
