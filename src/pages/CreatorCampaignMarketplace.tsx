
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns, PublicCampaign } from '@/hooks/usePublicCampaigns';
import DashboardLayout from '@/components/DashboardLayout';
import { CampaignSwipeCard } from '@/components/campaigns/CampaignSwipeCard';
import ApplicationForm from '@/components/campaigns/ApplicationForm';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapPin } from 'lucide-react';
import logo from '@/assets/dragon-candy-logo.png';
import { useNavigate } from 'react-router-dom';

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const [selectedCampaign, setSelectedCampaign] = useState<PublicCampaign | null>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  // Filter out campaigns the user has already applied to
  const availableCampaigns = campaigns.filter(
    (c) => !c.user_applied && !skippedIds.has(c.id)
  );

  const handleSwipe = (direction: string, campaign: PublicCampaign) => {
    if (direction === 'right') {
      // Swipe right = apply
      setSelectedCampaign(campaign);
      setShowApplicationForm(true);
    } else if (direction === 'left') {
      // Swipe left = skip
      setSkippedIds((prev) => new Set(prev).add(campaign.id));
    }
  };

  const handleApply = (campaign: PublicCampaign) => {
    setSelectedCampaign(campaign);
    setShowApplicationForm(true);
  };

  const handleApplicationSubmitted = () => {
    setShowApplicationForm(false);
    if (selectedCampaign) {
      setSkippedIds((prev) => new Set(prev).add(selectedCampaign.id));
    }
    setSelectedCampaign(null);
    // Refresh campaigns to update application status
    window.location.reload();
  };

  // Placeholder location — in a real app this would come from creator profile
  const locationLabel = 'Available Campaigns';

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex flex-col min-h-screen bg-dc-gray">
        {/* Page Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          {/* Logo */}
          <img src={logo} alt="Dragon Candy" className="w-12 h-12" />

          {/* Title + location */}
          <div className="flex-1 px-3">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">
              Available Campaigns
            </h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" />
              <span className="text-xs text-gray-600">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} available
              </span>
            </div>
          </div>

          {/* Creator avatar */}
          <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden bg-dc-pink-bg flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-dc-teal-dark">
              {user?.email?.charAt(0).toUpperCase() ?? 'C'}
            </span>
          </div>
        </div>

        {/* Swipe card stack */}
        <div className="flex-1 px-4 pb-4">
          <CampaignSwipeCard
            campaigns={availableCampaigns}
            onSwipe={handleSwipe}
            onApply={handleApply}
          />

          {/* Swipe hint */}
          {availableCampaigns.length > 0 && (
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-red-400/80 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">✕</span>
                </div>
                <span className="text-xs text-white/80">Skip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-8 rounded-full bg-dc-teal flex items-center justify-center">
                  <span className="text-white text-sm font-bold">♥</span>
                </div>
                <span className="text-xs text-white/80">Apply</span>
              </div>
            </div>
          )}
        </div>

        {/* Application Form Dialog */}
        <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Apply to Campaign</DialogTitle>
            </DialogHeader>
            {selectedCampaign && (
              <ApplicationForm
                campaign={selectedCampaign}
                onSuccess={handleApplicationSubmitted}
                onCancel={() => setShowApplicationForm(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default CreatorCampaignMarketplace;
