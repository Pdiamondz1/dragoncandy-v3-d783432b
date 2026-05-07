
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, MessageSquare, Calendar, TrendingUp, CheckCircle, Clock, Loader2, Star } from 'lucide-react';
import { useSponsorshipProposals, type SponsorshipProposal } from '@/hooks/useSponsorshipProposals';
import { useSponsorshipComplete } from '@/hooks/useSponsorshipComplete';
import { SponsorshipProposalCard } from '@/components/campaigns/SponsorshipProposalCard';
import { MarketplaceLoadingState } from '@/components/campaigns/MarketplaceLoadingState';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { ResponsiveRatingModal } from '@/components/reviews/ResponsiveRatingModal';

const BusinessSponsorships = () => {
  useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading, updateProposalStatus } = useSponsorshipProposals();
  const { requestCompletion, requestingId } = useSponsorshipComplete();

  const [ratingModal, setRatingModal] = useState<{
    isOpen: boolean;
    sponsorshipId: string;
    revieweeId: string;
    revieweeName: string;
  } | null>(null);

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const acceptedProposals = proposals.filter(p => p.status === 'accepted' || p.status === 'completed');
  const rejectedProposals = proposals.filter(p => p.status === 'rejected');

  const stats = [
    {
      title: 'Total Proposals',
      value: proposals.length,
      icon: <DollarSign className="h-5 w-5" />,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Pending',
      value: pendingProposals.length,
      icon: <Calendar className="h-5 w-5" />,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      title: 'Accepted',
      value: acceptedProposals.length,
      icon: <TrendingUp className="h-5 w-5" />,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ];

  const handleLeaveReview = (proposal: SponsorshipProposal) => {
    setRatingModal({
      isOpen: true,
      sponsorshipId: proposal.id,
      revieweeId: proposal.brand_profile?.user_id || '',
      revieweeName: proposal.brand_profile?.business_name || 'Brand'
    });
  };

  const getCompletionButton = (proposal: SponsorshipProposal) => {
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

    if (businessStatus === 'requested') {
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3 mr-1" />
          Awaiting Brand Approval
        </Badge>
      );
    }

    if (brandStatus === 'requested' && businessStatus === 'pending') {
      return (
        <Button
          size="sm"
          onClick={() => requestCompletion({ sponsorshipId: proposal.id, userRole: 'business' })}
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
        onClick={() => requestCompletion({ sponsorshipId: proposal.id, userRole: 'business' })}
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
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Sponsorship Proposals</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div>

          <SponsorshipRatingPromptManager />
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((stat, index) => (
              <div key={index} className="border-2 border-dc-teal rounded-2xl p-4">
                <p className="text-3xl font-extrabold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.title}</p>
              </div>
            ))}
          </div>

          {/* Proposals Sections */}
          {pendingProposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Pending</h2>
                <Badge className="bg-dc-yellow text-gray-900 rounded-full">
                  {pendingProposals.length} Awaiting
                </Badge>
              </div>
              <div className="space-y-3">
                {pendingProposals.map((proposal) => (
                  <SponsorshipProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onAccept={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'accepted' })}
                    onReject={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'rejected' })}
                  />
                ))}
              </div>
            </div>
          )}

          {acceptedProposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Accepted</h2>
                <Badge className="bg-dc-teal text-white rounded-full">
                  {acceptedProposals.length} Active
                </Badge>
              </div>
              <div className="space-y-3">
                {acceptedProposals.map((proposal) => (
                  <div key={proposal.id} className="border-2 border-dc-teal rounded-2xl p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-gray-900">{proposal.brand_profile?.business_name || 'Unknown Brand'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Campaign: {proposal.campaigns?.title || 'Unknown Campaign'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {(() => {
                          const ps = proposal.payment_status || 'unpaid';
                          if (ps === 'paid') return (
                            <Badge className="bg-dc-teal/20 text-dc-teal text-xs rounded-full">
                              <DollarSign className="h-3 w-3 mr-1" />
                              Paid
                            </Badge>
                          );
                          if (ps === 'pending') return (
                            <Badge className="bg-dc-yellow/30 text-yellow-800 text-xs rounded-full">
                              <Clock className="h-3 w-3 mr-1" />
                              Processing
                            </Badge>
                          );
                          return (
                            <Badge className="bg-dc-yellow/30 text-yellow-800 text-xs rounded-full">
                              <Clock className="h-3 w-3 mr-1" />
                              Awaiting Payment
                            </Badge>
                          );
                        })()}
                        {getCompletionButton(proposal)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-bold text-dc-teal">
                      <DollarSign className="h-4 w-4" />
                      ${proposal.sponsorship_amount?.toLocaleString() || 0}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                        onClick={() => navigate(`/dashboard/business/campaigns/${proposal.campaign_id}`)}
                      >
                        View Campaign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10"
                        onClick={() => navigate(`/dashboard/business/messages`)}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Message Brand
                      </Button>
                      {proposal.completed_at && (
                        <Button
                          size="sm"
                          onClick={() => handleLeaveReview(proposal)}
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
            </div>
          )}

          {rejectedProposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Rejected</h2>
                <Badge className="bg-gray-100 text-gray-700 rounded-full">
                  {rejectedProposals.length} Declined
                </Badge>
              </div>
              <div className="space-y-3">
                {rejectedProposals.map((proposal) => (
                  <SponsorshipProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    onAccept={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'accepted' })}
                    onReject={(id) => updateProposalStatus.mutate({ proposalId: id, status: 'rejected' })}
                  />
                ))}
              </div>
            </div>
          )}

          {proposals.length === 0 && (
            <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
              <DollarSign className="h-12 w-12 mx-auto text-dc-teal mb-3" />
              <h3 className="font-bold text-gray-900 mb-2">No Sponsorship Proposals Yet</h3>
              <p className="text-xs text-gray-500 mb-4">
                Enable sponsorships on your campaigns to receive brand partnership offers
              </p>
              <Button
                onClick={() => navigate('/dashboard/business/campaigns')}
                className="rounded-full bg-dc-teal text-white font-bold hover:bg-dc-teal/90"
              >
                View My Campaigns
              </Button>
            </div>
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
          reviewType="business_to_brand"
        />
      )}
    </DashboardLayout>
  );
};

export default BusinessSponsorships;
