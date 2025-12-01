
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns } from '@/hooks/usePublicCampaigns';
import { useCampaignMarketplaceFilters } from '@/hooks/useCampaignMarketplaceFilters';
import DashboardLayout from '@/components/DashboardLayout';
import { CampaignBrowseContent } from '@/components/campaigns/CampaignBrowseContent';
import ApplicationForm from '@/components/campaigns/ApplicationForm';
import MarketplaceHeader from '@/components/campaigns/MarketplaceHeader';
import MarketplaceStats from '@/components/campaigns/MarketplaceStats';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const { filters, filteredCampaigns, updateFilter, resetFilters } = useCampaignMarketplaceFilters(campaigns);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);

  const userApplicationsCount = campaigns.filter(c => c.user_applied).length;

  const handleApply = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setSelectedCampaign(campaign);
      setShowApplicationForm(true);
    }
  };

  const handleViewDetails = (campaignId: string) => {
    // Open in new window/tab for details page
    window.open(`/dashboard/creator/campaigns/${campaignId}`, '_blank');
  };

  const handleApplicationSubmitted = () => {
    setShowApplicationForm(false);
    setSelectedCampaign(null);
    window.location.reload();
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <MarketplaceHeader totalCampaigns={campaigns.length} />
          
          <MarketplaceStats
            totalCampaigns={campaigns.length}
            filteredCampaigns={filteredCampaigns.length}
            userApplications={userApplicationsCount}
          />

          {isLoading ? (
            <MarketplaceLoadingState />
          ) : error ? (
            <MarketplaceErrorState />
          ) : (
            <CampaignBrowseContent
              filteredCampaigns={filteredCampaigns}
              filters={filters}
              onFilterChange={updateFilter}
              onResetFilters={resetFilters}
              isLoading={isLoading}
              error={error}
              campaignType="creator"
              onApply={handleApply}
              onViewDetails={handleViewDetails}
            />
          )}

          <Dialog open={showApplicationForm} onOpenChange={setShowApplicationForm}>
            <DialogContent className="max-w-2xl">
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
      </div>
    </DashboardLayout>
  );
};

export default CreatorCampaignMarketplace;
