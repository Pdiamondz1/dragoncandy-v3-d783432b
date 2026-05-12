
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, Calendar, TrendingUp } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import { SponsorshipProposalCard } from '@/components/campaigns/SponsorshipProposalCard';
import { MarketplaceLoadingState } from '@/components/campaigns/MarketplaceLoadingState';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';

const BusinessSponsorships = () => {
  useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading, updateProposalStatus } = useSponsorshipProposals();

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

  return (
    <DashboardLayout userRole="business_client">
      <PrerequisiteGate feature="manage sponsorships">
      <div className="min-h-screen overflow-x-hidden pb-24 md:pb-0 md:max-w-4xl md:mx-auto">
        {/* Template B header */}
        <PageHeader>
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Sponsorship Proposals</h1>
          </div>
        </PageHeader>
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
                <Badge className="bg-dc-teal-btn text-white rounded-full">
                  {acceptedProposals.length} Active
                </Badge>
              </div>
              <div className="space-y-3">
                {acceptedProposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="border-2 border-dc-teal rounded-2xl p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-teal-50/50 transition-colors"
                    onClick={() => navigate(`/dashboard/business/campaigns/${proposal.campaign_id}`)}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">
                        {proposal.brand_profile?.business_name || 'Unknown Brand'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {proposal.campaigns?.title || 'Unknown Campaign'}
                      </p>
                      <p className="text-sm font-semibold text-teal-600 mt-1">
                        ${proposal.sponsorship_amount?.toLocaleString() || 0}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="rounded-full bg-dc-teal-btn text-white hover:bg-dc-teal-btn-hover shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/business/campaigns/${proposal.campaign_id}`);
                      }}
                    >
                      Manage Campaign
                    </Button>
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
                className="rounded-full bg-dc-teal-btn text-white font-bold hover:bg-dc-teal-btn-hover"
              >
                View My Campaigns
              </Button>
            </div>
          )}
        </div>
      </div>
      </PrerequisiteGate>

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
