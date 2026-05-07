import { useState, useEffect } from 'react';
import { PaymentTimeline } from "@/components/payments/PaymentTimeline";
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBrandSponsorships, type BrandSponsorship } from '@/hooks/useBrandSponsorships';
import { useSponsorshipComplete } from '@/hooks/useSponsorshipComplete';
import { useSponsorshipPayment } from '@/hooks/useSponsorshipPayment';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { ResponsiveRatingModal } from '@/components/reviews/ResponsiveRatingModal';
import { Target, ExternalLink, Loader2, MessageSquare, CheckCircle, Clock, Star, CreditCard, RefreshCw } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { format } from 'date-fns';

const BrandSponsorships = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { sponsorships, isLoading } = useBrandSponsorships();
  const { requestCompletion, requestingId } = useSponsorshipComplete();
  const { initiatePayment, verifyPayment } = useSponsorshipPayment();
  const { toast } = useToast();
  
  const [ratingModal, setRatingModal] = useState<{
    isOpen: boolean;
    sponsorshipId: string;
    revieweeId: string;
    revieweeName: string;
  } | null>(null);

  // Auto-verify payment on redirect from Stripe
  useEffect(() => {
    const paymentStatus = searchParams.get('payment');
    const sponsorshipId = searchParams.get('sponsorship_id');
    
    if (paymentStatus === 'success' && sponsorshipId) {
      verifyPayment.mutate({ sponsorshipId });
      // Clean up URL params
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <div className="flex-1 text-center">
              <DCSkeleton variant="text-block" className="h-5 w-40 mx-auto" />
            </div>
          </div>
          <div className="p-4 space-y-3">
            <DCSkeleton variant="list-row" count={4} className="h-32" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-500';
      case 'completed': return 'bg-green-600';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-yellow-500';
    }
  };

  const handleMessageRestaurant = async (sponsorship: BrandSponsorship) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const restaurantUserId = sponsorship.restaurant_profile?.user_id;
      if (!restaurantUserId) {
        toast({ title: "Error", description: "Restaurant profile not found.", variant: "destructive" });
        return;
      }

      const { data: conversationId, error } = await supabase.rpc(
        'create_or_get_direct_conversation',
        { user1_uuid: user.id, user2_uuid: restaurantUserId }
      );
      if (error) throw error;

      navigate(`/dashboard/brand/messages/direct/${conversationId}`);
    } catch (error) {
      toast({ title: "Error", description: "Failed to start conversation.", variant: "destructive" });
    }
  };

  const handleLeaveReview = (sponsorship: BrandSponsorship) => {
    setRatingModal({
      isOpen: true,
      sponsorshipId: sponsorship.id,
      revieweeId: sponsorship.restaurant_profile?.user_id || '',
      revieweeName: sponsorship.restaurant_profile?.business_name || 'Restaurant'
    });
  };

  const handlePayment = (sponsorship: BrandSponsorship) => {
    initiatePayment.mutate({
      sponsorshipId: sponsorship.id,
      amount: sponsorship.sponsorship_amount || 0,
      campaignTitle: sponsorship.campaigns?.title,
    });
  };

  const handleVerifyPayment = (sponsorship: BrandSponsorship) => {
    verifyPayment.mutate({ sponsorshipId: sponsorship.id });
  };

  const getPaymentSection = (sponsorship: BrandSponsorship) => {
    if (sponsorship.status !== 'accepted' && sponsorship.status !== 'completed') return null;

    const paymentStatus = sponsorship.payment_status || 'unpaid';

    if (paymentStatus === 'paid') {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Payment Complete
        </Badge>
      );
    }

    if (paymentStatus === 'pending') {
      return (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleVerifyPayment(sponsorship)}
            disabled={verifyPayment.isPending}
          >
            {verifyPayment.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Verify Payment
          </Button>
          <Button
            size="sm"
            onClick={() => handlePayment(sponsorship)}
            disabled={initiatePayment.isPending}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Retry Payment
          </Button>
        </div>
      );
    }

    // unpaid
    return (
      <Button
        onClick={() => handlePayment(sponsorship)}
        disabled={initiatePayment.isPending}
        className="rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-bold"
      >
        {initiatePayment.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CreditCard className="h-4 w-4 mr-2" />
        )}
        Pay ${sponsorship.sponsorship_amount?.toLocaleString() || 0}
      </Button>
    );
  };

  const getCompletionButton = (proposal: BrandSponsorship) => {
    const brandStatus = proposal.brand_completion_status || 'pending';
    const businessStatus = proposal.business_completion_status || 'pending';
    const isCompleted = !!proposal.completed_at;

    if (isCompleted) {
      return (
        <Badge className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Completed
        </Badge>
      );
    }

    if (brandStatus === 'requested') {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3 mr-1" />
          Awaiting Business Approval
        </Badge>
      );
    }

    if (businessStatus === 'requested' && brandStatus === 'pending') {
      return (
        <Button
          size="sm"
          onClick={() => requestCompletion({ sponsorshipId: proposal.id, userRole: 'brand' })}
          disabled={requestingId === proposal.id}
          className="bg-green-600 hover:bg-green-700"
        >
          {requestingId === proposal.id ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle className="h-4 w-4 mr-2" />
          )}
          Approve Completion
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => requestCompletion({ sponsorshipId: proposal.id, userRole: 'brand' })}
        disabled={requestingId === proposal.id}
      >
        {requestingId === proposal.id ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4 mr-2" />
        )}
        Mark Complete
      </Button>
    );
  };

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Brand Sponsorships</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <SponsorshipRatingPromptManager />

          {isLoading ? (
            <div className="space-y-3">
              <DCSkeleton variant="list-row" count={4} className="h-32" />
            </div>
          ) : sponsorships && sponsorships.length > 0 ? (
            <div className="space-y-3">
              {sponsorships.map((sponsorship) => (
                <div key={sponsorship.id} className="border-2 border-dc-teal rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-bold text-gray-900">{sponsorship.campaigns?.title || 'Untitled Campaign'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{sponsorship.restaurant_profile?.business_name || 'Restaurant'}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {(sponsorship.status === 'accepted' || sponsorship.status === 'completed') && getCompletionButton(sponsorship)}
                      <Badge className={`${getStatusColor(sponsorship.status)} text-white rounded-full text-xs`}>
                        {sponsorship.status.charAt(0).toUpperCase() + sponsorship.status.slice(1)}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 line-clamp-2">
                    {sponsorship.campaigns?.description || 'No description available'}
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs text-gray-500">Amount</p>
                      <p className="font-bold text-dc-teal text-sm">${sponsorship.sponsorship_amount?.toLocaleString() || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Deadline</p>
                      <p className="font-semibold text-gray-900 text-sm">
                        {sponsorship.campaigns?.deadline
                          ? format(new Date(sponsorship.campaigns.deadline), 'MMM dd')
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Platforms</p>
                      <p className="font-semibold text-gray-900 text-xs truncate">
                        {sponsorship.campaigns?.platforms?.join(', ') || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Payment Section */}
                  {getPaymentSection(sponsorship) && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3 w-3 text-gray-400" />
                        <span className="text-xs font-medium text-gray-600">Payment</span>
                      </div>
                      {getPaymentSection(sponsorship)}
                    </div>
                  )}

                  {/* Payment Timeline */}
                  {sponsorship.id && sponsorship.campaign_id && (
                    <PaymentTimeline
                      entityType="sponsorship"
                      entityId={sponsorship.id}
                      campaignId={sponsorship.campaign_id}
                      userRole="brand"
                      variant="compact"
                    />
                  )}

                  {sponsorship.proposal_message && (
                    <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2">
                      "{sponsorship.proposal_message}"
                    </p>
                  )}

                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                      onClick={() => {
                        if (sponsorship.campaigns?.id) {
                          navigate(`/dashboard/brand/campaigns/${sponsorship.campaigns.id}`);
                        } else {
                          toast({ title: "Campaign unavailable", description: "This campaign may have been removed.", variant: "destructive" });
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Campaign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                      onClick={() => handleMessageRestaurant(sponsorship)}
                    >
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Message
                    </Button>
                    {sponsorship.completed_at && (
                      <Button
                        size="sm"
                        onClick={() => handleLeaveReview(sponsorship)}
                        className="rounded-full bg-dc-pink-accent text-white hover:bg-dc-pink-accent/90"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Leave Review
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <DCEmptyState
              icon={Target}
              title="No Sponsorships Yet"
              subtitle="Start by discovering restaurant campaigns that are open for brand sponsorship"
              cta={{ label: "Discover Campaigns", to: "/dashboard/brand/discover-campaigns" }}
            />
          )}
        </div>
      </div>

      {ratingModal && (
        <ResponsiveRatingModal
          isOpen={ratingModal.isOpen}
          onClose={() => setRatingModal(null)}
          sponsorshipId={ratingModal.sponsorshipId}
          revieweeId={ratingModal.revieweeId}
          revieweeName={ratingModal.revieweeName}
          reviewType="brand_to_business"
        />
      )}
    </DashboardLayout>
  );
};

export default BrandSponsorships;
