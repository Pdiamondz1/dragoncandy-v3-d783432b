import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Grid, Map, Columns } from 'lucide-react';
import CampaignMapView from './CampaignMapView';
import { PublicCampaign } from '@/hooks/usePublicCampaigns';
import { SponsorshipCampaign } from '@/hooks/useSponsorshipCampaigns';

interface CampaignBrowseContentProps {
  campaigns: (PublicCampaign | SponsorshipCampaign)[];
  onViewDetails: (campaignId: string) => void;
  renderCampaignCard: (campaign: PublicCampaign | SponsorshipCampaign) => React.ReactNode;
  emptyState?: React.ReactNode;
}

const CampaignBrowseContent: React.FC<CampaignBrowseContentProps> = ({
  campaigns,
  onViewDetails,
  renderCampaignCard,
  emptyState,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'map' | 'split'>(() => {
    const saved = localStorage.getItem('campaign-view-mode');
    return (saved as 'grid' | 'map' | 'split') || 'grid';
  });

  useEffect(() => {
    localStorage.setItem('campaign-view-mode', viewMode);
  }, [viewMode]);

  if (campaigns.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'map' | 'split')}>
      <TabsList className="grid w-full max-w-full grid-cols-3 mb-4 sm:mb-6">
        <TabsTrigger value="grid" className="flex items-center gap-2">
          <Grid className="h-4 w-4" aria-hidden="true" />
          Grid
        </TabsTrigger>
        <TabsTrigger value="map" className="flex items-center gap-2">
          <Map className="h-4 w-4" aria-hidden="true" />
          Map
        </TabsTrigger>
        <TabsTrigger value="split" className="flex items-center gap-2">
          <Columns className="h-4 w-4" aria-hidden="true" />
          Split
        </TabsTrigger>
      </TabsList>

      <TabsContent value="grid" className="space-y-4">
        {campaigns.length === 0 ? (
          emptyState
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campaigns.map((campaign) => renderCampaignCard(campaign))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="map" className="space-y-4">
        <CampaignMapView campaigns={campaigns} onViewDetails={onViewDetails} />
      </TabsContent>

      <TabsContent value="split" className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {campaigns.map((campaign) => renderCampaignCard(campaign))}
          </div>
          <div className="sticky top-0">
            <CampaignMapView campaigns={campaigns} onViewDetails={onViewDetails} />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default CampaignBrowseContent;
