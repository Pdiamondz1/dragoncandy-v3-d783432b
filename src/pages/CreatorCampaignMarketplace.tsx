// src/pages/CreatorCampaignMarketplace.tsx

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns, PublicCampaign } from '@/hooks/usePublicCampaigns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CampaignSwipeCard } from '@/components/campaigns/CampaignSwipeCard';
import { CampaignDetailModal } from '@/components/campaigns/CampaignDetailModal';
import { MarketplaceLoadingState } from '@/components/campaigns/MarketplaceLoadingState';
import { MarketplaceErrorState } from '@/components/campaigns/MarketplaceErrorState';
import { useCampaignFilters } from '@/hooks/useCampaignFilters';
import { useGeoDistance } from '@/hooks/useGeoDistance';
import { useDonnyMatches } from '@/hooks/useDonnyMatches';
import { CampaignSearchFilters } from '@/components/campaigns/CampaignSearchFilters';
import { DonnyPicksRow } from '@/components/campaigns/DonnyPicksRow';
import { MapPin, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatBudget } from '@/lib/campaignUtils';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';


type Tab = 'all' | 'donny';

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const { completeMission } = useFirstRunMissions();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { completeMission('view_campaigns'); }, []);
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);

  const { campaigns: geoCampaigns } = useGeoDistance(campaigns);

  const {
    filters,
    filteredCampaigns: filteredBySearch,
    hasActiveFilters,
    setSearchTerm,
    setContentType,
    setDeliveryTier,
    setSortBy,
    setDistanceRadius,
    setBudgetMin,
    setBudgetMax,
    clearFilters,
  } = useCampaignFilters(geoCampaigns);

  const donnyPicks = useDonnyMatches(filteredBySearch);

  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [detailCampaign, setDetailCampaign] = useState<PublicCampaign | null>(null);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const donnyPickIds = new Set(donnyPicks.map((p) => p.campaign.id));

  const availableCampaigns = filteredBySearch.filter(
    (c) => !c.user_applied && !skippedIds.has(c.id) && !donnyPickIds.has(c.id)
  );

  const swipeCampaigns = [
    ...donnyPicks.map((p) => p.campaign),
    ...availableCampaigns,
  ];

  const availableFilteredCount = swipeCampaigns.length;

  const matchScoresMap = new Map(
    donnyPicks.map((p) => [p.campaign.id, { score: p.score, matchReasons: p.matchReasons }])
  );

  const handleSwipe = (direction: string, campaign: PublicCampaign) => {
    if (direction === 'right') {
      setDetailReadOnly(false);
      setDetailCampaign(campaign);
    } else if (direction === 'left') {
      setSkippedIds((prev) => new Set(prev).add(campaign.id));
    }
  };

  const handleViewDetail = (campaign: PublicCampaign) => {
    setDetailReadOnly(false);
    setDetailCampaign(campaign);
  };

  const handleApplicationSubmitted = () => {
    if (detailCampaign) {
      setSkippedIds((prev) => new Set(prev).add(detailCampaign.id));
    }
    setDetailCampaign(null);
    queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
  };

  const tabs: { id: Tab; label: string; badge?: number; disabled?: boolean }[] = [
    { id: 'all', label: 'All Campaigns' },
    { id: 'donny', label: 'Donny Picks' },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex flex-col min-h-screen bg-white">
        <PageHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" aria-hidden="true" />
                <span className="text-xs text-gray-600">
                  {availableFilteredCount} campaign{availableFilteredCount !== 1 ? 's' : ''} available
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden bg-dc-pink-bg flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-dc-teal-dark">
                {user?.email?.charAt(0).toUpperCase() ?? 'C'}
              </span>
            </div>
          </div>
        </PageHeader>

        {/* Tab Bar */}
        <div className="flex bg-white border-b-2 border-gray-100 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              className={`flex-1 text-center py-3 text-sm font-semibold transition-colors relative ${
                tab.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : activeTab === tab.id
                    ? 'text-dc-teal'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className="ml-1 bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">
                  {tab.badge}
                </span>
              )}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dc-teal" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'all' && (
          <>
            {/* Search & Filters */}
            <CampaignSearchFilters
              filters={filters}
              filteredCount={availableFilteredCount}
              hasActiveFilters={hasActiveFilters}
              onSearchChange={setSearchTerm}
              onContentTypeChange={setContentType}
              onDeliveryTierChange={setDeliveryTier}
              onSortChange={setSortBy}
              onDistanceChange={setDistanceRadius}
              onBudgetMinChange={setBudgetMin}
              onBudgetMaxChange={setBudgetMax}
              onClearFilters={clearFilters}
            />

            {donnyPicks.length === 0 && swipeCampaigns.length > 0 && (
              <div className="px-4 pb-1">
                <p className="text-xs text-white/40 text-center">
                  We're still learning your preferences. Complete more campaigns to improve your matches.
                </p>
              </div>
            )}

            {/* Swipe card stack — mobile */}
            <div className="flex-1 px-4 pb-4 md:hidden">
              <div className="pt-4">
                <CampaignSwipeCard
                  campaigns={swipeCampaigns}
                  onSwipe={handleSwipe}
                  onViewDetail={handleViewDetail}
                  matchScores={matchScoresMap}
                />
              </div>
              {swipeCampaigns.length > 0 && (
                <div className="flex items-center justify-center gap-6 mt-4">
                  <span className="text-xs text-gray-400">← Skip</span>
                  <span className="text-xs text-gray-400">View Details →</span>
                </div>
              )}
              {swipeCampaigns.length === 0 && hasActiveFilters && (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <p className="text-white font-semibold mb-2">
                    {filters.distanceRadius !== 'any'
                      ? 'No campaigns in your area yet.'
                      : 'No campaigns found.'}
                  </p>
                  <p className="text-white/60 text-sm mb-4">
                    {filters.distanceRadius !== 'any'
                      ? 'Expand your search radius or check back soon.'
                      : 'Try different filters or ask Donny for suggestions.'}
                  </p>
                  <button
                    onClick={filters.distanceRadius !== 'any'
                      ? () => setDistanceRadius('any')
                      : clearFilters}
                    className="rounded-full bg-dc-teal-btn text-white text-sm font-bold px-6 py-2 hover:bg-dc-teal-btn-hover transition-colors"
                  >
                    {filters.distanceRadius !== 'any' ? 'Expand radius' : 'Clear filters'}
                  </button>
                </div>
              )}
            </div>

            {/* Grid view — desktop */}
            <div className="hidden md:block px-4 pb-8 pt-4">
              <div className="max-w-6xl mx-auto">
                <DonnyPicksRow picks={donnyPicks} onViewDetail={handleViewDetail} />
              </div>

              {availableCampaigns.length === 0 && donnyPicks.length === 0 ? (
                <div className="border-2 border-dc-teal rounded-2xl p-10 text-center max-w-md mx-auto">
                  <Target className="h-10 w-10 text-dc-teal mx-auto mb-3" aria-hidden="true" />
                  <h3 className="font-bold text-gray-900 mb-1">No campaigns available</h3>
                  <p className="text-sm text-gray-500">You've reviewed all available campaigns. Check back soon for new opportunities!</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                  {availableCampaigns.map((campaign) => (
                    <Card
                      key={campaign.id}
                      className="hover:shadow-lg transition-shadow cursor-pointer border-2 border-transparent hover:border-dc-teal/30"
                      onClick={() => handleViewDetail(campaign)}
                    >
                      <CardContent className="p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2">
                          {campaign.title}
                        </h3>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <span className="text-sm text-dc-teal font-semibold">{formatBudget(campaign)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewDetail(campaign);
                            }}
                            className="rounded-full bg-dc-teal-btn text-white text-xs font-bold px-4 py-1.5 hover:bg-dc-teal-btn-hover transition-colors"
                          >
                            View
                          </button>
                        </div>
                        {campaign.business_profile?.business_name && (
                          <p className="text-xs text-gray-500">by {campaign.business_profile.business_name}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'donny' && (
          <div className="px-4 py-4">
            {donnyPicks && donnyPicks.length > 0 ? (
              <div className="space-y-3">
                {donnyPicks.map((pick) => (
                  <div
                    key={pick.campaign.id}
                    onClick={() => handleViewDetail(pick.campaign)}
                    className="bg-white rounded-2xl p-4 cursor-pointer hover:shadow-md transition-shadow border border-teal-200"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{pick.campaign.title}</div>
                        <div className="text-xs text-gray-500">{pick.campaign.business_profile?.business_name || 'Unknown Business'}</div>
                      </div>
                      <span className="bg-teal-50 text-teal-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                        {pick.score || 0}% match
                      </span>
                    </div>
                    {pick.matchReasons?.length > 0 && (
                      <p className="text-xs text-gray-500">{pick.matchReasons[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-600 font-semibold">No Donny Picks yet</p>
                <p className="text-gray-400 text-sm mt-1">Apply to more campaigns so Donny can learn your preferences</p>
              </div>
            )}
          </div>
        )}

        {/* Detail Modal */}
        {detailCampaign && (
          <CampaignDetailModal
            campaign={detailCampaign}
            isOpen={!!detailCampaign}
            onClose={() => setDetailCampaign(null)}
            onApplicationSubmitted={handleApplicationSubmitted}
            readOnly={detailReadOnly}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default CreatorCampaignMarketplace;
