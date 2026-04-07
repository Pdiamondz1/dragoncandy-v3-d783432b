import React, { useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorMapView } from '@/components/creator-browse/CreatorMapView';
import AdvancedCreatorFilters from '@/components/creator-search/AdvancedCreatorFilters';
import { BrandCreatorCard } from '@/components/brand-browse/BrandCreatorCard';
import { ShortlistDrawer } from '@/components/brand-browse/ShortlistDrawer';
import { CampaignContextSelector } from '@/components/brand-browse/CampaignContextSelector';
import { EmptyStateNoCampaigns } from '@/components/brand-browse/EmptyStateNoCampaigns';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { useBrandShortlist } from '@/hooks/useBrandShortlist';
import { useBulkInvite } from '@/hooks/useBulkInvite';
import { useBrandActiveCampaigns } from '@/hooks/useBrandActiveCampaigns';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const BrandCreators: React.FC = () => {
  const {
    creators,
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

  const { shortlist, isShortlisted, addToShortlist, removeFromShortlist } = useBrandShortlist();
  const bulkInvite = useBulkInvite();
  const singleInvite = useInviteCreator();
  const { data: campaigns = [], isLoading: campaignsLoading } = useBrandActiveCampaigns();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isShortlistOpen, setIsShortlistOpen] = useState(false);

  // Count active advanced filters
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

  const handleToggleShortlist = useCallback(
    (creatorId: string) => {
      if (isShortlisted(creatorId)) {
        removeFromShortlist.mutate(creatorId);
      } else {
        addToShortlist.mutate(creatorId);
      }
    },
    [isShortlisted, addToShortlist, removeFromShortlist],
  );

  const handleSingleInvite = useCallback(
    (creatorId: string) => {
      if (!selectedCampaignId) {
        toast({
          title: 'Select a campaign first',
          description: 'Choose a campaign from the dropdown to send invitations.',
          variant: 'destructive',
        });
        return;
      }
      singleInvite.mutate({
        campaignId: selectedCampaignId,
        creatorId,
      });
    },
    [selectedCampaignId, singleInvite],
  );

  const handleBulkInvite = useCallback(
    (campaignId: string, creatorIds: string[]) => {
      bulkInvite.mutate({ campaignId, creatorIds });
    },
    [bulkInvite],
  );

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
      <div className="min-h-screen bg-white overflow-x-hidden pb-32 md:pb-0 md:max-w-6xl md:mx-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              Browse & Sponsor
            </h1>
            <CampaignContextSelector
              campaigns={campaigns}
              selectedId={selectedCampaignId}
              onSelect={setSelectedCampaignId}
              isLoading={campaignsLoading}
            />
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Empty state: no campaigns */}
          {!campaignsLoading && campaigns.length === 0 ? (
            <EmptyStateNoCampaigns />
          ) : (
            <>
              {/* Search/filter header */}
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

              {/* Creator grid */}
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-56 bg-gray-100 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : filteredCreators.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="text-5xl mb-4">🔍</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">No creators found</h3>
                  <p className="text-gray-500 text-sm text-center mb-5 max-w-xs">
                    Try expanding your search or adjusting filters to see more creators.
                  </p>
                  <button
                    onClick={resetFilters}
                    className="px-6 py-2.5 bg-teal-400 text-white rounded-full font-semibold text-sm hover:bg-teal-500 transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredCreators.map((creator) => (
                    <BrandCreatorCard
                      key={creator.id}
                      creator={creator}
                      isShortlisted={isShortlisted(creator.user_id)}
                      onToggleShortlist={handleToggleShortlist}
                      onInvite={handleSingleInvite}
                      shortlistLoading={addToShortlist.isPending || removeFromShortlist.isPending}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Filters Sheet */}
        <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <div className="mt-6">
              <AdvancedCreatorFilters
                filters={filters}
                onFilterChange={handleFilterChange}
                onResetFilters={resetFilters}
              />
            </div>
          </SheetContent>
        </Sheet>

        {/* Map Dialog */}
        <Dialog open={isMapOpen} onOpenChange={setIsMapOpen}>
          <DialogContent className="max-w-4xl w-[95vw] h-[80vh] p-0 overflow-hidden">
            <div className="h-full">
              <CreatorMapView
                filteredCreators={filteredCreators}
                filters={debouncedFilters}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Shortlist Drawer */}
        <ShortlistDrawer
          shortlist={shortlist}
          creators={creators}
          campaigns={campaigns}
          selectedCampaignId={selectedCampaignId}
          onSelectCampaign={setSelectedCampaignId}
          onRemove={(creatorId) => removeFromShortlist.mutate(creatorId)}
          onBulkInvite={handleBulkInvite}
          isBulkInviting={bulkInvite.isPending}
          isOpen={isShortlistOpen}
          onOpenChange={setIsShortlistOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default BrandCreators;
