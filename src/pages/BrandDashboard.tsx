import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandDashboardStats } from '@/hooks/useBrandDashboardStats';
import { useBrandActiveCampaigns } from '@/hooks/useBrandActiveCampaigns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DCTour } from '@/components/guidance/DCTour';
import { useTour } from '@/hooks/useTour';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { HeroPrimaryAction } from '@/components/dashboard/HeroPrimaryAction';
import { StatsRow, type StatItem } from '@/components/dashboard/StatsRow';
import { RecentActivitySection } from '@/components/dashboard/RecentActivitySection';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { ErrorState } from '@/components/ui/error-state';
import { Rocket, DollarSign, Users, TrendingUp, Loader2, Share2, ChevronRight } from 'lucide-react';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { useOrgBoostStats } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { BrandFreeTrioHero } from '@/components/dashboard/BrandFreeTrioHero';
import { useDashboardLoadTime } from '@/hooks/useDashboardLoadTime';
import { UpcomingPostsWidget } from '@/components/outstand/UpcomingPostsWidget';

function formatSpend(amount: number): string {
  if (amount === 0) return '$0';
  return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount}`;
}

const BrandDashboard = () => {
  const { profile, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErrorObj, refetch: refetchStats } = useBrandDashboardStats();
  const { data: campaigns, isLoading: campaignsLoading } = useBrandActiveCampaigns(activeOrgUnit?.id);
  const { data: org } = useOrg();
  const { data: dsBoosts } = useOrgBoostStats(org?.id);
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();
  useDashboardLoadTime(!statsLoading && !!stats);

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="brand"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (statsError) {
    return (
      <DashboardLayout userRole="brand">
        <ErrorState message={statsErrorObj?.message ?? 'Failed to load dashboard data.'} onRetry={refetchStats} />
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
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

  const brandStats: StatItem[] = [
    { label: 'Active Campaigns', value: statsLoading ? '…' : stats?.activeCampaigns ?? 0, icon: Rocket, href: '/dashboard/brand/discover-campaigns' },
    { label: 'Total Spend', value: statsLoading ? '…' : formatSpend(stats?.totalSpend ?? 0), icon: DollarSign, href: '/dashboard/payments' },
    { label: 'Creators', value: statsLoading ? '…' : stats?.creatorsConnected ?? 0, subtitle: 'In your network', icon: Users, href: '/dashboard/brand/creators' },
    { label: 'Avg. ROI', value: statsLoading ? '…' : `${stats?.avgROI ?? 0}%`, icon: TrendingUp, href: '/dashboard/analytics' },
  ];

  const budgetStats: StatItem[] = [
    {
      label: 'Monthly',
      value: `$${(stats?.monthlyBudget ?? 0).toLocaleString()}`,
      subtitle: stats?.monthlyBudget ? 'Set in profile' : 'Not set',
    },
    {
      label: 'Allocated',
      value: `$${(stats?.allocatedBudget ?? 0).toLocaleString()}`,
      subtitle: `${stats?.budgetPercentage || 0}% of budget`,
    },
    {
      label: 'Available',
      value: `$${(stats?.availableBudget ?? 0).toLocaleString()}`,
      subtitle: 'Ready to allocate',
    },
  ];

  const campaignsContent = campaignsLoading ? (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
    </div>
  ) : !campaigns || campaigns.length === 0 ? (
    <div className="py-6 text-center">
      <p className="text-sm text-dc-text-muted">No active campaigns yet.</p>
      <button
        onClick={() => navigate('/dashboard/brand/campaigns/create')}
        className="text-sm font-semibold text-dc-teal-btn hover:underline mt-1"
      >
        Let Donny help you create one
      </button>
    </div>
  ) : (
    <div>
      {campaigns.map((campaign) => (
        <ActivityFeedCard
          key={campaign.id}
          variant="row"
          title={campaign.title}
          subtitle={campaign.subtitle}
          status={campaign.displayStatus}
          onClick={() => navigate(
            campaign.type === 'own'
              ? `/dashboard/brand/campaigns/${campaign.id}`
              : `/dashboard/brand/discover-campaigns`
          )}
        />
      ))}
    </div>
  );

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-24 md:pb-12">
          <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-10 lg:space-y-14">

            {/* Greeting + the one loud CTA */}
            <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-8">
              <DashboardGreeting
                roleLabel="Brand Dashboard"
                userName={profile.business_name || 'Brand Partner'}
              />
              <HeroPrimaryAction
                label="Browse & Sponsor"
                to="/dashboard/brand/discover-campaigns"
                secondary={{ label: 'Create Sponsorship Campaign', to: '/dashboard/business/campaigns/create' }}
              />
            </div>

            {/* Quiet stats + budget line */}
            <section className="space-y-8">
              <StatsRow stats={brandStats} isLoading={statsLoading} />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-3.5 w-1 rounded-full bg-dc-pink" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-dc-text">Marketing budget</h2>
                </div>
                <StatsRow stats={budgetStats} isLoading={statsLoading} />
              </div>
            </section>

            {/* Free Donny tools */}
            <section data-tour="free-trio">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-3.5 w-1 rounded-full bg-dc-pink" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-dc-text">Free Donny tools</h2>
              </div>
              <BrandFreeTrioHero orgId={org?.id} />
            </section>

            {/* DragonShare + social, paired */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div data-tour="dragonshare-inbox">
                <DragonShareStatTile
                  label="DragonShare boosts"
                  totalCents={dsBoosts?.totalCents ?? 0}
                  count={dsBoosts?.count ?? 0}
                  href="/dashboard/brand/dragonshare"
                />
              </div>
              <Link
                to="/dashboard/brand/social"
                className="block rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm p-4 hover:bg-dc-teal/[0.04] transition-colors"
              >
                <div className="flex items-center gap-3 h-full">
                  <div className="w-10 h-10 bg-dc-teal/10 rounded-xl flex items-center justify-center shrink-0">
                    <Share2 className="h-5 w-5 text-dc-teal" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-dc-text text-sm">Social Media</h3>
                    <p className="text-xs text-dc-text-muted">Manage your brand's social presence, amplify sponsored content</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-dc-text-muted ml-auto shrink-0" />
                </div>
              </Link>
            </div>

            {/* Campaigns in one framed activity zone */}
            <RecentActivitySection
              groups={[
                {
                  id: 'campaigns',
                  label: 'Campaigns',
                  count: campaigns?.length || undefined,
                  content: campaignsContent,
                },
              ]}
              action={
                <button
                  onClick={triggerTour}
                  className="w-7 h-7 rounded-full border border-dc-teal/20 flex items-center justify-center text-xs text-dc-text-muted hover:bg-dc-teal/5 transition-colors"
                  aria-label="Show tour"
                >
                  ?
                </button>
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

export default BrandDashboard;
