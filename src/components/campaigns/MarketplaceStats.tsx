
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, Search, TrendingUp } from 'lucide-react';

interface MarketplaceStatsProps {
  totalCampaigns: number;
  filteredCampaigns: number;
  userApplications: number;
}

const MarketplaceStats: React.FC<MarketplaceStatsProps> = ({
  totalCampaigns,
  filteredCampaigns,
  userApplications,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Briefcase className="h-8 w-8 text-blue-600" />
          <div>
            <p className="text-2xl font-bold">{totalCampaigns}</p>
            <p className="text-sm text-gray-600">Available Campaigns</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Search className="h-8 w-8 text-green-600" />
          <div>
            <p className="text-2xl font-bold">{filteredCampaigns}</p>
            <p className="text-sm text-gray-600">Matching Your Filters</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <TrendingUp className="h-8 w-8 text-purple-600" />
          <div>
            <p className="text-2xl font-bold">{userApplications}</p>
            <p className="text-sm text-gray-600">Your Applications</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MarketplaceStats;
