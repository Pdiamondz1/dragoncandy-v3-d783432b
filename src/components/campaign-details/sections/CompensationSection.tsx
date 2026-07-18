import { DollarSign } from 'lucide-react';
import { AppCard } from '@/components/app/AppCard';
import { CostBreakdown } from '@/components/campaigns/CostBreakdown';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
import { useAgreedValue } from '@/hooks/useAgreedValue';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import type { Campaign } from '@/hooks/useCampaignQueries';

interface CompensationSectionProps {
  campaign: Campaign;
  campaignId: string;
  role: 'business' | 'creator';
}

function formatCurrency(amount: number | undefined | null): string {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function CompensationSection({ campaign, campaignId, role }: CompensationSectionProps) {
  const { data: deliverables } = useCampaignDeliverables(campaignId);
  const { data: agreedValue } = useAgreedValue(campaignId);
  const deliverableCount = deliverables?.length || campaign.deliverables?.length || 1;
  const displayBudget = agreedValue ?? campaign.fixed_price ?? campaign.budget_max ?? 0;
  const tier = mapDeliveryType(campaign.delivery_type);
  const premiumFee = tier ? TIER_LIMITS[tier].fee : 0;
  const hasAgreedValue = agreedValue != null;

  return (
    <AppCard className="space-y-3">
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">
              {hasAgreedValue ? 'Agreed Value' : (campaign.pricing_type === 'fixed' || campaign.fixed_price != null) ? 'Fixed Price' : 'Proposed Budget'}
            </span>
            <p className="text-sm font-medium text-gray-900">
              {formatCurrency(displayBudget)}
            </p>
          </div>
        </div>

        {role === 'business' ? (
          <CostBreakdown
            deliverableCount={deliverableCount}
            budgetTotal={displayBudget + premiumFee}
            baseCostPerDeliverable={deliverableCount > 0 ? displayBudget / deliverableCount : displayBudget}
            premiumAmount={premiumFee}
            deliveryType={tier ?? ''}
          />
        ) : (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-teal-700">
              {hasAgreedValue
                ? `Your earnings: ${formatCurrency(agreedValue)}`
                : (campaign.pricing_type === 'fixed' || campaign.fixed_price != null)
                  ? `You will receive ${formatCurrency(campaign.fixed_price)}`
                  : `Your potential earnings: up to ${formatCurrency(campaign.budget_max)}`}
            </p>
            <p className="text-xs text-gray-500 mt-1">Payment via Stripe upon approval</p>
          </div>
        )}
    </AppCard>
  );
}
