import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCampaign } from '@/hooks/useCampaigns';
import { useBrandSponsorshipStatus } from '@/hooks/useBrandSponsorshipStatus';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import { useCreateDirectConversation } from '@/hooks/useConversations';
import DashboardLayout from '@/components/DashboardLayout';
import { Badge } from '@/components/ui/badge';
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
  MessageSquare,
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
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-dc-gray flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-dc-gray flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  if (!campaign) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-dc-gray flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 text-center space-y-4 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900">Campaign Not Found</h2>
            <button
              onClick={() => navigate('/dashboard/brand/discover-campaigns')}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3"
            >
              Back to Discovery
            </button>
          </div>
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
      <div className="min-h-screen bg-dc-gray overflow-x-hidden">
        {/* Hero area — Template D */}
        <div className="relative h-40 bg-gradient-to-br from-dc-teal to-dc-teal-dark">
          {/* Header overlay */}
          <div className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center">
            <button
              onClick={() => navigate('/dashboard/brand/discover-campaigns')}
              className="text-white mr-2"
              aria-label="Back to Discovery"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-white uppercase tracking-wide truncate px-2">
              {campaign.title}
            </h1>
            <Badge
              variant={campaign.open_for_sponsorship ? 'default' : 'secondary'}
              className="text-xs shrink-0"
            >
              {campaign.open_for_sponsorship ? 'Open' : 'Closed'}
            </Badge>
          </div>
        </div>

        {/* White card overlay — Template D */}
        <div className="bg-white rounded-t-3xl -mt-4 relative z-10 px-4 pt-6 pb-28 space-y-6">
          {/* Title + subtitle */}
          <div>
            <h2 className="text-xl font-bold text-gray-900">{campaign.title}</h2>
            <p className="text-gray-500 text-sm mt-0.5">Restaurant Campaign</p>
          </div>

          {/* Campaign description */}
          {campaign.description && (
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-dc-teal" />
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Description
                </span>
              </div>
              <p className="text-gray-700 text-sm leading-relaxed">{campaign.description}</p>
            </div>
          )}

          {/* Stats row with pink dividers */}
          {(campaign.budget_min || campaign.budget_max || campaign.deadline) && (
            <div className="flex items-stretch rounded-2xl overflow-hidden border border-gray-100">
              {campaign.budget_min && campaign.budget_max && (
                <div className="flex-1 flex flex-col items-center py-4 px-2 border-r border-dc-pink">
                  <DollarSign className="h-4 w-4 text-dc-teal mb-1" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-0.5">Budget</span>
                  <span className="text-sm font-bold text-gray-900 text-center leading-tight">
                    ${campaign.budget_min.toLocaleString()}–${campaign.budget_max.toLocaleString()}
                  </span>
                </div>
              )}
              {campaign.deadline && (
                <div className="flex-1 flex flex-col items-center py-4 px-2">
                  <Calendar className="h-4 w-4 text-dc-teal mb-1" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-0.5">Deadline</span>
                  <span className="text-sm font-bold text-gray-900 text-center leading-tight">
                    {format(new Date(campaign.deadline), 'MMM dd, yyyy')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Platforms */}
          {campaign.platforms && campaign.platforms.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-dc-teal" />
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Target Platforms
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {campaign.platforms.map((platform, index) => (
                  <Badge key={index} variant="outline" className="rounded-full border-dc-teal text-dc-teal text-xs">
                    {platform}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {campaign.goals && (
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-2">
                Campaign Goals
              </span>
              <p className="text-gray-700 text-sm leading-relaxed">{campaign.goals}</p>
            </div>
          )}

          {/* Deliverables */}
          {campaign.deliverables && campaign.deliverables.length > 0 && (
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <span className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 block mb-2">
                Deliverables
              </span>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                {campaign.deliverables.map((deliverable, index) => (
                  <li key={index}>{deliverable}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Creator Applications */}
          <CreatorApplicationsCard campaignId={campaign.id} />

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

          {/* Contact CTA */}
          <button
            onClick={handleContactRestaurant}
            disabled={createConversation.isPending}
            className="w-full rounded-full bg-dc-teal text-white font-bold py-3 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {createConversation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            Contact Restaurant
          </button>
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
