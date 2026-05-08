import React, { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorBrowseContent } from '@/components/creator-browse/CreatorBrowseContent';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { PageHeader } from '@/components/ui/PageHeader';

const CreatorBrowseInner: React.FC = () => {
  const {
    filteredCreators,
    filters,
    debouncedFilters,
    isLoading,
    error,
    handleFilterChange,
    resetFilters,
    sortBy,
    setSortBy,
    contentTypeFilter,
    setContentTypeFilter,
  } = useCreatorBrowse();

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  // Count active advanced filters (excluding search and content-type pills)
  const activeFilterCount = [
    filters.skills.length > 0,
    filters.city,
    filters.country,
    filters.postal_code,
    filters.platforms.length > 0,
    filters.availability,
    filters.experienceLevel,
    filters.minRate > 0 || filters.maxRate < 500,
  ].filter(Boolean).length;

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 bg-white min-h-screen overflow-x-hidden">
        <PageHeader>
          <div className="max-w-7xl mx-auto">
            <CreatorBrowseHeader
              resultCount={filteredCreators.length}
              searchTerm={filters.searchTerm}
              onSearchChange={(value) => handleFilterChange('searchTerm', value)}
              contentTypeFilter={contentTypeFilter}
              onContentTypeChange={setContentTypeFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onOpenFilters={() => setIsFiltersOpen(true)}
              onOpenMap={() => setIsMapOpen(true)}
              activeFilterCount={activeFilterCount}
            />
          </div>
        </PageHeader>
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-4">
          <CreatorBrowseContent
            filteredCreators={filteredCreators}
            filters={filters}
            mapFilters={debouncedFilters}
            onFilterChange={handleFilterChange}
            onResetFilters={resetFilters}
            isLoading={isLoading}
            error={error}
            isFiltersOpen={isFiltersOpen}
            onFiltersOpenChange={setIsFiltersOpen}
            isMapOpen={isMapOpen}
            onMapOpenChange={setIsMapOpen}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

const CreatorBrowse: React.FC = () => (
  <ErrorBoundary level="page">
    <CreatorBrowseInner />
  </ErrorBoundary>
);

export default CreatorBrowse;
