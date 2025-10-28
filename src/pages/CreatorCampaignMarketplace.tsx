
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns } from '@/hooks/usePublicCampaigns';
import { useCampaignMarketplaceFilters } from '@/hooks/useCampaignMarketplaceFilters';
import DashboardLayout from '@/components/DashboardLayout';
import CampaignMarketplaceFilters from '@/components/campaigns/CampaignMarketplaceFilters';
import CampaignMarketplaceListItem from '@/components/campaigns/CampaignMarketplaceListItem';
import ApplicationForm from '@/components/campaigns/ApplicationForm';
import MarketplaceHeader from '@/components/campaigns/MarketplaceHeader';
import MarketplaceStats from '@/components/campaigns/MarketplaceStats';
import MarketplaceEmptyState from '@/components/campaigns/MarketplaceEmptyState';
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
  const navigate = useNavigate();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const { filters, filteredCampaigns, updateFilter, resetFilters } = useCampaignMarketplaceFilters(campaigns);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [showApplicationForm, setShowApplicationForm] = useState(false);

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const userApplicationsCount = campaigns.filter(c => c.user_applied).length;

  const handleApply = (campaignId: string) => {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign) {
      setSelectedCampaign(campaign);
      setShowApplicationForm(true);
    }
  };

  const handleViewDetails = (campaignId: string) => {
    navigate(`/dashboard/creator/campaigns/${campaignId}`);
  };

  const handleApplicationSubmitted = () => {
    setShowApplicationForm(false);
    setSelectedCampaign(null);
    // Refresh campaigns to update application status
    window.location.reload();
  };

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <MarketplaceHeader totalCampaigns={campaigns.length} />

          {/* Quick Stats */}
          <MarketplaceStats
            totalCampaigns={campaigns.length}
            filteredCampaigns={filteredCampaigns.length}
            userApplications={userApplicationsCount}
          />

          {/* Filters */}
          <CampaignMarketplaceFilters
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            totalCount={campaigns.length}
            filteredCount={filteredCampaigns.length}
          />

          {/* Campaigns List */}
          {filteredCampaigns.length === 0 ? (
            <MarketplaceEmptyState
              totalCampaigns={campaigns.length}
              onResetFilters={campaigns.length > 0 ? resetFilters : undefined}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {filteredCampaigns.map((campaign) => (
                <CampaignMarketplaceListItem
                  key={campaign.id}
                  campaign={campaign}
                  onApply={handleApply}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          )}

          {/* Application Form Dialog */}
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
