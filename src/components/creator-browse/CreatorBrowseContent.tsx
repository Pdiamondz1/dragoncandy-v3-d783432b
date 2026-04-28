import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CreatorCard } from './CreatorCard';
import { CreatorMapView } from './CreatorMapView';
import AdvancedCreatorFilters from '@/components/creator-search/AdvancedCreatorFilters';
import type { CreatorFilters, CreatorProfile } from '@/hooks/useCreatorBrowse';

interface CreatorBrowseContentProps {
  filteredCreators: CreatorProfile[];
  filters: CreatorFilters;
  mapFilters?: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
  isLoading: boolean;
  error: Error | null;
  isFiltersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
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
}) => {
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filteredCreators]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filteredCreators.length));
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredCreators.length]);

  const visibleCreators = filteredCreators.slice(0, visibleCount);
  const hasMore = visibleCount < filteredCreators.length;

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
          <button
            onClick={onResetFilters}
            className="px-6 py-2.5 bg-teal-400 text-white rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleCreators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {hasMore && (
            <p className="text-center text-sm text-gray-400 py-4">
              Showing {visibleCount} of {filteredCreators.length} creators
            </p>
          )}
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
