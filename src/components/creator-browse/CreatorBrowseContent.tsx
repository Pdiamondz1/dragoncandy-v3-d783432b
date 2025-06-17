
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Users } from 'lucide-react';
import { CreatorCard } from './CreatorCard';
import AdvancedCreatorFilters from '@/components/creator-search/AdvancedCreatorFilters';
import type { CreatorFilters } from '@/hooks/useCreatorBrowse';

interface CreatorProfile {
  id: string;
  user_id: string;
  creator_name: string;
  avatar_url?: string;
  bio?: string;
  skills?: string[];
  portfolio_urls?: string[];
  location?: string;
  availability?: string;
  base_rate_per_hour?: number;
  instagram_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  other_social_url?: string;
  website_url?: string;
}

interface CreatorBrowseContentProps {
  filteredCreators: CreatorProfile[];
  filters: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: any;
}

export const CreatorBrowseContent: React.FC<CreatorBrowseContentProps> = ({
  filteredCreators,
  filters,
  onFilterChange,
  onResetFilters,
  isLoading,
  error
}) => {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
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
          <Users className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Failed to load creators
          </h3>
          <p className="text-gray-600">
            There was an error loading the creator profiles.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Advanced Filters */}
      <AdvancedCreatorFilters
        filters={filters}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        resultCount={filteredCreators.length}
      />

      {/* Creators Grid */}
      {filteredCreators.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No creators found
            </h3>
            <p className="text-gray-600">
              Try adjusting your search criteria to find more creators.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCreators.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}
    </div>
  );
};
