import React, { useState, useCallback, useMemo, useEffect, Component, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CreatorBrowseHeader } from '@/components/creator-browse/CreatorBrowseHeader';
import { CreatorMapView } from '@/components/creator-browse/CreatorMapView';
import { AdvancedCreatorFilters } from '@/components/creator-search/AdvancedCreatorFilters';
import { BrandCreatorCard } from '@/components/brand-browse/BrandCreatorCard';
import { ShortlistDrawer } from '@/components/brand-browse/ShortlistDrawer';
import { CampaignContextSelector } from '@/components/brand-browse/CampaignContextSelector';
import { EmptyStateNoCampaigns } from '@/components/brand-browse/EmptyStateNoCampaigns';
import { CreatorMetricFilters, type MetricFilters } from '@/components/outstand/CreatorMetricFilters';
import { useCreatorBrowse } from '@/hooks/useCreatorBrowse';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreButton } from '@/components/shared/LoadMoreButton';
import { useBrandShortlist } from '@/hooks/useBrandShortlist';
import { useBulkInvite } from '@/hooks/useBulkInvite';
import { useBrandActiveCampaigns } from '@/hooks/useBrandActiveCampaigns';
import { useInviteCreator } from '@/hooks/useCampaignInvitations';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { AlertCircle, RefreshCw, Users } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import { toast } from '@/hooks/use-toast';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';

/** Maps creator_profiles URL fields to social_analytics_cache platform names */
const URL_FIELD_TO_PLATFORM: Record<string, string> = {
  instagram_url: 'instagram',
  tiktok_url: 'tiktok',
  youtube_url: 'youtube',
  x_url: 'x',
};

/** Local error boundary so Browse Creators never crashes the whole app */
class BrowseCreatorsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BrandCreators] Caught render error:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <DashboardLayout userRole="brand">
          <div className="min-h-screen bg-white flex items-center justify-center p-4">
            <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 mb-2">Unable to load creators</h3>
              <p className="text-gray-500 text-sm mb-4">
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <button
                onClick={() => {
                  this.setState({ hasError: false, error: undefined });
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-dc-teal-btn text-white rounded-full font-semibold text-sm hover:bg-dc-teal-btn-hover transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </DashboardLayout>
      );
    }
    return this.props.children;
  }
}

const BrandCreators: React.FC = () => {
  const { completeMission } = useFirstRunMissions();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { completeMission('browse_creators'); }, []);

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
  const [metricFilters, setMetricFilters] = useState<MetricFilters>({
    platforms: [],
    minFollowers: 0,
    minEngagement: 0,
    sortBy: 'engagement',
  });

  // Collect user_ids from the current filtered list for bulk social stats
  const creatorUserIds = useMemo(
    () => filteredCreators.map((c) => c.user_id).filter(Boolean),
    [filteredCreators],
  );

  // Bulk-fetch follower counts from social_analytics_cache for all visible creators
  const { data: bulkSocialRows } = useQuery({
    queryKey: ['bulk-social-stats', creatorUserIds],
    queryFn: async () => {
      if (creatorUserIds.length === 0) return [];
      const { data, error } = await supabase
        .from('social_analytics_cache')
        .select('user_id, platform, metric_value')
        .in('user_id', creatorUserIds)
        .eq('metric_type', 'followers')
        .order('fetched_at', { ascending: false });
      if (error) return [];
      return data ?? [];
    },
    enabled: creatorUserIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Build a map: user_id → { platform → followers, totalFollowers }
  const socialStatsByUser = useMemo(() => {
    const map = new Map<string, { platforms: Set<string>; totalFollowers: number }>();
    for (const row of bulkSocialRows ?? []) {
      const userId = row.user_id as string;
      const platform = (row.platform as string).toLowerCase();
      const followers = Number(row.metric_value) || 0;
      if (!map.has(userId)) map.set(userId, { platforms: new Set(), totalFollowers: 0 });
      const entry = map.get(userId)!;
      if (!entry.platforms.has(platform)) {
        entry.platforms.add(platform);
        entry.totalFollowers += followers;
      }
    }
    return map;
  }, [bulkSocialRows]);

  // Apply metric filters as a secondary client-side pass over filteredCreators
  const metricFilteredCreators = useMemo(() => {
    const hasActivePlatforms = metricFilters.platforms.length > 0;
    const hasMinFollowers = metricFilters.minFollowers > 0;
    const needsFilter = hasActivePlatforms || hasMinFollowers;

    let result = needsFilter
      ? filteredCreators.filter((creator) => {
          // Platform filter: check social_analytics_cache first, then fall back to URL fields
          if (hasActivePlatforms) {
            const stats = socialStatsByUser.get(creator.user_id);
            if (stats && stats.platforms.size > 0) {
              const hasMatch = metricFilters.platforms.some((p) => stats.platforms.has(p.toLowerCase()));
              if (!hasMatch) return false;
            } else {
              // Fallback: derive platforms from profile URL fields
              const profilePlatforms = Object.entries(URL_FIELD_TO_PLATFORM)
                .filter(([field]) => !!creator[field as keyof typeof creator])
                .map(([, platform]) => platform);
              const hasMatch = metricFilters.platforms.some((p) => profilePlatforms.includes(p.toLowerCase()));
              if (!hasMatch) return false;
            }
          }

          // Min followers filter (requires social stats data)
          if (hasMinFollowers) {
            const stats = socialStatsByUser.get(creator.user_id);
            const total = stats?.totalFollowers ?? 0;
            if (total < metricFilters.minFollowers) return false;
          }

          return true;
        })
      : filteredCreators;

    // Sort by metric filter sortBy (layered on top of existing sort)
    if (metricFilters.sortBy === 'followers') {
      result = [...result].sort((a, b) => {
        const aFollowers = socialStatsByUser.get(a.user_id)?.totalFollowers ?? 0;
        const bFollowers = socialStatsByUser.get(b.user_id)?.totalFollowers ?? 0;
        return bFollowers - aFollowers;
      });
    } else if (metricFilters.sortBy === 'recent') {
      // 'recent' defers to the existing sort from useCreatorBrowse (created_at desc)
      // no additional sort needed
    }
    // 'engagement' is the default — no social engagement data yet, keep existing order

    return result;
  }, [filteredCreators, metricFilters, socialStatsByUser]);

  const creatorPage = usePagedList(metricFilteredCreators, 12);

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
        <ErrorState message={error.message} onRetry={() => window.location.reload()} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden pb-32 md:pb-0 md:max-w-6xl md:mx-auto">
        {/* Sticky header */}
        <div className="sticky top-0 z-30 bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-4">
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
                resultCount={metricFilteredCreators.length}
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

              {/* Verified metric filters */}
              <CreatorMetricFilters filters={metricFilters} onChange={setMetricFilters} />

              {/* Creator grid */}
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <DCSkeleton variant="card" count={8} className="h-56" />
                </div>
              ) : metricFilteredCreators.length === 0 ? (
                <DCEmptyState
                  icon={Users}
                  title="No creators found"
                  subtitle="Try adjusting your filters or check back later"
                  cta={{ label: "Clear Filters", onClick: resetFilters }}
                />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {creatorPage.visible.map((creator) => (
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
                  <LoadMoreButton
                    hasMore={creatorPage.hasMore}
                    showing={creatorPage.showing}
                    total={creatorPage.total}
                    onClick={creatorPage.loadMore}
                    noun="creators"
                  />
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
                filteredCreators={metricFilteredCreators}
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

const BrandCreatorsPage: React.FC = () => (
  <BrowseCreatorsErrorBoundary>
    <BrandCreators />
  </BrowseCreatorsErrorBoundary>
);

export default BrandCreatorsPage;
