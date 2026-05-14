import { useState } from 'react';
import { Check, X, ArrowRightLeft, DollarSign, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreatorApplication } from '@/hooks/useCreatorApplications';
import type { Campaign } from '@/hooks/useCampaignQueries';
import type { EnrichedCampaignDetail } from '@/hooks/useCampaignDetailEnriched';
import { CreatorCampaignDetails } from '@/components/campaign-details/CreatorCampaignDetails';
import { CounterOfferThread } from '@/components/campaigns/CounterOfferThread';
import { CounterOfferModal } from '@/components/campaigns/CounterOfferModal';
import { useCounterOffers, useRespondToCounterOffer } from '@/hooks/useCounterOffers';
import { useAuth } from '@/hooks/useAuth';

interface AppliedPhaseViewProps {
  campaign: Campaign;
  enrichedDetail?: EnrichedCampaignDetail;
  application: CreatorApplication;
}

export function AppliedPhaseView({ campaign, enrichedDetail, application }: AppliedPhaseViewProps) {
  const isCounterOffer = application.status === 'counter_offered';
  const { user } = useAuth();
  const { data: counterOffers = [] } = useCounterOffers(application.id);
  const respondToOffer = useRespondToCounterOffer();
  const [showCounterModal, setShowCounterModal] = useState(false);

  const latestPendingOffer = counterOffers
    .filter(o => o.status === 'pending' && o.sender_id !== user?.id)
    .at(-1);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return null;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

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

        {!isCounterOffer && (
          <div className="mt-3 p-2 rounded-lg text-xs text-center bg-yellow-50 text-yellow-800">
            {`Waiting for ${application.business_profile?.business_name || 'the business'} to respond`}
          </div>
        )}
      </div>

      {/* Counter Offer Negotiation */}
      {counterOffers.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border-2 border-orange-400 space-y-3">
          <CounterOfferThread counterOffers={counterOffers} currentUserId={user?.id} />

          {isCounterOffer && latestPendingOffer && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800 mb-1">New Counter Offer</p>
                <p className="text-sm text-amber-700">{latestPendingOffer.message}</p>
                <div className="flex gap-3 mt-2">
                  {latestPendingOffer.proposed_rate && (
                    <span className="text-xs font-medium flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> {formatCurrency(latestPendingOffer.proposed_rate)}
                    </span>
                  )}
                  {latestPendingOffer.proposed_timeline && (
                    <span className="text-xs font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {latestPendingOffer.proposed_timeline}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 rounded-full bg-teal-400 hover:bg-teal-500 text-white font-semibold"
                  onClick={() => respondToOffer.mutate({
                    counterOfferId: latestPendingOffer.id,
                    applicationId: application.id,
                    response: 'accepted',
                  })}
                  disabled={respondToOffer.isPending}
                >
                  <Check className="h-4 w-4 mr-1" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 rounded-full"
                  onClick={() => setShowCounterModal(true)}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-1" /> Counter
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-full"
                  onClick={() => respondToOffer.mutate({
                    counterOfferId: latestPendingOffer.id,
                    applicationId: application.id,
                    response: 'declined',
                  })}
                  disabled={respondToOffer.isPending}
                >
                  <X className="h-4 w-4 mr-1" /> Decline
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Full Campaign Brief */}
      <div className="bg-white rounded-2xl p-4">
        <div className="text-sm font-bold text-gray-900 mb-3">CAMPAIGN BRIEF</div>
        <CreatorCampaignDetails
          campaign={campaign}
          enrichedDetail={enrichedDetail}
          hasApplied={true}
        />
      </div>

      <CounterOfferModal
        open={showCounterModal}
        onOpenChange={setShowCounterModal}
        applicationId={application.id}
        senderRole="creator"
        currentRate={latestPendingOffer?.proposed_rate || application.proposed_rate}
        currentTimeline={latestPendingOffer?.proposed_timeline || application.proposed_timeline}
      />
    </div>
  );
}
