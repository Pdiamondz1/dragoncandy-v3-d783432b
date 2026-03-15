
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Users, LayoutGrid, Map as MapIcon, LayoutDashboard } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreatorCard } from './CreatorCard';
import { CreatorMapView } from './CreatorMapView';
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
  mapFilters?: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: any;
}

export const CreatorBrowseContent: React.FC<CreatorBrowseContentProps> = ({
  filteredCreators,
  filters,
  mapFilters,
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

  const [viewMode, setViewMode] = useState<'grid' | 'map' | 'split'>(() => {
    return (localStorage.getItem('creator-view-mode') as 'grid' | 'map' | 'split' | null) || 'split';
  });

  useEffect(() => {
    localStorage.setItem('creator-view-mode', viewMode);
  }, [viewMode]);

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
      <AdvancedCreatorFilters
        filters={filters}
        onFilterChange={onFilterChange}
        onResetFilters={onResetFilters}
        resultCount={filteredCreators.length}
      />

      {/* Main Content Area */}
      <div className={`
        ${viewMode === 'split' ? 'grid grid-cols-1 lg:grid-cols-5 gap-6' : ''}
      `}>
        {/* Left: Creator Grid */}
        {(viewMode === 'grid' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-3' : ''}`}>
            {filteredCreators.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Search className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    No creators found
                  </h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search criteria to find more creators.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredCreators.map((creator) => (
                  <CreatorCard key={creator.id} creator={creator} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right: Map View */}
        {(viewMode === 'map' || viewMode === 'split') && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-2' : ''}`}>
            <div className={`${viewMode === 'split' ? 'sticky top-4' : ''}`}>
              <CreatorMapView 
                filteredCreators={filteredCreators}
                filters={mapFilters ?? filters}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
