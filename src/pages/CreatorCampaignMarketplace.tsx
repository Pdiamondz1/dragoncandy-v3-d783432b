
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns } from '@/hooks/usePublicCampaigns';
import { useCampaignMarketplaceFilters } from '@/hooks/useCampaignMarketplaceFilters';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, Briefcase, TrendingUp } from 'lucide-react';
import CampaignMarketplaceFilters from '@/components/campaigns/CampaignMarketplaceFilters';
import CampaignMarketplaceCard from '@/components/campaigns/CampaignMarketplaceCard';
import ApplicationForm from '@/components/campaigns/ApplicationForm';
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
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-64 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load campaigns
                </h3>
                <p className="text-gray-600 mb-4">
                  There was an error loading the available campaigns.
                </p>
                <Button onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Browse Campaigns
              </h1>
              <p className="text-gray-600">
                Discover exciting campaigns and grow your creative business
              </p>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4" />
              <span>{campaigns.length} campaigns available</span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Briefcase className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{campaigns.length}</p>
                  <p className="text-sm text-gray-600">Available Campaigns</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Search className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{filteredCampaigns.length}</p>
                  <p className="text-sm text-gray-600">Matching Your Filters</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <TrendingUp className="h-8 w-8 text-purple-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {campaigns.filter(c => c.user_applied).length}
                  </p>
                  <p className="text-sm text-gray-600">Your Applications</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <CampaignMarketplaceFilters
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            totalCount={campaigns.length}
            filteredCount={filteredCampaigns.length}
          />

          {/* Campaigns Grid */}
          {filteredCampaigns.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {campaigns.length === 0 ? 'No campaigns available yet' : 'No campaigns match your filters'}
                </h3>
                <p className="text-gray-600 text-center max-w-md mb-4">
                  {campaigns.length === 0 
                    ? 'Check back later for new campaign opportunities from businesses.'
                    : 'Try adjusting your filters to see more campaigns that match your skills and interests.'
                  }
                </p>
                {campaigns.length > 0 && (
                  <Button onClick={resetFilters} variant="outline">
                    Reset Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCampaigns.map((campaign) => (
                <CampaignMarketplaceCard
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
