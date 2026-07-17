// src/pages/BusinessDashboard.tsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DCTour } from '@/components/guidance/DCTour';
import { TourButton } from '@/components/guidance/TourButton';
import { useTour } from '@/hooks/useTour';
import { Loader2, ChevronRight, Megaphone, Users, DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { HeroPrimaryAction } from '@/components/dashboard/HeroPrimaryAction';
import { StatsRow, type StatItem } from '@/components/dashboard/StatsRow';
import { NeedsAttentionSection } from '@/components/dashboard/NeedsAttentionSection';
import { RecentActivitySection } from '@/components/dashboard/RecentActivitySection';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { DragonPointsCard } from '@/components/dragonshare/DragonPointsCard';
import { DragonShareActivityCard } from '@/components/dragonshare/DragonShareActivityCard';
import { useOrgBoostStats } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { useBusinessDragonShareActivity } from '@/hooks/useBusinessDragonShareActivity';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { PendingActionBanners } from '@/components/dashboard/PendingActionBanners';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { SponsorshipRatingPromptManager } from '@/components/reviews/SponsorshipRatingPromptManager';
import { useLocationReadiness } from '@/hooks/useLocationReadiness';
import { LocationBadge } from '@/components/org/LocationBadge';
import { UpcomingPostsWidget } from '@/components/outstand/UpcomingPostsWidget';
import { LocationEmptyState } from '@/components/org/LocationEmptyState';


function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BusinessDashboard = () => {
  const { profile, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns(activeOrgUnit?.id);
  const { data: org } = useOrg();
  const { data: dsBoosts } = useOrgBoostStats(org?.id);
  const { data: dsActivity, isLoading: dsActivityLoading } = useBusinessDragonShareActivity(org?.id);
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();
  const { isReady, missingSocial, missingStripe, locationName, hasActiveLocation } = useLocationReadiness();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="business_client"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (!profile) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-24 md:pb-12">
            <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-10">
              <div className="space-y-3">
                <DCSkeleton variant="text-block" className="h-3 w-32" />
                <DCSkeleton variant="text-block" className="h-8 w-48" />
              </div>
              <DCSkeleton variant="text-block" className="h-12 w-full lg:w-72 rounded-full" />
              <DCSkeleton variant="list-row" count={3} />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const recentCampaigns = campaigns?.slice(0, 3) ?? [];
  const hasMore = (campaigns?.length ?? 0) > 3;

  const businessStats: StatItem[] = [
    { label: 'Active', value: campaignsLoading ? '…' : recentCampaigns.length, icon: Megaphone, href: '/dashboard/business/campaigns' },
    { label: 'Creators', value: '—', subtitle: 'In your network', icon: Users, href: '/dashboard/business/creators' },
    { label: 'Spend', value: '—', icon: DollarSign, href: '/dashboard/payments' },
    { label: 'ROI', value: '—', icon: TrendingUp, href: '/dashboard/analytics' },
  ];

  const campaignsContent = campaignsLoading ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
    </div>
  ) : recentCampaigns.length === 0 ? (
    <div className="py-4 text-center">
      <LocationEmptyState
        icon={Megaphone}
        titleTemplate="[Location] is ready for its first campaign"
        cta={{ label: 'Create Campaign', to: '/dashboard/business/campaigns/create' }}
      />
    </div>
  ) : (
    <div>
      {recentCampaigns.map((campaign) => (
        <ActivityFeedCard
          key={campaign.id}
          title={campaign.title}
          subtitle={`${campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due ${formatDate(campaign.deadline)}`}
          status={campaign.displayStatus}
          onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
        />
      ))}
      {hasMore && (
        <Link
          to="/dashboard/business/campaigns"
          className="block text-center text-sm font-semibold text-dc-teal-btn hover:underline pt-3"
        >
          View all campaigns
        </Link>
      )}
    </div>
  );

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-24 md:pb-12">
          <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-10 lg:space-y-14">

            {/* Greeting + the one loud CTA */}
            <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-8">
              <DashboardGreeting
                roleLabel="Restaurant Dashboard"
                userName={profile.full_name || 'there'}
                badge={<LocationBadge />}
              />
              <div data-tour="brief-generator">
                <HeroPrimaryAction
                  label="Create a Campaign with Donny"
                  to="/dashboard/business/campaigns/create"
                  secondary={{ label: 'Browse Creators', to: '/dashboard/business/creators' }}
                />
              </div>
            </div>

            {/* Everything that needs action, in one quiet frame */}
            <NeedsAttentionSection>
              {hasActiveLocation && !isReady && (
                <div className="flex items-start gap-3 px-4 py-2.5 border-l-2 border-l-amber-400">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-dc-text flex-1 min-w-0">
                    <span className="font-semibold">Complete {locationName}'s setup</span> — this location needs
                    {missingStripe && ' a connected Stripe account'}
                    {missingStripe && missingSocial && ' and'}
                    {missingSocial && ' at least one social media account'}
                    {' '}before you can create campaigns, promotions, or use DragonShare.{' '}
                    <button
                      onClick={() => navigate('/dashboard/business/settings')}
                      className="font-semibold text-dc-teal-btn hover:underline"
                    >
                      Go to Settings →
                    </button>
                  </p>
                </div>
              )}
              <PendingActionBanners />
              <RatingPromptManager variant="row" />
              <SponsorshipRatingPromptManager variant="row" />
            </NeedsAttentionSection>

            {/* Quiet stats + DragonShare tile */}
            <section className="space-y-4 lg:space-y-0 lg:flex lg:items-center lg:justify-between lg:gap-8">
              <StatsRow stats={businessStats} isLoading={campaignsLoading} />
              <div className="lg:w-72 lg:shrink-0 space-y-3">
                <DragonPointsCard />
                <DragonShareStatTile
                  label="DragonShare boosts"
                  totalCents={dsBoosts?.totalCents ?? 0}
                  count={dsBoosts?.count ?? 0}
                  href="/dashboard/business/dragonshare"
                />
              </div>
            </section>

            {/* One framed activity zone instead of stacked feeds */}
            <RecentActivitySection
              groups={[
                {
                  id: 'campaigns',
                  label: 'Campaigns',
                  count: recentCampaigns.length,
                  content: campaignsContent,
                },
                {
                  id: 'dragonshare',
                  label: 'DragonShare',
                  content: (
                    <DragonShareActivityCard
                      role="business"
                      items={dsActivity ?? []}
                      isLoading={dsActivityLoading}
                    />
                  ),
                },
              ]}
              action={
                <>
                  {hasMore && (
                    <Link
                      to="/dashboard/business/campaigns"
                      className="text-xs font-semibold text-dc-teal-btn hover:underline flex items-center gap-0.5"
                    >
                      View all <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}
                  <TourButton onClick={triggerTour} />
                </>
              }
            />

            <UpcomingPostsWidget />

          </div>
        </div>
        {showTour && tourSteps.length > 0 && (
          <DCTour steps={tourSteps} onComplete={completeTour} onSkip={skipTour} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default BusinessDashboard;
