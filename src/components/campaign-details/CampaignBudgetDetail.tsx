import { DollarSign } from 'lucide-react';
import { formatBudget } from '@/lib/campaignUtils';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignBudgetDetailProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
  };
}

export function CampaignBudgetDetail({ campaign }: CampaignBudgetDetailProps) {
  return (
    <CampaignDetailSection title="Budget">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-dc-teal" />
        <span className="text-lg font-bold text-gray-900">
          {formatBudget(campaign)}
        </span>
        {campaign.pricing_type === 'fixed' && (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            Fixed Price
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Payment via Stripe upon approval
      </p>
    </CampaignDetailSection>
  );
}
