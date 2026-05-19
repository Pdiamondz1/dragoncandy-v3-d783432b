# Campaign Fixed-Price Negotiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dual pricing model (fixed / bid_range) with a single Donny-suggested price and eBay/Poshmark-style "Make an Offer" counter-offer negotiation.

**Architecture:** Every campaign gets one price (Donny pre-fills it, business can edit). Creators either accept the price or counter-offer. The agreed price lives on the application record — campaign list price is immutable. The existing Stripe escrow flow already resolves the correct amount from the counter-offer chain, so payment infrastructure needs no changes.

**Tech Stack:** React 18, TypeScript, Zod, React Hook Form, React Query, Supabase (Postgres + Edge Functions), Stripe Connect, Anthropic Claude API, OpenAI GPT-4.

**Spec:** `docs/superpowers/specs/2026-05-19-campaign-fixed-price-negotiation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/campaigns/CampaignTimelineBudgetStep.tsx` | Modify | Remove PricingTypeSelector, simplify to single price field |
| `src/components/campaigns/PricingTypeSelector.tsx` | Delete | No longer needed — all campaigns are fixed price |
| `src/components/campaigns/CampaignFinalizeStep.tsx` | Modify | Remove bid_range branching, always use fixed-price flow |
| `src/hooks/useCampaignWizard.ts` | Modify | Remove `pricingType`/`budgetMin`/`budgetMax` from wizard state interfaces |
| `src/hooks/useCampaignCreator.ts` | Modify | Map AI `price` field (with `budget_range` fallback) to campaign data |
| `src/components/campaigns/CampaignApplyForm.tsx` | Modify | Add "Accept Price / Make Offer" dual-path UX |
| `src/hooks/useCounterOffers.ts` | Modify | Split acceptance: business-accepts = hire, creator-accepts = price agreed only; update `proposed_rate` on acceptance; set `rejected` on decline |
| `src/components/campaigns/CounterOfferModal.tsx` | Modify | Add $50 minimum, support creator-initiated offers on apply |
| `src/components/campaigns/CounterOfferThread.tsx` | Modify | Show full negotiation history with turn indicators |
| `src/components/campaigns/CampaignCard.tsx` | Modify | Show single price, negotiation status badges |
| `src/lib/campaignUtils.ts` | Modify | Simplify `formatBudget()` to always show single price |
| `src/lib/campaignPhase.ts` | Modify | Simplify `formatBudget()` to always show single price |
| `supabase/functions/donny-campaign-generate/index.ts` | Modify | AI prompt: `price` instead of `budget_range` |
| `supabase/functions/generate-campaign-analysis/index.ts` | Modify | AI prompt: single `recommended_price` instead of min/max |
| `src/pages/CreatorCampaignMarketplace.tsx` | Modify | Display single price instead of `$min - $max` |
| `src/components/campaign-creator/IdeaCard.tsx` | Modify | Display `price` instead of `budget_range.min–max` |
| `src/components/campaign-creator/CampaignEditor.tsx` | Modify | Replace BudgetSlider with single price input |
| `src/components/campaign-creator/CampaignPreviewCard.tsx` | Modify | Display `fixed_price` instead of `budget_max` |
| `src/types/campaignCreator.ts` | Modify | Replace `budget_min`/`budget_max` with `fixed_price` in types |
| `src/types/donny.ts` | Modify | Replace `budget_min`/`budget_max` with `price` in Donny types |
| `src/pages/CampaignEditPage.tsx` | Modify | Replace budget slider with single price input |
| `src/hooks/useCampaignEditForm.ts` | Modify | Replace `budget_min`/`budget_max` with `fixed_price` in edit form |
| `supabase/functions/donny-chat/index.ts` | Modify | Update tool schemas: `price` instead of `budget_min`/`budget_max` |
| `supabase/functions/donny-campaign-preview/index.ts` | Modify | Display single price |

**Backward-compatible files (no changes needed — use `budget_max`/`budget_min` as DB fallback for old campaigns):**
- `supabase/functions/create-campaign-escrow/index.ts` — already resolves correct price via counter-offer chain
- `supabase/functions/match-creators/index.ts` — reads from DB, backward compatible
- `supabase/functions/donny-apply-pitch/index.ts` — reads from DB, backward compatible
- `src/components/campaigns/BrandCampaignCard.tsx` — uses `budget_max` fallback, works for old campaigns
- `src/components/campaign-details/CompensationSection.tsx` — uses `budget_max`, works for old campaigns

**Deferred to separate task (different wizard flows):**
- `src/hooks/useBrandCampaignWizard.ts` — brand sponsorship wizard (separate flow, uses budget_min/max only)
- `src/components/brand-campaigns/BrandCampaignDetailsStep.tsx` — brand wizard step
- `src/components/brand-campaigns/BrandCampaignReviewStep.tsx` — brand wizard review
- `src/components/campaigns/AnonymousCampaignFinalizeStep.tsx` — anonymous pre-login wizard

---

### Task 1: Simplify `formatBudget()` utilities

Both `formatBudget()` copies currently branch on `pricing_type` and render ranges. Since all new campaigns will be fixed-price and we want existing campaigns to display cleanly, simplify to always show a single number.

**Files:**
- Modify: `src/lib/campaignUtils.ts:80-95`
- Modify: `src/lib/campaignPhase.ts:61-77`

- [ ] **Step 1: Update `formatBudget()` in `campaignUtils.ts`**

Replace lines 80-95 with:

```typescript
export function formatBudget(campaign: {
  pricing_type?: string | null;
  fixed_price?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): string {
  if (campaign.fixed_price) return `$${campaign.fixed_price.toLocaleString()}`;
  if (campaign.budget_max) return `$${campaign.budget_max.toLocaleString()}`;
  if (campaign.budget_min) return `$${campaign.budget_min.toLocaleString()}`;
  return 'Budget TBD';
}
```

- [ ] **Step 2: Update `formatBudget()` in `campaignPhase.ts`**

Replace lines 61-77 with:

```typescript
export function formatBudget(campaign: {
  pricing_type?: string | null;
  fixed_price?: number | null;
  delivery_fee?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): string {
  const base = campaign.fixed_price || campaign.budget_max || campaign.budget_min;
  if (!base) return 'Budget TBD';
  return `$${base.toLocaleString()}`;
}
```

Note: Removed the delivery_fee addition — the fee breakdown shows delivery separately in the payment summary.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type changes to the function signature)

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/campaignUtils.ts src/lib/campaignPhase.ts
git commit -m "refactor: simplify formatBudget to always show single price"
```

---

### Task 2: Simplify Campaign Creation Wizard — Remove bid_range pricing

Remove the `PricingTypeSelector` component and simplify `CampaignTimelineBudgetStep` to a single price input field.

**Files:**
- Delete: `src/components/campaigns/PricingTypeSelector.tsx`
- Modify: `src/components/campaigns/CampaignTimelineBudgetStep.tsx` (full rewrite of schema + form)

- [ ] **Step 1: Delete `PricingTypeSelector.tsx`**

Delete the file entirely. It exported `PricingType` and `PricingTypeSelector` — both are replaced.

- [ ] **Step 2: Rewrite `CampaignTimelineBudgetStep.tsx`**

Replace the entire file. Key changes:
- Schema: remove `pricingType`, `budgetMin`, `budgetMax` fields; keep `fixedPrice` as required with $50 minimum
- Remove `PricingTypeSelector` import and component
- Remove `budgetMin`/`budgetMax` state
- Remove `forceFixed` logic (everything is fixed now)
- Keep `getAiRecommendedPrice()` but use AI-provided price from `initialData` when available
- Single price input with label "Campaign Price" and helper "What you'll pay the creator"

```typescript
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { DeliveryTier } from '@/types/campaignMedia';

const timelineBudgetSchema = z.object({
  goals: z.string().min(10, 'Please describe your campaign goals (minimum 10 characters)'),
  deadline: z.date({ required_error: 'Please select a campaign deadline' }),
  deliveryType: z.enum(['dragondash', 'express', 'standard']),
  deliveryFee: z.number().min(0),
  fixedPrice: z.number().min(50, 'Campaign price must be at least $50'),
});

type TimelineBudgetFormData = z.infer<typeof timelineBudgetSchema>;

interface CampaignTimelineBudgetStepProps {
  deliveryTier: DeliveryTier;
  deliveryFee: number;
  initialData?: {
    goals?: string;
    deadline?: string;
    fixed_price?: number;
    ai_suggested_price?: number;
  };
  onContinue: (data: TimelineBudgetFormData) => void;
  onBackToCustomize: () => void;
}

export const CampaignTimelineBudgetStep: React.FC<CampaignTimelineBudgetStepProps> = ({
  deliveryTier,
  deliveryFee,
  initialData,
  onContinue,
  onBackToCustomize,
}) => {
  const getDefaultPrice = () => {
    if (initialData?.fixed_price) return initialData.fixed_price;
    if (initialData?.ai_suggested_price) return initialData.ai_suggested_price;
    switch (deliveryTier) {
      case 'dragondash': return 750;
      case 'express': return 600;
      default: return 500;
    }
  };

  const [fixedPrice, setFixedPrice] = useState<number>(getDefaultPrice());

  const form = useForm<TimelineBudgetFormData>({
    resolver: zodResolver(timelineBudgetSchema),
    defaultValues: {
      goals: initialData?.goals || '',
      deadline: initialData?.deadline ? new Date(initialData.deadline) : undefined,
      deliveryType: deliveryTier,
      deliveryFee,
      fixedPrice,
    },
  });

  useEffect(() => {
    form.setValue('deliveryType', deliveryTier);
    form.setValue('deliveryFee', deliveryFee);
    form.setValue('fixedPrice', fixedPrice);
  }, [deliveryTier, deliveryFee, fixedPrice, form]);

  const handleSubmit = (data: TimelineBudgetFormData) => {
    onContinue(data);
  };

  return (
    <div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Campaign Price */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <label className="text-base font-semibold block mb-1">Campaign Price</label>
                  <p className="text-sm text-muted-foreground mb-3">What you'll pay the creator. They can accept or make a counter-offer.</p>
                </div>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-lg">$</span>
                  <input
                    type="number"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(Number(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-3 border border-gray-200 rounded-xl text-lg font-semibold text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
                    min={50}
                    step={25}
                  />
                </div>
                {fixedPrice < 50 && fixedPrice > 0 && (
                  <p className="text-sm text-red-500">Minimum campaign price is $50</p>
                )}
                {deliveryFee > 0 && (
                  <p className="text-sm text-muted-foreground">
                    + ${deliveryFee} delivery fee · Total: ${fixedPrice + deliveryFee}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Goals & Deadline */}
          <Card>
            <CardContent className="pt-6 space-y-6">
              <FormField
                control={form.control}
                name="goals"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">Campaign Goals & Objectives</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the specific goals and success metrics for this campaign…"
                        className="min-h-[100px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-base font-semibold">Campaign Deadline</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                          >
                            {field.value ? format(field.value, "MM/dd/yyyy") : <span>mm/dd/yyyy</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-sm text-muted-foreground">When do you need this campaign to be completed?</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="outline" onClick={onBackToCustomize}>Back</Button>
            <Button type="submit" className="bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full">
              Continue to Visuals
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
```

- [ ] **Step 3: Fix imports that reference `PricingType` from `PricingTypeSelector`**

Search for any imports of `PricingType` from `PricingTypeSelector` and remove them.

- [ ] **Step 4: Update `useCampaignWizard.ts` — Remove bid_range from wizard state**

This hook defines `TimelineBudgetData` and `FinalCampaignData` interfaces that pass data between wizard steps. Remove `pricingType`, `budgetMin`, `budgetMax` from the interfaces. Keep `fixedPrice`. Update any state initialization and data propagation.

Find the file: `src/hooks/useCampaignWizard.ts`

In `TimelineBudgetData` and `FinalCampaignData`:
- Remove `pricingType`, `budgetMin`, `budgetMax` fields
- Keep `fixedPrice: number`
- Update any state setters that spread these fields

- [ ] **Step 5: Update `CampaignFinalizeStep.tsx` — Remove bid_range branching**

In the `CampaignData` interface (around line 44-56), remove `pricingType`, `budgetMin`, `budgetMax`. Keep `fixedPrice` as required.

Simplify `handleCreateCampaign` status logic (lines 165-177) — remove the bid_range/fixed branching:

```typescript
let status: 'draft' | 'published' = 'draft';
let escrowStatus: 'none' | 'pending' = 'none';

if (wantToPublish) {
  status = 'draft';
  escrowStatus = 'pending';
}
```

Remove `const isFixedPrice = campaignData.pricingType === 'fixed';` — it's always fixed now.

Simplify campaign payload — always set `pricing_type: 'fixed'` and `fixed_price`:

```typescript
const campaignPayload = {
  // ... existing fields ...
  pricing_type: 'fixed',
  fixed_price: campaignData.fixedPrice,
  escrow_status: escrowStatus,
  // Remove budget_min/budget_max conditional lines
};
```

Replace `if (wantToPublish && isFixedPrice)` with `if (wantToPublish)` for the escrow checkout trigger.

Remove the `isFixedPrice` condition from the checkout window opener:

```typescript
let checkoutWindow: Window | null = null;
if (wantToPublish) {
  checkoutWindow = window.open('about:blank', '_blank');
}
```

- [ ] **Step 6: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/campaigns/PricingTypeSelector.tsx src/components/campaigns/CampaignTimelineBudgetStep.tsx src/hooks/useCampaignWizard.ts src/components/campaigns/CampaignFinalizeStep.tsx
git commit -m "refactor: simplify campaign wizard to single price, remove bid_range flow"
```

---

### Task 4: Update Creator Application Form — "Accept Price / Make Offer" UX

Replace the current form (which shows a green info box for fixed-price and a rate input for bid-range) with a dual-path "Accept Price & Apply" / "Make an Offer" experience.

**Files:**
- Modify: `src/components/campaigns/CampaignApplyForm.tsx` (full rewrite of pricing section)

- [ ] **Step 1: Add offer mode state**

Add a state variable at the top of the component:

```typescript
const [offerMode, setOfferMode] = useState<'accept' | 'offer'>('accept');
```

- [ ] **Step 2: Remove `isFixedPrice` branching**

Remove `const isFixedPrice = campaign.pricing_type === 'fixed';` — everything is fixed-price now.

- [ ] **Step 3: Replace the pricing UI section (lines 149-176)**

Replace with:

```tsx
{/* Campaign Price & Offer Options */}
<div className="mb-4">
  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 mb-3">
    <p className="text-sm text-teal-800 font-semibold">
      Campaign Price: <span className="text-lg">${campaign.fixed_price?.toLocaleString()}</span>
    </p>
  </div>
  <div className="flex gap-2 mb-3">
    <button
      type="button"
      onClick={() => { setOfferMode('accept'); setProposedRate(''); }}
      className={`flex-1 text-xs px-3 py-2 rounded-full font-semibold transition-colors ${
        offerMode === 'accept'
          ? 'bg-dc-teal-btn text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-teal'
      }`}
    >
      Accept Price
    </button>
    <button
      type="button"
      onClick={() => setOfferMode('offer')}
      className={`flex-1 text-xs px-3 py-2 rounded-full font-semibold transition-colors ${
        offerMode === 'offer'
          ? 'bg-dc-pink-accent text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-dc-pink-accent'
      }`}
    >
      Make an Offer
    </button>
  </div>
  {offerMode === 'offer' && (
    <div>
      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Your Offer</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dc-teal font-bold text-sm">$</span>
        <input
          type="number"
          value={proposedRate}
          onChange={(e) => setProposedRate(e.target.value)}
          className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 outline-none focus:border-dc-teal focus:ring-1 focus:ring-dc-teal"
          placeholder="Enter your offer"
          min={50}
          step={1}
          required
        />
      </div>
      <p className="text-[11px] text-gray-500 mt-1">Minimum offer: $50</p>
    </div>
  )}
</div>
```

- [ ] **Step 4: Update form submission logic (lines 104-121)**

Replace the submit handler to pass the correct `proposedRate`:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (offerMode === 'offer' && (!proposedRate || Number(proposedRate) < 50)) return;

  try {
    await createApplication.mutateAsync({
      campaignId: campaign.id,
      introMessage: pitch || '',
      proposedTimeline: getISODate(selectedDate),
      proposedRate: offerMode === 'accept'
        ? (campaign.fixed_price || undefined)
        : Number(proposedRate),
      portfolioUrl: portfolioUrl || undefined,
      isCounterOffer: offerMode === 'offer',
    });
    setSubmitted(true);
    setTimeout(() => onSuccess(), 1500);
  } catch {
    // Error handled by mutation's onError
  }
};
```

- [ ] **Step 5: Update submit button disabled logic (line 284)**

```typescript
disabled={createApplication.isPending || (offerMode === 'offer' && (!proposedRate || Number(proposedRate) < 50))}
```

- [ ] **Step 6: Update submit button label**

```tsx
{createApplication.isPending ? (
  <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</>
) : offerMode === 'accept' ? (
  'Accept Price & Apply'
) : (
  'Submit Offer & Apply'
)}
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: May fail if `useCreateApplication` doesn't accept `isCounterOffer`. That's handled in Task 5.

- [ ] **Step 8: Commit**

```bash
git add src/components/campaigns/CampaignApplyForm.tsx
git commit -m "feat: add Accept Price / Make Offer dual-path to creator application form"
```

---

### Task 5: Update `useCreateApplication` hook — Support counter-offer on apply

The `useCreateApplication` hook needs to accept an `isCounterOffer` flag. When true, it creates the application with status `'counter_offered'` and simultaneously inserts an `application_counter_offers` record.

**Files:**
- Modify: `src/hooks/useCreateApplication.ts` (find via grep — exact path needed)

- [ ] **Step 1: Find the hook file**

Run: `grep -r "useCreateApplication" src/hooks/ --files-with-matches`

- [ ] **Step 2: Add `isCounterOffer` to the mutation input**

Add `isCounterOffer?: boolean` to the mutation parameters.

- [ ] **Step 3: Update mutation logic**

When `isCounterOffer` is true:
1. Insert the application with `status: 'counter_offered'` and `proposed_rate` = the creator's offer
2. After successful insert, create an `application_counter_offers` record:

```typescript
if (isCounterOffer && applicationId) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('application_counter_offers').insert({
    application_id: applicationId,
    sender_id: user!.id,
    sender_role: 'creator',
    proposed_rate: proposedRate,
    message: introMessage || 'I would like to propose a different rate for this campaign.',
    status: 'pending',
  });
}
```

When `isCounterOffer` is false (or undefined), keep existing behavior — application with status `'pending'`.

- [ ] **Step 4: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCreateApplication.ts
git commit -m "feat: support counter-offer creation on application submission"
```

---

### Task 6: Update `useRespondToCounterOffer` — Split acceptance semantics

Currently, accepting a counter-offer always sets application status to `'accepted'`. Per the spec, the behavior depends on who accepts:
- **Business accepts creator's offer → hire** (status = `'accepted'`)
- **Creator accepts business's offer → price agreed** (status = `'pending'`)

Also: update `proposed_rate` on the application to the agreed amount.

**Files:**
- Modify: `src/hooks/useCounterOffers.ts:132-241`

- [ ] **Step 1: Add `currentUserRole` to mutation input**

Add a `currentUserRole: 'business' | 'creator'` field to the mutation parameters:

```typescript
mutationFn: async ({
  counterOfferId,
  applicationId,
  response,
  currentUserRole,
  agreedRate,
}: {
  counterOfferId: string;
  applicationId: string;
  response: 'accepted' | 'declined';
  currentUserRole: 'business' | 'creator';
  agreedRate?: number;
}) => {
```

- [ ] **Step 2: Split the acceptance logic (lines 159-171)**

Replace the unconditional `status: 'accepted'` update with role-dependent logic:

```typescript
if (response === 'accepted') {
  const newAppStatus = currentUserRole === 'business' ? 'accepted' : 'pending';

  const { data: appRows, error: appError } = await supabase
    .from('campaign_applications')
    .update({
      status: newAppStatus,
      ...(agreedRate ? { proposed_rate: agreedRate } : {}),
    })
    .eq('id', applicationId)
    .eq('status', 'counter_offered')
    .select('id');

  if (appError) throw appError;
  if (!appRows || appRows.length === 0) {
    throw new Error('This application status has already changed.');
  }
}
```

- [ ] **Step 3: Update the success toast messages (lines 180-184)**

```typescript
toast({
  title: response === 'accepted'
    ? currentUserRole === 'business'
      ? 'Creator hired!'
      : 'Price agreed!'
    : 'Offer declined',
  description: response === 'accepted'
    ? currentUserRole === 'business'
      ? 'Proceed to payment to start the project.'
      : 'The business will review your application.'
    : 'The other party will be notified.',
});
```

- [ ] **Step 4: Update the donny_nudges logic (lines 218-230)**

Only create the "campaign_hired" nudge when `currentUserRole === 'business'` (the actual hiring action):

```typescript
if (response === 'accepted' && currentUserRole === 'business') {
  // existing nudge insert logic
}
```

- [ ] **Step 5: Add decline → rejected behavior**

Currently when `response === 'declined'`, only the counter-offer status is updated but the application status stays as `'counter_offered'`. Per the spec, declining should reject the application:

```typescript
if (response === 'declined') {
  await supabase
    .from('campaign_applications')
    .update({ status: 'rejected' })
    .eq('id', applicationId)
    .eq('status', 'counter_offered');
}
```

- [ ] **Step 6: Update all callers of `useRespondToCounterOffer`**

Search for usages: `grep -r "useRespondToCounterOffer\|respondToCounterOffer" src/ --files-with-matches`

Each call site needs `currentUserRole` and `agreedRate`. Determine `currentUserRole` by comparing `user.id` to `application.creator_id`:

```typescript
const currentUserRole = user?.id === application.creator_id ? 'creator' : 'business';
```

Pass `agreedRate` from the counter-offer's `proposed_rate` being accepted.

- [ ] **Step 7: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useCounterOffers.ts
git commit -m "feat: split counter-offer acceptance — business=hire, creator=price agreed; decline=rejected"
```

---

### Task 7: Update `CampaignCard` — Single price display + negotiation status

The campaign card currently shows budget ranges. Update to show a single price and negotiation status badges.

**Files:**
- Modify: `src/components/campaigns/CampaignCard.tsx:199` (price display)
- Modify: `src/pages/CreatorCampaignMarketplace.tsx:437` (marketplace price display)

- [ ] **Step 1: Update `CampaignCard.tsx` price display**

The component already uses `formatBudget(campaign)` at line 199, which was updated in Task 1. Verify it renders correctly.

- [ ] **Step 2: Update `CampaignCard.tsx` escrow base amount (line 249)**

Change `campaign.fixed_price || campaign.budget_max || 0` to `campaign.fixed_price || 0` — budget_max fallback is no longer needed for new campaigns but keep it for backward compatibility:

```typescript
const baseAmount = campaign.fixed_price || campaign.budget_max || 0;
```

(Keep as-is for backward compatibility with existing campaigns.)

- [ ] **Step 3: Update `CreatorCampaignMarketplace.tsx` price display (line 437)**

Replace: `${campaign?.budget_min} - ${campaign?.budget_max}`

With: `${formatBudget(campaign)}` — import `formatBudget` from `@/lib/campaignUtils`.

- [ ] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/campaigns/CampaignCard.tsx src/pages/CreatorCampaignMarketplace.tsx
git commit -m "feat: update campaign card and marketplace to show single price"
```

---

### Task 8: Update Donny AI — Single price instead of budget range

Change the AI prompt in `donny-campaign-generate` to return a single `price` field.

**Files:**
- Modify: `supabase/functions/donny-campaign-generate/index.ts:129` (prompt schema)
- Modify: `supabase/functions/generate-campaign-analysis/index.ts:73-77` (budget_recommendations)

- [ ] **Step 1: Update `donny-campaign-generate` prompt (line 129)**

Replace:
```
"budget_range": { "min": <number>, "max": <number> },
```

With:
```
"price": <number>,
```

- [ ] **Step 2: Update the TypeScript return type / response parsing**

The response is parsed as raw JSON (line 177-187) — no type enforcement. The consuming code needs to handle both old and new formats. Check where `budget_range` is read from the response and update to read `price` with fallback:

```typescript
const price = idea.price ?? idea.budget_range?.max ?? idea.budget_range?.min ?? 500;
```

- [ ] **Step 3: Update `generate-campaign-analysis` prompt (lines 73-77)**

Replace:
```json
"budget_recommendations": {
  "min": 500,
  "max": 2000,
  "reasoning": "Budget explanation"
},
```

With:
```json
"budget_recommendations": {
  "price": 1200,
  "reasoning": "Budget explanation"
},
```

- [ ] **Step 4: Update consumers of the AI response**

Search for code that reads `budget_range.min`, `budget_range.max`, or `budget_recommendations.min`/`.max` from AI responses and update to use `price` with fallback.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS (edge functions aren't part of the Vite build, but verify no frontend breaks)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-campaign-generate/index.ts supabase/functions/generate-campaign-analysis/index.ts
git commit -m "feat: Donny AI generates single price instead of budget range"
```

---

### Task 9: Update AI response consumers — types, hooks, and display components

When the AI prompt changes to return `price` instead of `budget_range`, the consuming code will crash. Update all files that read from the AI response.

**Files:**
- Modify: `src/types/campaignCreator.ts` — Replace `budget_min`/`budget_max` with `fixed_price` and add `price` to AI idea type
- Modify: `src/types/donny.ts` — Replace `budget_min`/`budget_max` with `price` in Donny types
- Modify: `src/hooks/useCampaignCreator.ts` — Map `idea.price` (with `budget_range` fallback) to `fixed_price`
- Modify: `src/components/campaign-creator/IdeaCard.tsx` — Display `$${idea.price}` instead of range
- Modify: `src/components/campaign-creator/CampaignEditor.tsx` — Replace BudgetSlider with single price input
- Modify: `src/components/campaign-creator/CampaignPreviewCard.tsx` — Display `fixed_price`
- Modify: `src/lib/campaignCreatorValidation.ts` — Update Zod validation for single price

- [ ] **Step 1: Update types**

In `src/types/campaignCreator.ts`, replace `budget_min`/`budget_max` fields with `fixed_price: number`. In `src/types/donny.ts`, add `price?: number` to any AI idea type and keep `budget_range` as optional for backward compat.

- [ ] **Step 2: Update `useCampaignCreator.ts` mapping**

Where the hook maps `idea.budget_range.min`/`.max` to campaign fields, replace with:

```typescript
const price = idea.price ?? idea.budget_range?.max ?? idea.budget_range?.min ?? 500;
// Map to campaign data
fixed_price: price,
```

- [ ] **Step 3: Update `IdeaCard.tsx` display**

Replace `${idea.budget_range.min}–${idea.budget_range.max}` with:

```typescript
const displayPrice = idea.price ?? idea.budget_range?.max ?? 'TBD';
// Render: $${displayPrice}
```

- [ ] **Step 4: Update `CampaignEditor.tsx`**

Replace `BudgetSlider` with a single price input. Remove `budget_min`/`budget_max` references, use `fixed_price`.

- [ ] **Step 5: Update `CampaignPreviewCard.tsx`**

Replace `campaign.budget_max` display with `campaign.fixed_price || campaign.budget_max || 0`.

- [ ] **Step 6: Update Zod validation in `campaignCreatorValidation.ts`**

Replace `budget_min`/`budget_max` with `fixed_price: z.number().min(50)`.

- [ ] **Step 7: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/types/campaignCreator.ts src/types/donny.ts src/hooks/useCampaignCreator.ts src/components/campaign-creator/IdeaCard.tsx src/components/campaign-creator/CampaignEditor.tsx src/components/campaign-creator/CampaignPreviewCard.tsx src/lib/campaignCreatorValidation.ts
git commit -m "refactor: update AI response consumers for single price model"
```

---

### Task 10: Update remaining display files — single price everywhere

Update remaining files that display budget ranges or reference the old pricing model.

**Files:**
- Modify: `src/pages/CampaignEditPage.tsx` — Replace budget slider with single price input
- Modify: `src/hooks/useCampaignEditForm.ts` — Replace `budget_min`/`budget_max` with `fixed_price`
- Modify: `supabase/functions/donny-chat/index.ts` — Update tool schemas: `price` instead of `budget_min`/`budget_max`
- Modify: `supabase/functions/donny-campaign-preview/index.ts` — Display single price

- [ ] **Step 1: Update `CampaignEditPage.tsx`**

Replace the budget slider (lines 337-342) with a single price input for `fixed_price`. Keep backward compat for old campaigns that have `budget_max`.

- [ ] **Step 2: Update `useCampaignEditForm.ts`**

Replace `budget_min`/`budget_max` string fields with `fixed_price`. Update the form loading and saving logic.

- [ ] **Step 3: Update `donny-chat` tool schemas**

In `supabase/functions/donny-chat/index.ts`, update the campaign creation/update tool parameters: replace `budget_min`/`budget_max` with `price` (or `fixed_price` to match the DB column).

- [ ] **Step 4: Update `donny-campaign-preview`**

Replace `$${campaign.budget_min}–$${campaign.budget_max}` with `$${campaign.fixed_price || campaign.budget_max || 'TBD'}`.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/CampaignEditPage.tsx src/hooks/useCampaignEditForm.ts supabase/functions/donny-chat/index.ts supabase/functions/donny-campaign-preview/index.ts
git commit -m "refactor: update remaining display files for single price model"
```

---

### Task 11: Update `CounterOfferModal` — Add $50 minimum

Add minimum price validation to the counter-offer modal.

**Files:**
- Modify: `src/components/campaigns/CounterOfferModal.tsx`

- [ ] **Step 1: Add minimum validation**

In the submit handler, add:

```typescript
if (proposedRate < 50) {
  toast({ title: 'Minimum offer is $50', variant: 'destructive' });
  return;
}
```

- [ ] **Step 2: Update the rate input**

Add `min={50}` to the rate input field.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/campaigns/CounterOfferModal.tsx
git commit -m "feat: enforce $50 minimum on counter-offers"
```

---

### Task 12: End-to-end verification

Verify the full flow works in the running dev environment.

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test campaign creation (Restaurant account)**

1. Log in as restaurant (`dwilliams@harbormill.net`)
2. Create a new campaign
3. Verify: wizard shows single price field (no fixed/bid-range toggle)
4. Verify: price is pre-filled with Donny's suggestion
5. Verify: can edit the price
6. Verify: "Pay & Publish" triggers Stripe checkout with correct amount

- [ ] **Step 3: Test creator application (Creator account)**

1. Log in as creator (`damewillie@gmail.com`)
2. Browse campaigns
3. Verify: campaign shows single price (not a range)
4. Verify: "Accept Price & Apply" and "Make an Offer" buttons appear
5. Test "Accept Price & Apply" — verify application created with `proposed_rate` = listed price
6. Test "Make an Offer" — verify counter-offer created, application status = `counter_offered`

- [ ] **Step 4: Test negotiation flow**

1. As restaurant, view the counter-offered application
2. Counter with a different price
3. As creator, accept the business's counter-offer
4. Verify: application status → `'pending'` (NOT `'accepted'`)
5. As restaurant, approve the creator
6. Verify: application status → `'accepted'`, collaboration created

- [ ] **Step 5: Test Stripe payment**

1. As restaurant, click "Pay & Publish"
2. Verify: Stripe checkout shows the agreed amount from counter-offer chain
3. Complete payment (test mode)
4. Verify: campaign status updates, escrow held

- [ ] **Step 6: Test backward compatibility**

1. Check that any existing bid_range campaigns still display correctly
2. Verify `formatBudget()` handles old campaigns with `budget_min`/`budget_max`

- [ ] **Step 7: Test decline flow**

1. As restaurant, decline a creator's counter-offer
2. Verify: application status → `'rejected'`, creator is notified
3. Verify: creator can see the rejection

- [ ] **Step 8: Test multi-creator independence**

1. Have two creators apply to the same campaign with different offers
2. Verify: each negotiation is independent
3. Verify: campaign `fixed_price` (list price) stays constant throughout

- [ ] **Step 9: Check console for errors**

Open Chrome DevTools → Console. Verify no errors related to the pricing changes.

- [ ] **Step 10: Run full build**

Run: `npm run build`
Expected: PASS with no errors

- [ ] **Step 11: Final commit**

If any fixes were needed during verification, commit them with specific file names (not `git add -A`).
