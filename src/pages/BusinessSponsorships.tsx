
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, MessageSquare, Calendar, TrendingUp, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import { useSponsorshipComplete } from '@/hooks/useSponsorshipComplete';
import SponsorshipProposalCard from '@/components/campaigns/SponsorshipProposalCard';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import SponsorshipRatingPromptManager from '@/components/reviews/SponsorshipRatingPromptManager';
import ResponsiveRatingModal from '@/components/reviews/ResponsiveRatingModal';

const BusinessSponsorships = () => {
  const { user } = useAuth();
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

  const getCompletionButton = (proposal: any) => {
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
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <DollarSign className="h-8 w-8" />
              Sponsorship Proposals
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage brand sponsorship offers for your campaigns
            </p>
          </div>

          <SponsorshipRatingPromptManager />

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {stats.map((stat, index) => (
              <Card key={index}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.title}</p>
                      <p className="text-3xl font-bold mt-1">{stat.value}</p>
                    </div>
                    <div className={`${stat.bgColor} ${stat.color} p-3 rounded-full`}>
                      {stat.icon}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Proposals Sections */}
          {pendingProposals.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Pending Proposals</h2>
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  {pendingProposals.length} Awaiting Response
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Accepted Sponsorships</h2>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {acceptedProposals.length} Active
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {acceptedProposals.map((proposal) => (
                  <Card key={proposal.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle>{proposal.brand_profile?.business_name || 'Unknown Brand'}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Campaign: {proposal.campaigns?.title || 'Unknown Campaign'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getCompletionButton(proposal)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-lg font-semibold text-green-600">
                        <DollarSign className="h-5 w-5" />
                        ${proposal.sponsorship_amount?.toLocaleString() || 0}
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          className="flex-1" 
                          variant="outline"
                          onClick={() => navigate(`/dashboard/business/campaigns/${proposal.campaign_id}`)}
                        >
                          View Campaign
                        </Button>
                        <Button 
                          className="flex-1"
                          variant="outline"
                          onClick={() => navigate(`/dashboard/business/messages`)}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Message Brand
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {rejectedProposals.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Rejected Proposals</h2>
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                  {rejectedProposals.length} Declined
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Card className="text-center py-12">
              <CardContent>
                <DollarSign className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Sponsorship Proposals Yet</h3>
                <p className="text-muted-foreground mb-6">
                  Enable sponsorships on your campaigns to receive brand partnership offers
                </p>
                <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                  View My Campaigns
                </Button>
              </CardContent>
            </Card>
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
