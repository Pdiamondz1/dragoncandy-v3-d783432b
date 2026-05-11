import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CampaignDetailsOverview } from '@/components/campaigns/CampaignDetailsOverview';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { CampaignPhase } from '@/lib/campaignPhase';

interface CollapsibleCampaignDetailsProps {
  campaign: Campaign;
  phase: CampaignPhase;
}

export const CollapsibleCampaignDetails: React.FC<CollapsibleCampaignDetailsProps> = ({
  campaign,
  phase,
}) => {
  const defaultOpen = phase === 'pre_hire' || phase === 'cancelled';
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
            <span className="font-bold text-gray-900 text-sm">Campaign Details</span>
            {isOpen
              ? <ChevronUp className="h-4 w-4 text-gray-500" />
              : <ChevronDown className="h-4 w-4 text-gray-500" />
            }
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 pt-1 border-t border-gray-100">
            <CampaignDetailsOverview campaign={campaign} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
