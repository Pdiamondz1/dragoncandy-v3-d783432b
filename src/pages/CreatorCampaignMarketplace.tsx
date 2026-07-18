// src/pages/CreatorCampaignMarketplace.tsx

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns, PublicCampaign } from '@/hooks/usePublicCampaigns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CampaignSwipeCard } from '@/components/campaigns/CampaignSwipeCard';
import { CampaignDetailModal } from '@/components/campaigns/CampaignDetailModal';
import { MarketplaceLoadingState } from '@/components/campaigns/MarketplaceLoadingState';
import { MarketplaceErrorState } from '@/components/campaigns/MarketplaceErrorState';
import { useGroupCampaigns } from '@/hooks/useGroupCampaigns';
import { useCampaignFilters } from '@/hooks/useCampaignFilters';
import { useGeoDistance } from '@/hooks/useGeoDistance';
import { useDonnyMatches } from '@/hooks/useDonnyMatches';
import { CampaignSearchFilters } from '@/components/campaigns/CampaignSearchFilters';
import { DonnyPicksRow } from '@/components/campaigns/DonnyPicksRow';
import { MapPin, Target } from 'lucide-react';
import { CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatBudget, formatCampaignPrice } from '@/lib/campaignUtils';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { useSkippedCampaignIds, useSkipCampaign, useRestoreCampaign } from '@/hooks/useCampaignSkips';
import { useCreatorPendingInvitations, useDeclineInvitation } from '@/hooks/useCampaignInvitations';
import { useCreatorGroupInvitations } from '@/hooks/useCreatorGroupInvitations';
import { useMyCrewActivity } from '@/hooks/useMyCrewActivity';
import { GroupInviteCard } from '@/components/groups/GroupInviteCard';
import { CrewActivityFeed } from '@/components/groups/CrewActivityFeed';
import { UndoToast } from '@/components/campaigns/UndoToast';
import { AppCard } from '@/components/app/AppCard';
import { Button } from '@/components/ui/button';


type Tab = 'all' | 'donny' | 'invitations' | 'crews';

interface PendingInvitation {
  id: string;
  created_at: string;
  invitation_message: string | null;
  _business_name: string | null;
  _owner_profile: { full_name: string | null; avatar_url: string | null } | null;
  campaigns: {
    id: string;
    title: string;
    description: string | null;
    fixed_price: number | null;
    pricing_type: string | null;
    budget_min: number | null;
    budget_max: number | null;
    deadline: string | null;
    platforms: string[] | null;
  } | null;
}

const CreatorCampaignMarketplace = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: pendingInvitations = [] } = useCreatorPendingInvitations();
  const declineInvitation = useDeclineInvitation();
  const {
    invitations: crewInvitations,
    accept: acceptCrew,
    decline: declineCrew,
  } = useCreatorGroupInvitations();
  const {
    activity: myCrewActivity,
    isLoading: crewActivityLoading,
    isError: crewActivityError,
  } = useMyCrewActivity();
  const { completeMission } = useFirstRunMissions();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { completeMission('view_campaigns'); }, []);
  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading, error } = usePublicCampaigns(user?.id);
  const { data: groupCampaigns = [], isLoading: isGroupLoading } = useGroupCampaigns(user?.id);
  // Hide crew campaigns the creator has already applied to (mirrors the "All" tab's
  // !user_applied filter) so re-opening one can't hit a duplicate-application error.
  const availableGroupCampaigns = groupCampaigns.filter((c) => !c.user_applied);

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

  // Deep-link: /dashboard/creator/campaigns?crews=1 opens the Crews tab
  // (kept in sync with the crew-invite notification actionUrl).
  const [activeTab, setActiveTab] = useState<Tab>(searchParams.get('crews') ? 'crews' : 'all');
  // Also honor the deep-link when the param arrives while the page is already
  // mounted (React Router updates search params without remounting).
  useEffect(() => {
    if (searchParams.get('crews')) {
      setActiveTab('crews');
    }
  }, [searchParams]);
  const [detailCampaign, setDetailCampaign] = useState<PublicCampaign | null>(null);
  const [detailReadOnly, setDetailReadOnly] = useState(false);

  const { data: persistedSkips = new Set<string>() } = useSkippedCampaignIds();
  const [sessionSkips, setSessionSkips] = useState<Set<string>>(new Set());
  const skippedIds = new Set([...persistedSkips, ...sessionSkips]);

  const skipCampaign = useSkipCampaign();
  const restoreCampaign = useRestoreCampaign();

  const [undoTarget, setUndoTarget] = useState<string | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [showCycled, setShowCycled] = useState(false);

  if (isLoading) {
    return <MarketplaceLoadingState />;
  }

  if (error) {
    return <MarketplaceErrorState />;
  }

  const donnyPickIds = new Set(donnyPicks.map((p) => p.campaign.id));

  const availableCampaigns = filteredBySearch.filter(
    (c) => !c.user_applied && !donnyPickIds.has(c.id) && (showCycled || !skippedIds.has(c.id))
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
      setSessionSkips((prev) => new Set(prev).add(campaign.id));
      setUndoTarget(campaign.id);
      setShowUndo(true);
    }
  };

  const handleUndo = () => {
    if (undoTarget) {
      setSessionSkips((prev) => {
        const next = new Set(prev);
        next.delete(undoTarget);
        return next;
      });
      restoreCampaign.mutate(undoTarget);
    }
    setShowUndo(false);
    setUndoTarget(null);
  };

  const handleUndoExpire = () => {
    if (undoTarget) {
      skipCampaign.mutate(undoTarget);
    }
    setShowUndo(false);
    setUndoTarget(null);
  };

  const handleShowCycled = () => {
    setShowCycled(true);
  };

  const handleViewDetail = (campaign: PublicCampaign) => {
    setDetailReadOnly(false);
    setDetailCampaign(campaign);
  };

  const handleApplicationSubmitted = () => {
    if (detailCampaign) {
      setSessionSkips((prev) => new Set(prev).add(detailCampaign.id));
    }
    setDetailCampaign(null);
    queryClient.invalidateQueries({ queryKey: ['public-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['group-campaigns'] });
    queryClient.invalidateQueries({ queryKey: ['creator-applications'] });
  };

  const tabs: { id: Tab; label: string; badge?: number; disabled?: boolean }[] = [
    { id: 'all', label: 'All Campaigns' },
    { id: 'donny', label: 'Donny Picks' },
    { id: 'invitations', label: 'Invitations', badge: pendingInvitations?.length ?? 0 },
    { id: 'crews', label: 'Crews', badge: crewInvitations.length },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex flex-col min-h-screen bg-white">
        <PageHeader>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">Campaigns</h1>
            {availableFilteredCount > 0 && (
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-dc-pink-accent flex-shrink-0" aria-hidden="true" />
                <span className="text-xs text-gray-600">
                  {availableFilteredCount} campaign{availableFilteredCount !== 1 ? 's' : ''} available
                </span>
              </div>
            )}
          </div>
        </PageHeader>

        {/* Tab Bar */}
        <div className="flex bg-white border-b-2 border-dc-teal/15 px-4">
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
              {tab.badge && tab.badge > 0 ? (
                <span className="ml-1.5 bg-pink-500 text-white text-[10px] font-bold min-w-[16px] h-4 inline-flex items-center justify-center rounded-full px-1">
                  {tab.badge}
                </span>
              ) : null}
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
                <p className="text-xs text-dc-text-muted text-center">
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
                  skippedCount={skippedIds.size}
                  onShowSkipped={handleShowCycled}
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
                  <p className="text-dc-text font-semibold mb-2">
                    {filters.distanceRadius !== 'any'
                      ? 'No campaigns in your area yet.'
                      : 'No campaigns found.'}
                  </p>
                  <p className="text-dc-text-muted text-sm mb-4">
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
                  <p className="text-sm text-gray-500">
                    Hey! There are no available campaigns to view at this time! Please check back later!
                  </p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
                  {availableCampaigns.map((campaign) => (
                    <AppCard
                      key={campaign.id}
                      className="p-0 hover:shadow-lg transition-shadow cursor-pointer hover:border-dc-teal/30"
                      onClick={() => handleViewDetail(campaign)}
                    >
                      <CardContent className="p-5 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2">
                          {campaign.title}
                        </h3>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-dc-teal/15">
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
                    </AppCard>
                  ))}
                </div>
              )}

              {/* Desktop: Previously Skipped Section */}
              {!showCycled && skippedIds.size > 0 && (
                <div className="mt-8 max-w-6xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-dc-text">Previously Skipped</h3>
                    <span className="text-sm text-dc-text-muted">{skippedIds.size} campaign{skippedIds.size !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBySearch
                      .filter((c) => skippedIds.has(c.id) && !c.user_applied)
                      .map((campaign) => (
                        <AppCard key={campaign.id}>
                          <h4 className="font-semibold text-sm text-gray-900 mb-1 truncate">{campaign.title}</h4>
                          <p className="text-xs text-gray-500 mb-3 truncate">
                            {campaign.business_profile?.business_name ?? 'Unknown Business'} &bull; {formatBudget(campaign)}
                          </p>
                          <button
                            onClick={() => {
                              restoreCampaign.mutate(campaign.id);
                              setSessionSkips((prev) => {
                                const next = new Set(prev);
                                next.delete(campaign.id);
                                return next;
                              });
                            }}
                            className="w-full text-center text-sm font-semibold text-dc-teal border border-dc-teal rounded-full py-1.5 hover:bg-dc-teal/5 transition-colors"
                          >
                            Restore
                          </button>
                        </AppCard>
                      ))}
                  </div>
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
                  <AppCard
                    key={pick.campaign.id}
                    onClick={() => handleViewDetail(pick.campaign)}
                    className="cursor-pointer hover:shadow-md transition-shadow"
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
                  </AppCard>
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

        {activeTab === 'invitations' && (
          <div className="space-y-3 px-4 md:px-0 py-4">
            {pendingInvitations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-900 font-semibold text-lg">No pending invitations</p>
                <p className="text-gray-500 text-sm mt-1">When you're invited to campaigns, they'll appear here.</p>
              </div>
            ) : (
              pendingInvitations.map((inv: PendingInvitation) => {
                const campaign = inv.campaigns;
                const businessName = inv._business_name ?? inv._owner_profile?.full_name;
                return (
                  <div key={inv.id} className="bg-teal-50 border-2 border-dc-teal rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-dc-teal flex items-center justify-center text-white font-bold text-sm">
                        {businessName?.[0] ?? '?'}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-900">{businessName}</p>
                        <p className="text-xs text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-[10px] font-semibold text-dc-teal bg-white border border-dc-teal px-2 py-0.5 rounded-full">
                        Invited
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900 mb-1">
                      {campaign?.title}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      {campaign ? formatBudget(campaign) : 'Budget TBD'}
                      {campaign?.platforms?.length ? ` · ${campaign.platforms.join(', ')}` : ''}
                      {campaign?.deadline ? ` · Due ${new Date(campaign.deadline).toLocaleDateString()}` : ''}
                    </p>
                    {inv.invitation_message && (
                      <div className="bg-white rounded-lg border-l-[3px] border-dc-teal px-3 py-2 mb-3 italic text-sm text-gray-600">
                        "{inv.invitation_message}"
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="dc-primary"
                        size="sm"
                        className="flex-1 text-sm"
                        onClick={() => {
                          navigate(`/dashboard/creator/campaigns/${campaign?.id}?invited=true`);
                        }}
                      >
                        Apply Now
                      </Button>
                      <Button
                        variant="dc-secondary"
                        size="sm"
                        className="flex-1 text-sm"
                        onClick={() => declineInvitation.mutate(inv.id)}
                        disabled={declineInvitation.isPending}
                      >
                        Decline
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'crews' && (
          <div className="space-y-3 px-4 md:px-0 py-4">
            {crewInvitations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-900 font-semibold text-lg">No crew invitations right now.</p>
                <p className="text-gray-500 text-sm mt-1">
                  When a business invites you to a crew, it'll appear here.
                </p>
              </div>
            ) : (
              crewInvitations.map((inv) => {
                const isPending =
                  (acceptCrew.isPending && acceptCrew.variables === inv.group_id) ||
                  (declineCrew.isPending && declineCrew.variables === inv.group_id);
                return (
                  <GroupInviteCard
                    key={inv.id}
                    invitation={inv}
                    onAccept={() => acceptCrew.mutate(inv.group_id)}
                    onDecline={() => declineCrew.mutate(inv.group_id)}
                    isPending={isPending}
                  />
                );
              })
            )}
            {/* Group campaign feed — free, private crew collabs (RLS-scoped to this
                creator's crews). Reuses CampaignDetailModal + CampaignApplyForm via
                handleViewDetail, exactly like the "All" tab. */}
            <div className="pt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 px-1">Crew campaigns</h3>
              {isGroupLoading ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">Loading crew campaigns…</p>
                </div>
              ) : availableGroupCampaigns.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm">No crew campaigns yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availableGroupCampaigns.map((campaign) => (
                    <AppCard
                      key={campaign.id}
                      variant="emphasis"
                      className="p-0 hover:shadow-lg transition-shadow cursor-pointer"
                      onClick={() => handleViewDetail(campaign)}
                    >
                      <CardContent className="p-5 space-y-3">
                        {campaign.crew_name && (
                          <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-teal-200">
                            {campaign.crew_name}
                          </span>
                        )}
                        <h3 className="font-bold text-gray-900 text-base leading-tight line-clamp-2">
                          {campaign.title}
                        </h3>
                        {campaign.description && (
                          <p className="text-sm text-gray-500 line-clamp-2">{campaign.description}</p>
                        )}
                        <div className="flex items-center justify-between pt-2 border-t border-dc-teal/15">
                          <span className="text-sm text-dc-teal font-semibold">{formatCampaignPrice(campaign)}</span>
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
                    </AppCard>
                  ))}
                </div>
              )}
            </div>

            {/* Compact cross-crew activity strip — RLS returns only the rows this
                creator may see across all their crews. */}
            <div className="pt-2">
              <h3 className="text-sm font-bold text-gray-900 mb-3 px-1">Crew activity</h3>
              <CrewActivityFeed
                compact
                items={myCrewActivity}
                isLoading={crewActivityLoading}
                isError={crewActivityError}
              />
            </div>
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

        <UndoToast visible={showUndo} onUndo={handleUndo} onExpire={handleUndoExpire} />
      </div>
    </DashboardLayout>
  );
};

export default CreatorCampaignMarketplace;
