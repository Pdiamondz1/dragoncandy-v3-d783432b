
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface MarketplaceEmptyStateProps {
  totalCampaigns: number;
  onResetFilters?: () => void;
}

const MarketplaceEmptyState: React.FC<MarketplaceEmptyStateProps> = ({
  totalCampaigns,
  onResetFilters,
}) => {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Search className="h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {totalCampaigns === 0 ? 'No campaigns available yet' : 'No campaigns match your filters'}
        </h3>
        <p className="text-gray-600 text-center max-w-md mb-4">
          {totalCampaigns === 0 
            ? 'Check back later for new campaign opportunities from businesses.'
            : 'Try adjusting your filters to see more campaigns that match your skills and interests.'
          }
        </p>
        {totalCampaigns > 0 && onResetFilters && (
          <Button onClick={onResetFilters} variant="outline">
            Reset Filters
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default MarketplaceEmptyState;
