import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, LayoutGrid, Map as MapIcon, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CampaignMapView } from './CampaignMapView';
import CampaignMarketplaceListItem from './CampaignMarketplaceListItem';
import BrandCampaignCard from './BrandCampaignCard';
import AdvancedCampaignFilters from './AdvancedCampaignFilters';

interface CampaignFilters {
  searchTerm?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  platforms?: string[];
  budgetMin?: number | string | null;
  budgetMax?: number | string | null;
  sortBy?: string;
  sortOrder?: string;
  _isLocationAutoFilled?: boolean;
}

interface Campaign {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  budget_min?: number;
  budget_max?: number;
  deadline?: string;
  platforms?: string[];
  status: string;
  created_at: string;
  updated_at?: string;
  business_profile?: {
    business_name: string;
    logo_url?: string;
    location?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    industry?: string;
  };
  application_count?: number;
  user_applied?: boolean;
  application_status?: string;
  user_proposal?: any;
  open_for_sponsorship?: boolean;
}

interface CampaignBrowseContentProps {
  filteredCampaigns: Campaign[];
  filters: CampaignFilters;
  onFilterChange: (key: keyof CampaignFilters, value: any) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: any;
  campaignType: 'creator' | 'brand';
  onApply?: (campaignId: string) => void;
  onViewDetails?: (campaignId: string) => void;
  onSponsor?: (campaignId: string, existingProposal?: any) => void;
  submittingCampaignId?: string;
}

export const CampaignBrowseContent: React.FC<CampaignBrowseContentProps> = ({
  filteredCampaigns,
  filters,
  onFilterChange,
  onResetFilters,
  isLoading,
  error,
  campaignType,
  onApply,
  onViewDetails,
  onSponsor,
  submittingCampaignId
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'map' | 'split'>(() => {
    return (localStorage.getItem('campaign-view-mode') as any) || 'split';
  });

  useEffect(() => {
    localStorage.setItem('campaign-view-mode', viewMode);
  }, [viewMode]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-64 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Search className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load campaigns</h3>
          <p className="text-muted-foreground">
            There was an error loading the campaigns.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(value: any) => setViewMode(value)} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="grid" className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Grid</span>
          </TabsTrigger>
          <TabsTrigger value="map" className="flex items-center gap-2">
            <MapIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Map</span>
          </TabsTrigger>
          <TabsTrigger value="split" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Split</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Advanced Filters */}
      <AdvancedCampaignFilters
        filters={filters}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        resultCount={filteredCampaigns.length}
      />

      {/* Main Content Area */}
      <div className={`
        ${viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-5 gap-6' : ''}
      `}>
        {/* Left: Campaign Grid */}
        {(viewMode === 'grid' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-3' : ''}`}>
            {filteredCampaigns.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No campaigns found
                  </h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search criteria to find more campaigns.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {campaignType === 'creator' ? (
                  filteredCampaigns.map((campaign) => (
                    <CampaignMarketplaceListItem
                      key={campaign.id}
                      campaign={campaign as any}
                      onApply={onApply!}
                      onViewDetails={onViewDetails!}
                    />
                  ))
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredCampaigns.map((campaign) => (
                      <BrandCampaignCard
                        key={campaign.id}
                        campaign={campaign as any}
                        onSponsor={onSponsor!}
                        onViewDetails={onViewDetails!}
                        submittingCampaignId={submittingCampaignId}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Right: Map View */}
        {(viewMode === 'map' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-2' : ''}`}>
            <div className={`${viewMode === 'split' ? 'sticky top-4' : ''}`}>
              <CampaignMapView 
                filteredCampaigns={filteredCampaigns}
                filters={filters}
                onApply={campaignType === 'creator' ? onApply : undefined}
                onViewDetails={onViewDetails}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
