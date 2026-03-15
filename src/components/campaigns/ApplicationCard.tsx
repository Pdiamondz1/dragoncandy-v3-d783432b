import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Check, X, Clock, DollarSign, User, ArrowRightLeft, CreditCard, Loader2 } from 'lucide-react';
import { useManageApplication } from '@/hooks/useManageApplication';
import { CampaignApplication } from '@/types/applications';
import ApplicationStatusBadge from './ApplicationStatusBadge';
import { JointApprovalCard } from './JointApprovalCard';
import CounterOfferModal from './CounterOfferModal';
import CounterOfferThread from './CounterOfferThread';
import { useCounterOffers } from '@/hooks/useCounterOffers';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ApplicationCardProps {
  application: CampaignApplication;
  showActions?: boolean;
  isSponsored?: boolean;
  userRole?: 'brand' | 'restaurant';
  campaignEscrowStatus?: string | null;
}

const ApplicationCard: React.FC<ApplicationCardProps> = ({ 
  application, 
  showActions = false,
  isSponsored = false,
  userRole,
  campaignEscrowStatus
}) => {
  const manageApplication = useManageApplication();
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [isPayingEscrow, setIsPayingEscrow] = useState(false);
  const { data: counterOffers = [] } = useCounterOffers(application.id);
  const { user } = useAuth();

  const handleAccept = async () => {
    await manageApplication.mutateAsync({
      applicationId: application.id,
      status: 'accepted',
    });
  };

  const handleReject = async () => {
    await manageApplication.mutateAsync({
      applicationId: application.id,
      status: 'rejected',
    });
  };

  const handlePayEscrow = async () => {
    setIsPayingEscrow(true);
    try {
      // Determine the agreed amount from the latest accepted counter-offer or proposed rate
      const acceptedOffer = counterOffers.find(o => o.status === 'accepted');
      const agreedAmount = acceptedOffer?.proposed_rate || application.proposed_rate;

      if (!agreedAmount) {
        toast({ title: 'No agreed amount found', description: 'Cannot proceed with payment.', variant: 'destructive' });
        return;
      }

      // Open blank tab synchronously to avoid popup blocker
      const newTab = window.open('about:blank', '_blank');

      const { data, error } = await supabase.functions.invoke('create-campaign-escrow', {
        body: {
          campaignId: application.campaign_id,
          amount: agreedAmount,
          deliveryFee: 0,
          campaignTitle: application.campaign?.title || 'Campaign',
          deliveryType: 'standard',
        },
      });

      if (error) throw error;

      if (data?.alreadyPaid) {
        toast({ title: 'Already paid', description: 'Escrow has already been paid for this campaign.' });
        newTab?.close();
        return;
      }

      if (data?.url) {
        if (newTab) {
          newTab.location.href = data.url;
        } else {
          window.location.href = data.url;
        }
      }
    } catch (error) {
      console.error('Failed to initiate escrow payment:', error);
      toast({ title: 'Payment failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsPayingEscrow(false);
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

  // Determine agreed amount for display
  const acceptedOffer = counterOffers.find(o => o.status === 'accepted');
  const agreedAmount = acceptedOffer?.proposed_rate || application.proposed_rate;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={application.creator_profile?.avatar_url} />
              <AvatarFallback>
                <User className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">
                {application.creator_profile?.creator_name || 'Anonymous Creator'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Applied on {formatDate(application.created_at)}
              </p>
            </div>
          </div>
          <ApplicationStatusBadge status={application.status} />
        </div>
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
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="font-medium mb-1">Introduction Message</h4>
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded">
            {application.intro_message || 'No message provided'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {application.proposed_timeline && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Proposed Timeline</p>
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

        {counterOffers.length > 0 && (
          <CounterOfferThread counterOffers={counterOffers} currentUserId={user?.id} />
        )}

        {/* Accepted: Show Pay Escrow button if escrow not yet held */}
        {application.status === 'accepted' && campaignEscrowStatus !== 'held' && campaignEscrowStatus !== 'released' && (
          <div className="pt-4 border-t">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-medium text-amber-800">
                💳 Payment required to start the project
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Pay the agreed amount of {formatCurrency(agreedAmount || 0)} into escrow. The creator will begin work after payment is confirmed.
              </p>
            </div>
            <Button
              onClick={handlePayEscrow}
              disabled={isPayingEscrow}
              className="w-full"
              size="lg"
            >
              {isPayingEscrow ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opening Checkout...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pay Escrow {agreedAmount ? `- ${formatCurrency(agreedAmount)}` : ''}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Accepted & Escrow paid */}
        {application.status === 'accepted' && (campaignEscrowStatus === 'held' || campaignEscrowStatus === 'released') && (
          <div className="pt-4 border-t">
            <Badge variant="default" className="bg-green-600 text-white">
              <Check className="h-3 w-3 mr-1" />
              Escrow Paid — Project Active
            </Badge>
          </div>
        )}

        {showActions && (application.status === 'pending' || application.status === 'counter_offered') && (
          <>
            {isSponsored && userRole ? (
              <div className="pt-4 border-t">
                <JointApprovalCard
                  application={application}
                  userRole={userRole}
                />
              </div>
            ) : (
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={handleAccept}
                  disabled={manageApplication.isPending}
                  className="flex-1"
                  size="sm"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Accept
                </Button>
                <Button
                  onClick={() => setShowCounterModal(true)}
                  variant="secondary"
                  disabled={manageApplication.isPending}
                  className="flex-1"
                  size="sm"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Counter
                </Button>
                <Button
                  onClick={handleReject}
                  variant="outline"
                  disabled={manageApplication.isPending}
                  className="flex-1"
                  size="sm"
                >
                  <X className="h-4 w-4 mr-2" />
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
          currentRate={application.proposed_rate}
          currentTimeline={application.proposed_timeline}
        />
      </CardContent>
    </Card>
  );
};

export default ApplicationCard;
