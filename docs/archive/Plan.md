# Pricing v2 Migration Plan

> Audit completed 2026-05-06. No code changes made.
> Source of truth: `docs/DragonCandy_Pricing_Profitability_Briefing_v2.md`

---

## A. Surfaces Inventory

### Tier Price Displays

| File | Line(s) | Current Value | New Value |
|------|---------|--------------|-----------|
| `src/lib/pricing/tier-features.ts` | 31 | `starter: { monthly: 199, annual: 159 }` | `starter: { monthly: 149, annual: 119 }` |
| `src/lib/pricing/tier-features.ts` | 32 | `growth: { monthly: 499, annual: 399 }` | `growth: { monthly: 449, annual: 359 }` |
| `src/lib/pricing/tier-features.ts` | 33 | `pro: { monthly: 999, annual: 799 }` | `pro: { monthly: 899, annual: 719 }` |
| `src/pages/OrgBillingPage.tsx` | 28 | `starter: 199` | `starter: 149` |
| `src/pages/OrgBillingPage.tsx` | 29 | `growth: 499` | `growth: 449` |
| `src/pages/OrgBillingPage.tsx` | 30 | `pro: 999` | `pro: 899` |
| `src/pages/OrgBillingPage.tsx` | 122 | `"Upgrade to Starter ($199/mo)"` | `"Upgrade to Starter ($149/mo)"` |
| `supabase/functions/donny-orchestrator/agents/billing.ts` | 20 | `monthly_price: 199` | `monthly_price: 149` |
| `supabase/functions/donny-orchestrator/agents/billing.ts` | 28 | `monthly_price: 499` | `monthly_price: 449` |
| `supabase/functions/donny-orchestrator/agents/billing.ts` | 38 | `monthly_price: 999` | `monthly_price: 899` |
| `supabase/seed/donny-knowledge-seed.ts` | 354 | Free plan text (no price, ok) | Add "10% take rate" to description |
| `supabase/seed/donny-knowledge-seed.ts` | 366 | Starter plan text (no price shown) | Add "$149/mo, 7% take rate" |
| `supabase/seed/donny-knowledge-seed.ts` | 378 | Growth plan text (no price shown) | Add "$449/mo, 5% take rate" |
| `docs/STRIPE_PRICES.md` | 6-8 | $199/$499/$999 | $149/$449/$899 |
| `docs/STRIPE_PRICES.md` | 13-15 | $159/$399/$799 annual | $119/$359/$719 annual |

### Take-Rate Displays

| File | Line | Current | New |
|------|------|---------|-----|
| `supabase/functions/_shared/platform-fee.ts` | 1 | `PLATFORM_FEE_RATE = 0.05` (flat) | Tier-aware lookup (see Section D) |
| `src/components/dragonshare/BoostConfirmationSheet.tsx` | 79 | "DragonCandy's 20%" | No change (DragonShare fee is separate from campaign take rate) |

### Feature Gating (already correct)

| File | Line | Current | v2 Spec | Status |
|------|------|---------|---------|--------|
| `src/lib/pricing/tier-features.ts` | 17 | `dragondash` requires `growth` | DragonDash incl. Growth+ | CORRECT |
| `src/lib/pricing/tier-features.ts` | 15 | `creator_delivery` requires `starter` | Starter+ | CORRECT |

### Donny Action Budgets (already correct per v2)

| File | Line | Current | v2 Spec | Status |
|------|------|---------|---------|--------|
| `src/lib/pricing/tier-features.ts` | 38-44 | free:50, starter:500, growth:2000, pro:10000 | Same | CORRECT |
| `supabase/functions/_shared/usage-tracker.ts` | 11-17 | Same values | Same | CORRECT |

---

## B. Schema Changes Required

### Migration 1: Add `take_rate` column to `organizations`

**Why:** The platform fee is currently a hardcoded constant (`0.05`). The v2 model requires
a per-tier rate (10%/7%/5%/3%/2%). The cleanest path is to store the rate on the org and
update it when `subscription_tier` changes. This avoids a lookup join on every payment.

```sql
-- Migration: 20260507000001_add_take_rate_to_organizations.sql

ALTER TABLE public.organizations
  ADD COLUMN take_rate numeric(4,4) NOT NULL DEFAULT 0.10;

-- Backfill existing orgs based on current subscription_tier
UPDATE public.organizations SET take_rate = 0.10 WHERE subscription_tier = 'free';
UPDATE public.organizations SET take_rate = 0.07 WHERE subscription_tier = 'starter';
UPDATE public.organizations SET take_rate = 0.05 WHERE subscription_tier = 'growth';
UPDATE public.organizations SET take_rate = 0.03 WHERE subscription_tier = 'pro';
UPDATE public.organizations SET take_rate = 0.02 WHERE subscription_tier = 'enterprise';

COMMENT ON COLUMN public.organizations.take_rate IS
  'Platform take rate applied to campaign payments. Decreases with higher tiers.';
```

**RLS impact:** None. Existing SELECT policies on `organizations` include all columns.
No new policies needed.

**Rollback:**
```sql
ALTER TABLE public.organizations DROP COLUMN take_rate;
```

### Migration 2: Add `active_campaign_limit` column to `organizations`

**Why:** The v2 model defines per-tier campaign limits (Free=1, Starter=3, Growth=10, Pro/Enterprise=unlimited).
Currently there is NO enforcement of this limit anywhere in the codebase. The Donny knowledge seed
describes it, but no code enforces it.

```sql
-- Migration: 20260507000002_add_active_campaign_limit.sql

ALTER TABLE public.organizations
  ADD COLUMN active_campaign_limit integer NOT NULL DEFAULT 1;

-- Backfill
UPDATE public.organizations SET active_campaign_limit = 1 WHERE subscription_tier = 'free';
UPDATE public.organizations SET active_campaign_limit = 3 WHERE subscription_tier = 'starter';
UPDATE public.organizations SET active_campaign_limit = 10 WHERE subscription_tier = 'growth';
UPDATE public.organizations SET active_campaign_limit = 2147483647 WHERE subscription_tier IN ('pro', 'enterprise');

COMMENT ON COLUMN public.organizations.active_campaign_limit IS
  'Max concurrent active campaigns. Updated when subscription_tier changes.';
```

**RLS impact:** None.

**Rollback:**
```sql
ALTER TABLE public.organizations DROP COLUMN active_campaign_limit;
```

---

## C. Stripe Dashboard Actions (Manual — Dame)

Dame creates these in Stripe Dashboard (test mode) and replaces the `price_test_*` placeholders:

### Monthly Prices (new amounts)
| Product | Price | Recurring | Notes |
|---------|-------|-----------|-------|
| DragonCandy Starter | $149.00 USD | Monthly | Replaces current $199 price |
| DragonCandy Growth | $449.00 USD | Monthly | Replaces current $499 price |
| DragonCandy Pro | $899.00 USD | Monthly | Replaces current $999 price |

### Annual Prices (20% off monthly)
| Product | Price | Recurring | Notes |
|---------|-------|-----------|-------|
| DragonCandy Starter Annual | $1,428.00/yr ($119/mo) | Yearly | Replaces current $1,908/yr |
| DragonCandy Growth Annual | $4,308.00/yr ($359/mo) | Yearly | Replaces current $4,788/yr |
| DragonCandy Pro Annual | $8,628.00/yr ($719/mo) | Yearly | Replaces current $9,588/yr |

### Per-Seat Prices (unchanged)
| Product | Price | Recurring |
|---------|-------|-----------|
| Starter seat | $29/seat/mo | Monthly | No change |
| Growth seat | $39/seat/mo | Monthly | No change |
| Pro seat | $49/seat/mo | Monthly | No change |

### After creating:
1. Copy each new Price ID (format: `price_1Xxxxx...`)
2. Update `docs/STRIPE_PRICES.md` with real IDs
3. Update Supabase Edge Function env vars or hardcoded IDs in:
   - `supabase/functions/create-checkout-session/index.ts` (lines 12-14, 19-21)
   - `supabase/functions/stripe-webhook/index.ts` (lines 457-462)

**Note:** Free and Enterprise do NOT need Stripe Prices. Free has no checkout flow.
Enterprise is custom/manual.

---

## D. Code Changes Required

| # | File | What Changes | Risk |
|---|------|-------------|------|
| 1 | `src/lib/pricing/tier-features.ts` | Update `TIER_PRICES` object: 199→149, 499→449, 999→899 (monthly); 159→119, 399→359, 799→719 (annual) | LOW |
| 2 | `src/pages/OrgBillingPage.tsx` | Update `TIER_PRICES` local object (lines 26-32) and upgrade text (line 122). **Better: import from tier-features.ts to eliminate duplication.** | LOW |
| 3 | `src/components/pricing/TierComparisonGrid.tsx` | No changes needed — reads from `TIER_PRICES` import | NONE |
| 4 | `src/components/pricing/SoftPaywallSheet.tsx` | No changes needed — reads from `TIER_PRICES` import | NONE |
| 5 | `supabase/functions/donny-orchestrator/agents/billing.ts` | Update `TIER_FEATURES` monthly_price values: 199→149, 499→449, 999→899. Add take_rate info to features arrays. | LOW |
| 6 | `supabase/functions/create-checkout-session/index.ts` | Replace placeholder `price_test_*` strings with real Stripe Price IDs (after Dame creates them) | MED |
| 7 | `supabase/functions/stripe-webhook/index.ts` | Replace `PRICE_TO_TIER` map keys with real Price IDs | HIGH |
| 8 | `supabase/functions/_shared/platform-fee.ts` | Replace flat `0.05` with a function that accepts `take_rate` parameter (passed by callers). Keep `calculatePlatformFee` signature backward-compatible. | HIGH |
| 9 | `supabase/functions/create-campaign-escrow/index.ts` | Look up org's `take_rate` from DB before calling `calculatePlatformFee`. Currently uses flat `PLATFORM_FEE_RATE` import. | HIGH |
| 10 | `supabase/functions/create-sponsorship-checkout/index.ts` | Same as #9 — look up org take_rate. | HIGH |
| 11 | `supabase/functions/release-creator-payout/index.ts` | Same — read org take_rate for payout split. | HIGH |
| 12 | `supabase/functions/release-sponsorship-payout/index.ts` | Same. | HIGH |
| 13 | `supabase/functions/resolve-dispute/index.ts` | Same. | HIGH |
| 14 | `supabase/functions/stripe-webhook/index.ts` | On `subscription.created/updated`: also set `take_rate` and `active_campaign_limit` based on tier. | HIGH |
| 15 | `supabase/seed/donny-knowledge-seed.ts` | Update plan descriptions with new prices and take rates. | LOW |
| 16 | `docs/STRIPE_PRICES.md` | Update documented amounts | LOW |
| 17 | `src/types/org.ts` | Add `take_rate: number` and `active_campaign_limit: number` to `Organization` interface | LOW |
| 18 | `src/integrations/supabase/types.ts` | Regenerated from schema (auto) | LOW |

---

## E. The "Stay on Free" Path

### Can a Free user create a campaign today?

**YES.** There is no paywall on campaign creation. The flow is:
1. User clicks "+" → Create Campaign
2. Donny generates brief (rate-limited to 1/week on free — `useTierGate('brief_generation')`)
3. User can create campaign via `CampaignWizard.tsx` → `CampaignFinalizeStep.tsx`
4. Campaign saved to `campaigns` table with `status = 'draft'`
5. User can publish and accept creator applications

**Where does the paywall trigger?**
- `useTierGate.ts` checks `TIER_FEATURES` for the `requiredTier` of each feature
- `SoftPaywallSheet.tsx` shows a bottom-sheet upsell when a gated feature is attempted
- Campaign creation itself is NOT gated (only brief generation is rate-limited)
- DragonDash delivery tier selection IS gated (requires `growth`)

**What's missing for v2:**
1. **Active campaign count enforcement** — No code checks whether an org exceeds its tier limit. The DB migration in Section B adds the column, but we need:
   - A check in `CampaignFinalizeStep.tsx` (or the edge function) that counts active campaigns for the org and blocks if `>= active_campaign_limit`
   - A soft paywall sheet showing "Upgrade to get more active campaigns"
2. **Take rate NOT shown to the user anywhere** during campaign creation or payment. The v2 model says Free users pay 10% take rate. Currently they pay 5% (same as everyone). No UI communicates the rate differential as an upgrade incentive.

**Verdict:** Free users CAN run paid campaigns today. The take rate just isn't tier-aware yet.

---

## F. Risk + Rollback

### What breaks if we ship just the UI (prices) without the backend (take-rate ladder)?

| Scenario | Impact | $ Exposure |
|----------|--------|-----------|
| Free user pays 5% instead of 10% | Under-collection | $0/mo (0 paying customers today) |
| Pro user pays 5% instead of 3% | Over-collection | $0/mo (0 Pro subscribers today) |
| UI shows $149 but Stripe charges $199 | User sees wrong price vs. charge | $0 (Stripe Prices haven't been swapped yet) |

**Current risk:** Negligible. Zero paying customers. But the take-rate backend MUST ship
before or simultaneously with the first real paying campaign to avoid inconsistency.

### Rollback strategy
1. `git revert <commit>` for any code changes
2. Revert Stripe Price IDs in edge function env vars (or Stripe Dashboard — archive new prices, re-activate old ones)
3. `ALTER TABLE organizations DROP COLUMN take_rate, DROP COLUMN active_campaign_limit;`
4. No data loss — `payment_events` is append-only, nothing is deleted

---

## G. Recommended Sequencing

### Prompt 2: Tier metadata + UI labels (frontend-only, no ledger touch)
- Update `src/lib/pricing/tier-features.ts` TIER_PRICES
- Update `src/pages/OrgBillingPage.tsx` (or deduplicate by importing)
- Update `supabase/functions/donny-orchestrator/agents/billing.ts`
- Update `supabase/seed/donny-knowledge-seed.ts`
- Update `docs/STRIPE_PRICES.md`
- `npm run build` to verify
- **Deletes:** Duplicated TIER_PRICES in OrgBillingPage (use import)
- **Simplifies:** Single source of tier price truth
- **Automates:** Nothing
- **Keystrokes removed:** 0 (backend change)

### Prompt 3: Schema migration — `take_rate` + `active_campaign_limit` columns
- Write and apply migrations from Section B
- Update `src/types/org.ts` with new fields
- Update `stripe-webhook/index.ts` to set `take_rate` and `active_campaign_limit` on tier change
- **Deletes:** The assumption that 5% is universal
- **Simplifies:** Rate lookup to a single column read
- **Automates:** Take-rate assignment on subscription changes

### Prompt 4: Payment edge functions read `take_rate` from org (ledger-critical)
- Modify `_shared/platform-fee.ts` to accept rate parameter
- Update all 5 edge functions that call it (escrow, sponsorship, release-creator, release-sponsorship, resolve-dispute)
- Each function queries org's `take_rate` before fee calculation
- **Deletes:** Hardcoded `0.05` constant
- **Simplifies:** Fee logic to "read from DB, multiply"
- **Automates:** Correct fee calculation per tier

### Prompt 5: Active campaign limit enforcement
- Frontend: add tier gate check in campaign creation flow
- Backend: add DB trigger or edge function check
- Soft paywall when limit reached
- **Deletes:** The gap between documented limits and actual enforcement
- **Simplifies:** User mental model (limit is real, not aspirational)
- **Automates:** Upgrade conversion at campaign-limit boundary

### Prompt 6 (optional): Stripe Price ID swap
- After Dame creates new prices in Stripe Dashboard
- Replace all `price_test_*` placeholders with real IDs
- Verify webhook tier mapping still works

---

## Appendix: Codebase vs. v2 Briefing Discrepancies

| Topic | v2 Briefing Says | Codebase Has | Winner |
|-------|-----------------|--------------|--------|
| Starter price | $149/mo | $199/mo | v2 Briefing (update code) |
| Growth price | $449/mo | $499/mo | v2 Briefing (update code) |
| Pro price | $899/mo | $999/mo | v2 Briefing (update code) |
| Annual discount | 20% | 20% | Match |
| Take rate | Ladder 10/7/5/3/2% | Flat 5% | v2 Briefing (update code) |
| Free campaign limit | 1 active | No enforcement | v2 Briefing (add enforcement) |
| Starter campaign limit | 3 active | No enforcement | v2 Briefing (add enforcement) |
| Growth campaign limit | 10 active | No enforcement | v2 Briefing (add enforcement) |
| DragonDash gating | Growth+ | Growth+ (tier-features.ts) | Match |
| Donny budgets | 50/500/2000/10000 | Same | Match |
| DragonShare fee | 20% | 20% (dragonshare-fee.ts) | Match (separate from campaign take rate) |
| PROJECT_CONTEXT.md | Lists take-rate ladder | Code doesn't implement it | PROJECT_CONTEXT.md is aspirational |

**Critical flag:** `PROJECT_CONTEXT.md` line 138 already describes the v2 take-rate ladder
as if it's implemented. It's NOT. The codebase still enforces flat 5%. This is a documentation
drift, not a code bug — but it means anyone reading PROJECT_CONTEXT.md would believe the ladder
is live. After this migration ships, it will be accurate.
