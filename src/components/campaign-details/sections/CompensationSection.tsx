import { DollarSign, Shield, Lock, UserCheck } from 'lucide-react';
import CostBreakdown from '@/components/campaigns/CostBreakdown';
import { useCampaignDeliverables } from '@/hooks/useCampaignDeliverables';
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
  const deliverableCount = deliverables?.length ?? campaign.deliverables?.length ?? 1;
  const perCreatorCap = campaign.per_creator_cap ?? campaign.budget_max ?? 0;
  const tier = mapDeliveryType(campaign.delivery_type);
  const premiumFee = tier ? TIER_LIMITS[tier].fee : 0;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Compensation & Terms</h3>
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0" />
          <div>
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Budget Range</span>
            <p className="text-sm font-medium text-gray-900">
              {formatCurrency(campaign.budget_min)} — {formatCurrency(campaign.budget_max)}
            </p>
          </div>
        </div>

        {campaign.per_creator_cap != null && (
          <div className="flex items-center gap-3">
            <UserCheck className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Per-Creator Cap</span>
              <p className="text-sm font-medium text-gray-900">{formatCurrency(campaign.per_creator_cap)}</p>
            </div>
          </div>
        )}

        {campaign.usage_rights_days != null && (
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Usage Rights</span>
              <p className="text-sm font-medium text-gray-900">{campaign.usage_rights_days} days</p>
            </div>
          </div>
        )}

        {campaign.exclusivity_days != null && (
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-dc-teal flex-shrink-0" />
            <div>
              <span className="text-[11px] text-gray-500 uppercase tracking-wider">Exclusivity</span>
              <p className="text-sm font-medium text-gray-900">{campaign.exclusivity_days} days</p>
            </div>
          </div>
        )}

        {role === 'business' ? (
          <CostBreakdown
            deliverableCount={deliverableCount}
            budgetTotal={perCreatorCap + premiumFee}
            baseCostPerDeliverable={deliverableCount > 0 ? perCreatorCap / deliverableCount : perCreatorCap}
            premiumAmount={premiumFee}
            deliveryType={tier ?? ''}
          />
        ) : (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-teal-700">
              Your potential earnings: up to {formatCurrency(campaign.per_creator_cap ?? campaign.budget_max)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Payment via Stripe upon approval</p>
          </div>
        )}
      </div>
    </div>
  );
}
