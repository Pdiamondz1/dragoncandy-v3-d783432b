// src/pages/BusinessDashboard.tsx
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DCTour } from '@/components/guidance/DCTour';
import { useTour } from '@/hooks/useTour';
import { Loader2, ChevronRight, Megaphone, Users, DollarSign, TrendingUp } from 'lucide-react';
import { DCSkeleton, DCSkeletonGrid } from '@/components/ui/dc-skeleton';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { useBusinessActiveCampaigns } from '@/hooks/useBusinessActiveCampaigns';
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { useOrgBoostStats } from '@/hooks/useDragonShare';
import { useOrg } from '@/hooks/useOrgData';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';


function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: campaigns, isLoading: campaignsLoading } = useBusinessActiveCampaigns();
  const { data: org } = useOrg();
  const { data: dsBoosts } = useOrgBoostStats(org?.id);
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

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
          <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
            <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">
              <DCSkeleton variant="text-block" className="h-4 w-32" />
              <DCSkeleton variant="text-block" className="h-8 w-48" />
              <DCSkeletonGrid columns={4} count={4} variant="stat" className="mt-4" />
            </div>
          </div>
          <div className="px-4 py-6 pb-24 md:pb-0">
            <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">
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
    { label: 'Active', value: campaignsLoading ? '…' : recentCampaigns.length, icon: Megaphone },
    { label: 'Creators', value: '—', subtitle: 'In your network', icon: Users },
    { label: 'Spend', value: '—', icon: DollarSign },
    { label: 'ROI', value: '—', icon: TrendingUp },
  ];

  const businessActions: [QuickAction, QuickAction] = [
    { label: 'Create a Campaign with Donny', to: '/dashboard/business/campaigns/create', variant: 'primary' },
    { label: 'Browse Creators', to: '/dashboard/business/creators', variant: 'secondary' },
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <DashboardHero
          roleLabel="Restaurant Dashboard"
          userName={profile.full_name || 'there'}
        >
          <DashboardStatsGrid stats={businessStats} isLoading={campaignsLoading} />

          <DragonShareStatTile
            label="DragonShare boosts"
            totalCents={dsBoosts?.totalCents ?? 0}
            count={dsBoosts?.count ?? 0}
            href="/dashboard/business/dragonshare"
          />

          <div data-tour="brief-generator">
            <QuickActionButtons actions={businessActions} />
          </div>
        </DashboardHero>

        {/* White body content */}
        <div className="px-4 py-6 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-dc-teal">
                Your Active Campaigns
              </p>
              <div className="flex items-center gap-2">
                {hasMore && (
                  <Link
                    to="/business/campaigns"
                    className="text-xs font-semibold text-dc-teal hover:underline flex items-center gap-0.5"
                  >
                    View all <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
                <button
                  onClick={triggerTour}
                  className="w-7 h-7 rounded-full bg-teal-400 flex items-center justify-center text-xs text-white"
                  aria-label="Show tour"
                >
                  ?
                </button>
              </div>
            </div>

            {campaignsLoading ? (
              <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
              </div>
            ) : recentCampaigns.length === 0 ? (
              <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center">
                <p className="text-sm text-gray-500">No active campaigns yet.</p>
                <button
                  onClick={() => navigate('/dashboard/business/campaigns/create')}
                  className="text-sm font-semibold text-dc-teal hover:underline mt-1"
                >
                  Let Donny help you create one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentCampaigns.map((campaign) => (
                  <ActivityFeedCard
                    key={campaign.id}
                    title={campaign.title}
                    subtitle={`${campaign.creatorName ? `@${campaign.creatorName}` : 'Unassigned'} · Due ${formatDate(campaign.deadline)}`}
                    status={campaign.status}
                    onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}`)}
                  />
                ))}
                {hasMore && (
                  <Link
                    to="/business/campaigns"
                    className="block text-center text-sm font-semibold text-dc-teal hover:underline pt-1"
                  >
                    View all campaigns
                  </Link>
                )}
              </div>
            )}

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
