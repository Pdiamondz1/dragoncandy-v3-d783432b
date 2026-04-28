import { DollarSign, Shield, Lock, UserCheck } from 'lucide-react';
import { formatBudget } from '@/lib/campaignUtils';
import { CampaignDetailSection } from './CampaignDetailSection';

interface CampaignBudgetDetailProps {
  campaign: {
    pricing_type?: string | null;
    fixed_price?: number | null;
    budget_min?: number | null;
    budget_max?: number | null;
    per_creator_cap?: number | null;
    usage_rights_days?: number | null;
    exclusivity_days?: number | null;
  };
}

export function CampaignBudgetDetail({ campaign }: CampaignBudgetDetailProps) {
  return (
    <CampaignDetailSection title="Budget & Terms">
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

      {(campaign.per_creator_cap || campaign.usage_rights_days || campaign.exclusivity_days) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
          {campaign.per_creator_cap != null && (
            <div className="flex items-start gap-2">
              <UserCheck className="w-4 h-4 text-dc-teal mt-0.5 shrink-0" />
              <div>
                <span className="text-[11px] text-gray-500 uppercase">Per-Creator Cap</span>
                <p className="text-sm font-medium text-gray-900">${campaign.per_creator_cap}</p>
              </div>
            </div>
          )}
          {campaign.usage_rights_days != null && (
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-dc-teal mt-0.5 shrink-0" />
              <div>
                <span className="text-[11px] text-gray-500 uppercase">Usage Rights</span>
                <p className="text-sm font-medium text-gray-900">{campaign.usage_rights_days} days</p>
              </div>
            </div>
          )}
          {campaign.exclusivity_days != null && (
            <div className="flex items-start gap-2">
              <Lock className="w-4 h-4 text-dc-teal mt-0.5 shrink-0" />
              <div>
                <span className="text-[11px] text-gray-500 uppercase">Exclusivity</span>
                <p className="text-sm font-medium text-gray-900">{campaign.exclusivity_days} days</p>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-500 mt-1">
        Payment via Stripe upon approval
      </p>
    </CampaignDetailSection>
  );
}
