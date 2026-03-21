import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign } from '@/hooks/useCampaigns';
import { useBrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SponsorshipProposalModal } from '@/components/campaigns/SponsorshipProposalModal';
import { RestaurantProfileCard } from '@/components/campaigns/RestaurantProfileCard';
import { SponsorshipStatusCard } from '@/components/campaigns/SponsorshipStatusCard';
import { CreatorApplicationsCard } from '@/components/campaigns/CreatorApplicationsCard';
import { 
  ArrowLeft, 
  Calendar, 
  DollarSign, 
  Target, 
  FileText,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';

const BrandCampaignDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { campaign, isLoading } = useCampaign(id || '');
  const { data: sponsorshipStatus, isLoading: isLoadingSponsorshipStatus } = useBrandSponsorshipStatus(id || '');
  const { data: restaurantProfile, isLoading: isLoadingRestaurant } = useRestaurantProfile(campaign?.user_id);
  const createConversation = useCreateDirectConversation();
  
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);

  if (!profile) {
    return <div>Loading...</div>;
  }

  if (isLoading) {
    return (
      <DashboardLayout userRole="brand">
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="brand">
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Campaign Not Found</h2>
          <Button onClick={() => navigate('/dashboard/brand/discover-campaigns')}>
            Back to Discovery
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const handleContactRestaurant = async () => {
    if (!campaign.user_id) return;
    
    const conversationId = await createConversation.mutateAsync(campaign.user_id);
    navigate(`/dashboard/brand/messages?conversation=${conversationId}`);
  };

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-6xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate('/dashboard/brand/discover-campaigns')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Discovery
        </Button>

        <div className="space-y-6">
          {/* Campaign Header */}
          <div>
            <div className="flex items-start justify-between mb-2">
              <h1 className="text-3xl font-bold">{campaign.title}</h1>
              <Badge variant={campaign.open_for_sponsorship ? "default" : "secondary"}>
                {campaign.open_for_sponsorship ? 'Open for Sponsorship' : 'Not Available'}
              </Badge>
            </div>
            <p className="text-muted-foreground">Restaurant Campaign</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content - Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Campaign Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Campaign Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {campaign.description && (
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-muted-foreground">{campaign.description}</p>
                    </div>
                  )}

                  <Separator />

                  <div className="grid md:grid-cols-2 gap-6">
                    {campaign.budget_min && campaign.budget_max && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          Budget Range
                        </h3>
                        <p className="text-lg font-medium">
                          ${campaign.budget_min.toLocaleString()} - ${campaign.budget_max.toLocaleString()}
                        </p>
                      </div>
                    )}

                    {campaign.deadline && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Deadline
                        </h3>
                        <p className="text-lg font-medium">
                          {format(new Date(campaign.deadline), 'MMMM dd, yyyy')}
                        </p>
                      </div>
                    )}
                  </div>

                  {campaign.platforms && campaign.platforms.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Target Platforms
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {campaign.platforms.map((platform, index) => (
                          <Badge key={index} variant="outline">
                            {platform}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {campaign.goals && (
                    <div>
                      <h3 className="font-semibold mb-2">Campaign Goals</h3>
                      <p className="text-muted-foreground">{campaign.goals}</p>
                    </div>
                  )}

                  {campaign.deliverables && campaign.deliverables.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2">Expected Deliverables</h3>
                      <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                        {campaign.deliverables.map((deliverable, index) => (
                          <li key={index}>{deliverable}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Creator Applications */}
              <CreatorApplicationsCard campaignId={campaign.id} />
            </div>

            {/* Right Sidebar (1/3) */}
            <div className="space-y-6">
              {/* Sponsorship Status */}
              <SponsorshipStatusCard
                sponsorshipStatus={sponsorshipStatus}
                isLoading={isLoadingSponsorshipStatus}
                onSubmitProposal={() => setIsProposalModalOpen(true)}
              />

              {/* Restaurant Profile */}
              <RestaurantProfileCard
                restaurant={restaurantProfile || null}
                isLoading={isLoadingRestaurant}
              />

              {/* Contact Button */}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleContactRestaurant}
                disabled={createConversation.isPending}
              >
                {createConversation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Contact Restaurant
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sponsorship Proposal Modal */}
      {campaign.open_for_sponsorship && (
        <SponsorshipProposalModal
          open={isProposalModalOpen}
          onOpenChange={setIsProposalModalOpen}
          campaignId={campaign.id}
          campaignTitle={campaign.title}
          restaurantUserId={campaign.user_id}
        />
      )}
    </DashboardLayout>
  );
};

export default BrandCampaignDetails;
