import { useState } from 'react';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import type { CreatorCollaboration } from '@/hooks/useCreatorCollaborations';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';

interface CompletedPhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  collaboration: CreatorCollaboration;
}

type CompletedTab = 'summary' | 'brief';

export function CompletedPhaseView({ campaign, enrichedDetail, collaboration }: CompletedPhaseViewProps) {
  const [activeTab, setActiveTab] = useState<CompletedTab>('summary');

  const tabs: { id: CompletedTab; label: string }[] = [
    { id: 'summary', label: 'SUMMARY' },
    { id: 'brief', label: 'BRIEF' },
  ];

  const deliverablesStatus = collaboration.deliverables_status as Record<string, string> | null;
  const campaignDeliverables = campaign.ai_analysis?.deliverables as
    | { id: string; content_type: string; platform?: string; description?: string }[]
    | undefined;
  const price = collaboration.campaign?.fixed_price ?? campaign.fixed_price ?? 0;
  const platformFee = Math.round(price * 0.1);
  const netEarnings = price - platformFee;

  return (
    <div>
      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-3 text-sm font-bold transition-colors ${
              activeTab === tab.id
                ? 'text-dc-teal border-b-[3px] border-dc-teal'
                : 'text-gray-400 border-b-[3px] border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' ? (
        <div className="px-4 pt-4 pb-24 space-y-3">
          {/* Delivered Items */}
          {campaignDeliverables && campaignDeliverables.length > 0 && (
            <div className="bg-white rounded-2xl p-4">
              <div className="text-sm font-bold text-gray-900 mb-3">DELIVERED</div>
              <div className="space-y-2">
                {campaignDeliverables.map((d) => {
                  const status = deliverablesStatus?.[d.id] || 'pending';
                  return (
                    <div key={d.id} className="flex items-center justify-between p-2 bg-green-50 rounded-lg">
                      <span className="text-sm text-gray-700">
                        {d.content_type === 'video' ? '\u{1F4F9}' : '\u{1F4F8}'} {d.description || d.content_type}
                      </span>
                      <span className="text-xs font-semibold text-green-700">
                        {status === 'approved' ? '✓ Approved' : status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Breakdown */}
          <div className="bg-white rounded-2xl p-4">
            <div className="text-sm font-bold text-gray-900 mb-3">PAYMENT</div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Campaign fee</span>
                <span className="font-semibold text-gray-900">${price}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Platform fee (10%)</span>
                <span className="text-gray-900">-${platformFee}</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between text-sm">
                <span className="font-bold text-gray-900">Net earnings</span>
                <span className="font-bold text-dc-teal">${netEarnings}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-24">
          <CreatorCampaignDetails
            campaign={campaign}
            enrichedDetail={enrichedDetail}
            hasApplied={true}
          />
        </div>
      )}
    </div>
  );
}
