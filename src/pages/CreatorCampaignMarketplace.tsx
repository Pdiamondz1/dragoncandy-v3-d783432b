// src/pages/CreatorCampaignMarketplace.tsx

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns, PublicCampaign } from '@/hooks/usePublicCampaigns';
import { useCreatorApplications, CreatorApplication } from '@/hooks/useCreatorApplications';
import DashboardLayout from '@/components/DashboardLayout';
import { CampaignSwipeCard } from '@/components/campaigns/CampaignSwipeCard';
import { CampaignDetailModal } from '@/components/campaigns/CampaignDetailModal';
import { CreatorApplicationCard } from '@/components/campaigns/CreatorApplicationCard';
import MarketplaceLoadingState from '@/components/campaigns/MarketplaceLoadingState';
import MarketplaceErrorState from '@/components/campaigns/MarketplaceErrorState';
import { useCampaignFilters } from '@/hooks/useCampaignFilters';
import { useDonnyMatches } from '@/hooks/useDonnyMatches';
import { CampaignSearchFilters } from '@/components/campaigns/CampaignSearchFilters';
import { DonnyPicksRow } from '@/components/campaigns/DonnyPicksRow';
import { MapPin, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatBudget } from '@/lib/campaignUtils';
import logo from '@/assets/Transparent_DragonCandy_logo.png';

type Tab = 'available' | 'applied' | 'active' | 'done';

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const { data: applications = [], isLoading: appsLoading } = useCreatorApplications();

  const {
    filters,
    filteredCampaigns: filteredBySearch,
    hasActiveFilters,
    setSearchTerm,
    setContentType,
    setDeliveryTier,
    setSortBy,
    clearFilters,
  } = useCampaignFilters(campaigns);

  const donnyPicks = useDonnyMatches(filteredBySearch);

  const [activeTab, setActiveTab] = useState<Tab>('available');
  const [detailCampaign, setDetailCampaign] = useState<PublicCampaign | null>(null);
  const [detailReadOnly, setDetailReadOnly] = useState(false);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  const pendingCount = applications.filter(a => a.status === 'pending').length;

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

  const handleViewApplicationDetail = (application: CreatorApplication) => {
    // Build a PublicCampaign-shaped object from the application data for the modal
    if (!application.campaign) return;
    const c = application.campaign;
    const pseudoCampaign: PublicCampaign = {
      id: c.id,
      title: c.title,
      user_id: c.user_id,
      description: c.description ?? undefined,
      goals: c.goals ?? undefined,
      style: c.style ?? undefined,
      tone: c.tone ?? undefined,
      status: 'published' as const,
      delivery_type: (c.delivery_type ?? undefined) as PublicCampaign['delivery_type'],
      pricing_type: (c.pricing_type ?? undefined) as PublicCampaign['pricing_type'],
      fixed_price: c.fixed_price ?? undefined,
      budget_min: c.budget_min ?? undefined,
      budget_max: c.budget_max ?? undefined,
      deliverables: c.deliverables ?? undefined,
      created_at: application.created_at,
      updated_at: application.updated_at,
      business_profile: application.business_profile ? {
        business_name: application.business_profile.business_name,
        logo_url: application.business_profile.logo_url ?? undefined,
        city: application.business_profile.city ?? undefined,
        country: application.business_profile.country ?? undefined,
      } : undefined,
    };
    setDetailReadOnly(true);
    setDetailCampaign(pseudoCampaign);
  };

  const tabs: { id: Tab; label: string; badge?: number; disabled?: boolean }[] = [
    { id: 'available', label: 'Available' },
    { id: 'applied', label: 'Applied', badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'active', label: 'Active', disabled: true },
    { id: 'done', label: 'Done', disabled: true },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex flex-col min-h-screen bg-dc-gray">
        {/* Page Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <img src={logo} alt="Dragon Candy" className="w-12 h-12" />
          <div className="flex-1 px-3">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" />
              <span className="text-xs text-gray-600">
                {filteredBySearch.filter((c) => !c.user_applied).length} campaign{filteredBySearch.filter((c) => !c.user_applied).length !== 1 ? 's' : ''} available
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full ring-2 ring-dc-teal overflow-hidden bg-dc-pink-bg flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-dc-teal-dark">
              {user?.email?.charAt(0).toUpperCase() ?? 'C'}
            </span>
          </div>
        </div>

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
        {activeTab === 'available' && (
          <>
            {/* Search & Filters */}
            <CampaignSearchFilters
              filters={filters}
              filteredCount={filteredBySearch.filter((c) => !c.user_applied).length}
              hasActiveFilters={hasActiveFilters}
              onSearchChange={setSearchTerm}
              onContentTypeChange={setContentType}
              onDeliveryTierChange={setDeliveryTier}
              onSortChange={setSortBy}
              onClearFilters={clearFilters}
            />

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
                  <span className="text-xs text-white/50">← Skip</span>
                  <span className="text-xs text-white/50">View Details →</span>
                </div>
              )}
              {swipeCampaigns.length === 0 && hasActiveFilters && (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <p className="text-white font-semibold mb-2">No campaigns found</p>
                  <p className="text-white/60 text-sm mb-4">Try different filters or check back soon.</p>
                  <button
                    onClick={clearFilters}
                    className="rounded-full bg-dc-teal text-white text-sm font-bold px-6 py-2 hover:bg-dc-teal-dark transition-colors"
                  >
                    Clear filters
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
                  <Target className="h-10 w-10 text-dc-teal mx-auto mb-3" />
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
                            className="rounded-full bg-dc-teal text-white text-xs font-bold px-4 py-1.5 hover:bg-dc-teal-dark transition-colors"
                          >
                            View
                          </button>
                        </div>
                        {campaign.business_profile?.business_name && (
                          <p className="text-xs text-gray-400">by {campaign.business_profile.business_name}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'applied' && (
          <div className="flex-1 px-4 py-4">
            {appsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gray-200" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
                        <div className="h-3 bg-gray-200 rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/70 text-sm mb-2">No applications yet.</p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="text-dc-teal text-sm font-semibold hover:underline"
                >
                  Browse available campaigns to get started.
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {applications.map((app) => (
                  <CreatorApplicationCard
                    key={app.id}
                    application={app}
                    onViewDetails={handleViewApplicationDetail}
                  />
                ))}
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
