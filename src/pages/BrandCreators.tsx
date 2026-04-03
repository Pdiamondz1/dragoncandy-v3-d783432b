import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorBrowseContent } from '@/components/creator-browse/CreatorBrowseContent';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { AlertCircle } from 'lucide-react';

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

  if (error) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">Unable to load creators</h3>
            <p className="text-gray-500 text-sm">Please refresh the page to try again.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden pb-24 md:pb-0 md:max-w-6xl md:mx-auto">
        {/* Template B header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Creators</h1>
          </div>
        </div>
        <div className="p-4 space-y-4">
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
