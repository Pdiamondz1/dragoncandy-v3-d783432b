import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, X, Clock, DollarSign, User, ArrowRightLeft, Eye, ImageIcon } from 'lucide-react';
import { useManageApplication } from '@/hooks/useManageApplication';
import { CampaignApplication } from '@/types/applications';
import { ApplicationStatusBadge } from './ApplicationStatusBadge';
import { JointApprovalCard } from './JointApprovalCard';
import { CounterOfferModal } from './CounterOfferModal';
import { CounterOfferThread } from './CounterOfferThread';
import { useCounterOffers, useRespondToCounterOffer } from '@/hooks/useCounterOffers';
import { useAuth } from '@/hooks/useAuth';
import { useResolvedLogoUrl, useResolvedAvatarUrl } from '@/hooks/useSignedUrl';
import { formatSkillLabel } from '@/lib/skillUtils';
import { InlineRating } from '@/components/reviews/InlineRating';

interface ApplicationCardProps {
  application: CampaignApplication;
  showActions?: boolean;
  isSponsored?: boolean;
  userRole?: 'brand' | 'restaurant';
  campaignEscrowStatus?: string | null;
  campaignBudget?: number | null;
  campaignDeliveryFee?: number | null;
  campaignDeliveryType?: string | null;
  onViewProfile?: () => void;
  onPayEscrow?: () => void;
  isPayingEscrow?: boolean;
}

const ApplicationCardComponent: React.FC<ApplicationCardProps> = ({
  application,
  showActions = false,
  isSponsored = false,
  userRole,
  campaignEscrowStatus,
  campaignBudget,
  campaignDeliveryFee: _campaignDeliveryFee,
  campaignDeliveryType: _campaignDeliveryType,
  onViewProfile,
  onPayEscrow,
  isPayingEscrow: _isPayingEscrow,
}) => {
  const manageApplication = useManageApplication();
  const [showCounterModal, setShowCounterModal] = useState(false);
  const { data: counterOffers = [] } = useCounterOffers(application.id);
  const respondToOffer = useRespondToCounterOffer();
  const { user } = useAuth();
  const resolvedPortfolioUrl = useResolvedLogoUrl(application.portfolio_url);
  const resolvedAvatarUrl = useResolvedAvatarUrl(application.creator_profile?.avatar_url);

  const latestCreatorOffer = counterOffers
    .filter(o => o.status === 'pending' && o.sender_id !== user?.id)
    .at(-1);

  const effectiveRate = application.agreed_rate
    ?? latestCreatorOffer?.proposed_rate
    ?? application.proposed_rate;

  const handleAccept = async () => {
    if (application.status === 'counter_offered' && latestCreatorOffer) {
      await respondToOffer.mutateAsync({
        counterOfferId: latestCreatorOffer.id,
        applicationId: application.id,
        response: 'accepted',
        currentUserRole: 'business',
        agreedRate: latestCreatorOffer.proposed_rate || undefined,
      });
    } else {
      await manageApplication.mutateAsync({
        applicationId: application.id,
        status: 'accepted',
      });
    }
    onPayEscrow?.();
  };

  const handleReject = async () => {
    if (application.status === 'counter_offered' && latestCreatorOffer) {
      await respondToOffer.mutateAsync({
        counterOfferId: latestCreatorOffer.id,
        applicationId: application.id,
        response: 'declined',
        currentUserRole: 'business',
      });
    } else {
      await manageApplication.mutateAsync({
        applicationId: application.id,
        status: 'rejected',
      });
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar className="shrink-0">
            <AvatarImage src={resolvedAvatarUrl} alt={application.creator_profile?.creator_name || 'Creator avatar'} />
            <AvatarFallback>
              <User className="h-4 w-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">
                {application.creator_profile?.creator_name || 'Anonymous Creator'}
              </CardTitle>
              <ApplicationStatusBadge status={application.status} />
              <InlineRating
                averageRating={application.creator_profile?.average_rating}
                totalReviews={application.creator_profile?.total_reviews}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Applied on {formatDate(application.created_at)}
            </p>
          </div>
        </div>
        {onViewProfile && (
          <Button variant="outline" size="sm" onClick={onViewProfile} className="mt-2 rounded-full w-full sm:w-auto">
            <Eye className="h-4 w-4 mr-1" />
            View Profile
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {application.creator_profile?.bio && (
          <div>
            <h4 className="font-medium mb-1">About</h4>
            <p className="text-sm text-muted-foreground">{application.creator_profile.bio}</p>
          </div>
        )}

        {application.creator_profile?.skills && application.creator_profile.skills.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Skills</h4>
            <div className="flex flex-wrap gap-1">
              {application.creator_profile.skills.map((skill, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {formatSkillLabel(skill)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="font-medium mb-1">Introduction Message</h4>
          <p className="text-sm text-muted-foreground bg-dc-teal/[0.04] p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        {resolvedPortfolioUrl && (
          <div>
            <h4 className="font-medium mb-1 flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-dc-teal" aria-hidden="true" />
              Portfolio Sample
            </h4>
            <button
              type="button"
              onClick={() => window.open(resolvedPortfolioUrl, '_blank')}
              className="w-20 h-20 rounded-lg overflow-hidden border-2 border-dc-teal/15 hover:border-dc-teal transition-colors"
            >
              {/\.(mp4|mov|webm|avi)(\?|$)/i.test(application.portfolio_url || '') ? (
                <video src={resolvedPortfolioUrl} preload="metadata" muted className="w-full h-full object-cover" />
              ) : (
                <img
                  src={resolvedPortfolioUrl}
                  alt="Portfolio sample"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {application.proposed_timeline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-dc-teal" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Proposed Timeline</p>
                <p className="text-sm font-medium">{application.proposed_timeline}</p>
              </div>
            </div>
          )}

          {application.proposed_rate && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Proposed Rate</p>
                <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
              </div>
            </div>
          )}
        </div>

        {counterOffers.length > 0 && (
          <CounterOfferThread counterOffers={counterOffers} currentUserId={user?.id} />
        )}

        {application.status === 'accepted' && campaignEscrowStatus !== 'held' && campaignEscrowStatus !== 'released' && (
          <div className="pt-4 border-t">
            <Badge className="bg-teal-100 text-teal-800 border-teal-300">
              <Check className="h-3 w-3 mr-1" aria-hidden="true" />
              Accepted
            </Badge>
          </div>
        )}

        {/* Accepted & Escrow paid */}
        {application.status === 'accepted' && (campaignEscrowStatus === 'held' || campaignEscrowStatus === 'released') && (
          <div className="pt-4 border-t">
            <Badge variant="default" className="bg-green-600 text-white">
              <Check className="h-3 w-3 mr-1" aria-hidden="true" />
              Escrow Paid — Project Active
            </Badge>
          </div>
        )}

        {showActions && (application.status === 'pending' || application.status === 'counter_offered') && (
          <>
            {isSponsored && userRole ? (
              <div className="pt-4 border-t">
                <JointApprovalCard
                  application={application as CampaignApplication & { brand_approval_status?: string; restaurant_approval_status?: string; final_approval_status?: string }}
                  userRole={userRole}
                />
              </div>
            ) : counterOffers.some(o => o.status === 'pending' && o.sender_id === user?.id) ? (
              <div className="pt-4 border-t">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
                  Counter offer pending — waiting for response
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button
                  onClick={handleAccept}
                  disabled={manageApplication.isPending || respondToOffer.isPending}
                  className="sm:flex-1"
                  size="sm"
                >
                  <Check className="h-4 w-4 mr-2" aria-hidden="true" />
                  Accept ({formatCurrency(effectiveRate ?? null)})
                </Button>
                {!application.agreed_rate && (!campaignBudget || effectiveRate == null || effectiveRate > campaignBudget) && (
                  <Button
                    onClick={() => setShowCounterModal(true)}
                    variant="secondary"
                    disabled={manageApplication.isPending || respondToOffer.isPending}
                    className="sm:flex-1"
                    size="sm"
                  >
                    <ArrowRightLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                    Counter
                  </Button>
                )}
                <Button
                  onClick={handleReject}
                  variant="outline"
                  disabled={manageApplication.isPending || respondToOffer.isPending}
                  className="sm:flex-1"
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" aria-hidden="true" />
                  Reject
                </Button>
              </div>
            )}
          </>
        )}

        <CounterOfferModal
          open={showCounterModal}
          onOpenChange={setShowCounterModal}
          applicationId={application.id}
          senderRole="business"
          currentRate={effectiveRate}
          currentTimeline={latestCreatorOffer?.proposed_timeline || application.proposed_timeline}
        />
      </CardContent>
    </Card>
  );
};

export const ApplicationCard = React.memo(ApplicationCardComponent);