
import React from 'react';
import { TrendingUp } from 'lucide-react';

interface MarketplaceHeaderProps {
  totalCampaigns: number;
}

export const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({ totalCampaigns }) => {
  return (
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
        <span>{totalCampaigns} campaigns available</span>
      </div>
    </div>
  );
};

