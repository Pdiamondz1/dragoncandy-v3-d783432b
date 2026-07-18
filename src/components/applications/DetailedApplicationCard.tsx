
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, DollarSign, Building, MessageSquare, X, Check, ArrowRightLeft, Share2, ArrowRight, ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ApplicationStatusBadge } from '@/components/campaigns/ApplicationStatusBadge';
import { ContactRestaurantModal } from '@/components/creator-profile/ContactRestaurantModal';
import { CounterOfferModal } from '@/components/campaigns/CounterOfferModal';
import { CounterOfferThread } from '@/components/campaigns/CounterOfferThread';
import { CampaignApplication } from '@/types/applications';
import { useWithdrawApplication } from '@/hooks/useWithdrawApplication';
import { useCounterOffers, useRespondToCounterOffer } from '@/hooks/useCounterOffers';
import { useApplicationCollaboration } from '@/hooks/useApplicationCollaboration';
import { useAuth } from '@/hooks/useAuth';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { JointApprovalStatus } from './JointApprovalStatus';
import { ReadinessGate } from '@/components/ReadinessGate';
import { DragonCandyOutstandProvider } from '@/integrations/outstand/Provider';
import { CrossPostPrompt } from '@/components/outstand/CrossPostPrompt';
import { formatDistanceToNow } from 'date-fns';

interface DetailedApplicationCardProps {
  application: CampaignApplication;
}

export const DetailedApplicationCard: React.FC<DetailedApplicationCardProps> = ({ application }) => {
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [showCrossPost, setShowCrossPost] = useState(false);
  const navigate = useNavigate();
  const withdrawApplication = useWithdrawApplication();
  const { data: counterOffers = [] } = useCounterOffers(application.id);
  const { data: collaboration } = useApplicationCollaboration(application.id, application.status === 'accepted');
  const respondToOffer = useRespondToCounterOffer();
  const { user } = useAuth();
  const resolvedLogoUrl = useResolvedLogoUrl(application.campaign?.business_profile?.logo_url);
  const resolvedPortfolioUrl = useResolvedLogoUrl(application.portfolio_url);

  const latestPendingOffer = counterOffers
    .filter(o => o.status === 'pending' && o.sender_id !== user?.id)
    .at(-1);

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
  
  const handleWithdraw = () => {
    withdrawApplication.mutate({
      applicationId: application.id,
      campaignTitle: application.campaign?.title,
    });
    setShowWithdrawDialog(false);
  };

  const handleAcceptOffer = () => {
    if (!latestPendingOffer) return;
    respondToOffer.mutate({
      counterOfferId: latestPendingOffer.id,
      applicationId: application.id,
      response: 'accepted',
      currentUserRole: 'creator',
      agreedRate: latestPendingOffer.proposed_rate || undefined,
    });
  };

  const handleDeclineOffer = () => {
    if (!latestPendingOffer) return;
    respondToOffer.mutate({
      counterOfferId: latestPendingOffer.id,
      applicationId: application.id,
      response: 'declined',
      currentUserRole: 'creator',
    });
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {application.campaign?.title || 'Campaign Title'}
            </CardTitle>
            
            {/* Restaurant Information */}
            {application.campaign?.business_profile && (
              <div className="flex items-center gap-2 mt-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={resolvedLogoUrl} />
                  <AvatarFallback>
                    <Building className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {application.campaign.business_profile.business_name}
                  </p>
                  {application.campaign.business_profile.location && (
                    <p className="text-xs text-muted-foreground">
                      {application.campaign.business_profile.location}
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground mt-2">
              Applied on {formatDate(application.created_at)}
            </p>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </div>
        {application.status === 'pending' && (
          <div className="mt-2">
            <p className="text-sm text-gray-500">Awaiting business review</p>
            <p className="text-xs text-gray-400">
              Applied {formatDistanceToNow(new Date(application.created_at), { addSuffix: true })}
            </p>
          </div>
        )}
        {application.brand_approval_status && application.brand_approval_status !== 'pending' && (
          <JointApprovalStatus
            brandApprovalStatus={application.brand_approval_status || 'pending'}
            restaurantApprovalStatus={application.restaurant_approval_status || 'pending'}
            finalApprovalStatus={application.final_approval_status || 'pending'}
            viewerRole="creator"
          />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium mb-1">Your Message</h4>
          <p className="text-sm text-muted-foreground bg-dc-teal/[0.04] p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        {resolvedPortfolioUrl && (
          <div>
            <h4 className="font-medium mb-1 flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-dc-teal" aria-hidden="true" />
              Your Sample
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
              <Clock className="h-4 w-4 text-dc-teal" />
              <div>
                <p className="text-xs text-muted-foreground">Timeline</p>
                <p className="text-sm font-medium">{application.proposed_timeline}</p>
              </div>
            </div>
          )}

          {application.proposed_rate && (
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Proposed Rate</p>
                <p className="text-sm font-medium">{formatCurrency(application.proposed_rate)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Counter-offer negotiation thread */}
        {counterOffers.length > 0 && (
          <CounterOfferThread counterOffers={counterOffers} currentUserId={user?.id} />
        )}

        {/* Counter-offered: show response actions for creator */}
        {application.status === 'counter_offered' && latestPendingOffer && (
          <div className="pt-4 border-t space-y-3">
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
              <ReadinessGate role="creator" require={{ stripe: true }} mode="hard">
                <Button size="sm" className="flex-1" onClick={handleAcceptOffer} disabled={respondToOffer.isPending}>
                  <Check className="h-4 w-4 mr-1" /> Accept
                </Button>
              </ReadinessGate>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => setShowCounterModal(true)}>
                <ArrowRightLeft className="h-4 w-4 mr-1" /> Counter
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={handleDeclineOffer} disabled={respondToOffer.isPending}>
                <X className="h-4 w-4 mr-1" /> Decline
              </Button>
            </div>
          </div>
        )}

        {/* Pending Application Actions */}
        {application.status === 'pending' && (
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowWithdrawDialog(true)}
            >
              <X className="h-4 w-4 mr-2" />
              Withdraw Application
            </Button>
          </div>
        )}

        {/* Accepted Application Actions */}
        {application.status === 'accepted' && 
         application.campaign?.business_profile && (
          <div className="pt-4 border-t space-y-2">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-2">
              <p className="text-sm font-medium text-green-800">
                ✅ Your application has been accepted!
              </p>
              <p className="text-xs text-green-700 mt-1">
                The restaurant will pay escrow to finalize the project. You'll see the project in your dashboard once payment is confirmed.
              </p>
            </div>
            {collaboration?.id ? (
              <Button
                onClick={() => navigate(`/projects/${collaboration.id}`)}
                className="w-full rounded-full bg-dc-teal text-white font-bold py-3 hover:bg-teal-500"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Go to Project
              </Button>
            ) : (
              <Button disabled className="w-full rounded-full font-bold py-3" variant="outline">
                <Clock className="h-4 w-4 mr-2" />
                Awaiting Project Setup
              </Button>
            )}
            <DragonCandyOutstandProvider>
              <Button
                onClick={() => setShowCrossPost(true)}
                className="w-full bg-dc-teal text-white rounded-full font-bold hover:bg-teal-500"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Cross-Post to Your Socials
              </Button>
              <CrossPostPrompt
                open={showCrossPost}
                onOpenChange={setShowCrossPost}
                campaignTitle={application.campaign?.title ?? 'Campaign'}
                creatorName={application.creator_profile?.creator_name ?? 'Creator'}
                mediaUrls={[]}
                originalCaption={application.campaign?.description ?? ''}
              />
            </DragonCandyOutstandProvider>
            <ContactRestaurantModal
              restaurant={{
                user_id: application.campaign.business_profile.user_id,
                business_name: application.campaign.business_profile.business_name,
                logo_url: application.campaign.business_profile.logo_url,
                description: application.campaign.business_profile.description,
              }}
              campaignTitle={application.campaign.title}
              trigger={
                <Button className="w-full" variant="outline">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Message {application.campaign.business_profile.business_name}
                </Button>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
    
    {/* Withdraw Confirmation Dialog */}
    <AlertDialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Withdraw Application?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to withdraw your application for "{application.campaign?.title}"? 
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleWithdraw}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Withdraw
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Counter Offer Modal for creator */}
    <CounterOfferModal
      open={showCounterModal}
      onOpenChange={setShowCounterModal}
      applicationId={application.id}
      senderRole="creator"
      currentRate={latestPendingOffer?.proposed_rate || application.proposed_rate}
      currentTimeline={latestPendingOffer?.proposed_timeline || application.proposed_timeline}
    />
    </>
  );
};

