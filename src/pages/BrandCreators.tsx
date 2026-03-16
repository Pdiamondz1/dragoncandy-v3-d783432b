import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorBrowseContent } from '@/components/creator-browse/CreatorBrowseContent';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';

const BrandCreators: React.FC = () => {
  const {
    filteredCreators,
    filters,
    debouncedFilters,
    isLoading,
    error,
    handleFilterChange,
    resetFilters,
  } = useCreatorBrowse();

  return (
    <DashboardLayout userRole="brand">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <CreatorBrowseHeader resultCount={filteredCreators.length} />
          <CreatorBrowseContent
            filteredCreators={filteredCreators}
            filters={filters}
            mapFilters={debouncedFilters}
            onFilterChange={handleFilterChange}
            onResetFilters={resetFilters}
            isLoading={isLoading}
            error={error}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandCreators;
