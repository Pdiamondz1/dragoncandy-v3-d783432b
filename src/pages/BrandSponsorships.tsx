
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSponsorshipProposals } from '@/hooks/useSponsorshipProposals';
import { useSponsorshipComplete } from '@/hooks/useSponsorshipComplete';
import SponsorshipRatingPromptManager from '@/components/reviews/SponsorshipRatingPromptManager';
import ResponsiveRatingModal from '@/components/reviews/ResponsiveRatingModal';
import { Target, DollarSign, Calendar, ExternalLink, Loader2, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

const BrandSponsorships = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { proposals, isLoading } = useSponsorshipProposals();
  const { requestCompletion, requestingId } = useSponsorshipComplete();
  
  const [ratingModal, setRatingModal] = useState<{
    isOpen: boolean;
    sponsorshipId: string;
    revieweeId: string;
    revieweeName: string;
  } | null>(null);

  if (!profile) {
    return <div>Loading...</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      default: return 'bg-yellow-500';
    }
  };

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
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Brand Sponsorships</h1>
          <p className="text-muted-foreground">
            Manage your sponsorship proposals and active partnerships
          </p>
        </div>

        <SponsorshipRatingPromptManager />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : proposals && proposals.length > 0 ? (
          <div className="grid gap-6">
            {proposals.map((proposal) => (
              <Card key={proposal.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-2xl mb-2">
                        {proposal.campaigns?.title || 'Untitled Campaign'}
                      </CardTitle>
                      <CardDescription className="text-base">
                        {proposal.brand_profile?.business_name || 'Restaurant'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {proposal.status === 'accepted' && getCompletionButton(proposal)}
                      <Badge className={getStatusColor(proposal.status)}>
                        {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      {proposal.campaigns?.description || 'No description available'}
                    </p>
                    
                    <Separator />
                    
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">Sponsorship Amount</p>
                          <p className="font-semibold text-lg">
                            ${proposal.sponsorship_amount?.toLocaleString() || 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">Deadline</p>
                          <p className="font-semibold">
                            {proposal.campaigns?.deadline 
                              ? format(new Date(proposal.campaigns.deadline), 'MMM dd, yyyy')
                              : 'No deadline'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-purple-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">Platforms</p>
                          <p className="font-semibold">
                            {proposal.campaigns?.platforms?.join(', ') || 'Not specified'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {proposal.proposal_message && (
                      <>
                        <Separator />
                        <div>
                          <p className="text-sm font-medium mb-2">Your Proposal Message:</p>
                          <p className="text-muted-foreground italic">"{proposal.proposal_message}"</p>
                        </div>
                      </>
                    )}
                    
                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/dashboard/brand/campaigns/${proposal.campaigns?.id}`)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Campaign
                      </Button>
                      
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/dashboard/brand/messages`)}
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Message Restaurant
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Target className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Sponsorships Yet</h3>
              <p className="text-muted-foreground mb-6 text-center max-w-md">
                Start by discovering restaurant campaigns that are open for brand sponsorship
              </p>
              <Button onClick={() => navigate('/dashboard/brand/discover-campaigns')}>
                Discover Campaigns
              </Button>
            </CardContent>
          </Card>
        )}
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
