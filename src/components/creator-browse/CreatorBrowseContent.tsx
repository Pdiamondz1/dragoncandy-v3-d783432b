import React from 'react';
import { Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CreatorCard } from './CreatorCard';
import { CreatorMapView } from './CreatorMapView';
import { AdvancedCreatorFilters } from '@/components/creator-search/AdvancedCreatorFilters';
import type { CreatorFilters, CreatorProfile } from '@/hooks/useCreatorBrowse';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreButton } from '@/components/shared/LoadMoreButton';

interface CreatorBrowseContentProps {
  filteredCreators: CreatorProfile[];
  filters: CreatorFilters;
  mapFilters?: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: string | string[] | boolean | number) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: Error | null;
  isFiltersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
  locationUnplaceableCount?: number;
  onWidenLocation?: () => void;
  isLocationFiltered?: boolean;
}

export const CreatorBrowseContent: React.FC<CreatorBrowseContentProps> = ({
  filteredCreators,
  filters,
  mapFilters,
  onFilterChange,
  onResetFilters,
  isLoading,
  error,
  isFiltersOpen,
  onFiltersOpenChange,
  isMapOpen,
  onMapOpenChange,
  locationUnplaceableCount,
  onWidenLocation,
  isLocationFiltered,
}) => {
  const { visible: visibleCreators, hasMore, showing, total, loadMore } = usePagedList(filteredCreators, 12);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Search className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load creators</h3>
        <p className="text-gray-500">There was an error loading creator profiles.</p>
      </div>
    );
  }

  return (
    <>
      {/* Creator Grid or Empty State */}
      {filteredCreators.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No creators found</h3>
          <p className="text-gray-500 text-sm text-center mb-5 max-w-xs">
            Try expanding your search or adjusting filters to see more creators.
          </p>
          {isLocationFiltered && onWidenLocation && (
            <button
              onClick={onWidenLocation}
              className="mb-3 px-6 py-2.5 bg-dc-teal text-dc-text rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
            >
              Widen to Any location
            </button>
          )}
          <button
            onClick={onResetFilters}
            className="px-6 py-2.5 bg-dc-teal text-dc-text rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <>
          {locationUnplaceableCount ? (
            <p className="text-xs text-gray-400 mb-2">
              {locationUnplaceableCount} creator{locationUnplaceableCount !== 1 ? 's' : ''} couldn’t be placed on the map.
            </p>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleCreators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
          <LoadMoreButton
            hasMore={hasMore}
            showing={showing}
            total={total}
            onClick={loadMore}
            noun="creators"
          />
        </>
      )}

      {/* Filters Sheet */}
      <Sheet open={isFiltersOpen} onOpenChange={onFiltersOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <AdvancedCreatorFilters
              filters={filters}
              onFilterChange={onFilterChange}
              onResetFilters={onResetFilters}

            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Map Overlay */}
      <Dialog open={isMapOpen} onOpenChange={onMapOpenChange}>
        <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 overflow-hidden">
          <div className="h-full">
            <CreatorMapView
              filteredCreators={filteredCreators}
              filters={mapFilters ?? filters}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
