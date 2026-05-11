import type { CreatorApplication } from '@/hooks/useCreatorApplications';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';

interface AppliedPhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  application: CreatorApplication;
}

export function AppliedPhaseView({ campaign, enrichedDetail, application }: AppliedPhaseViewProps) {
  const isCounterOffer = application.status === 'counter_offered';

  return (
    <div className="space-y-3 px-4 pb-24">
      {/* Application Status Card */}
      <div className={`bg-white rounded-2xl p-4 border-2 ${isCounterOffer ? 'border-orange-400' : 'border-yellow-400'}`}>
        <div className="text-sm font-bold text-gray-900 mb-2">YOUR APPLICATION</div>

        {application.proposed_rate != null && (
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Proposed rate</span>
            <span className="font-semibold">${application.proposed_rate}</span>
          </div>
        )}

        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Applied</span>
          <span>{new Date(application.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {application.proposed_timeline && (
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Timeline</span>
            <span>{application.proposed_timeline}</span>
          </div>
        )}

        <div className={`mt-3 p-2 rounded-lg text-xs text-center ${
          isCounterOffer ? 'bg-orange-50 text-orange-800' : 'bg-yellow-50 text-yellow-800'
        }`}>
          {isCounterOffer
            ? 'The business sent a counter offer — review and respond'
            : `Waiting for ${application.business_profile?.business_name || 'the business'} to respond`}
        </div>
      </div>

      {/* Full Campaign Brief */}
      <div className="bg-white rounded-2xl p-4">
        <div className="text-sm font-bold text-gray-900 mb-3">CAMPAIGN BRIEF</div>
        <CreatorCampaignDetails
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          hasApplied={true}
        />
      </div>
    </div>
  );
}
