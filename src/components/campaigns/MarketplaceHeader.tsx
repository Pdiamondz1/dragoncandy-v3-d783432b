
import React from 'react';
import { MapPin } from 'lucide-react';

interface MarketplaceHeaderProps {
  totalCampaigns: number;
}

const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({ totalCampaigns }) => {
  return (
    <div className="pt-2 pb-1">
      <h1 className="text-2xl font-bold text-gray-900">
        Available Campaigns
      </h1>
      <div className="flex items-center gap-1 text-gray-700 mt-0.5">
        <MapPin className="h-3.5 w-3.5 text-pink-500" />
        <span className="text-sm">{totalCampaigns} campaigns near you</span>
      </div>
    </div>
  );
};

export default MarketplaceHeader;
