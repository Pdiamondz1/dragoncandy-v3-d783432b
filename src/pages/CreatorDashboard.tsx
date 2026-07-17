import { DashboardLayout } from '@/components/DashboardLayout';
import { DCTour } from '@/components/guidance/DCTour';
import { TourButton } from '@/components/guidance/TourButton';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { useTour } from '@/hooks/useTour';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { FirstRunDashboard } from '@/components/first-run/FirstRunDashboard';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorDashboardStats } from '@/hooks/useCreatorDashboardStats';
import { useCreatorRecentActivity } from '@/hooks/useCreatorRecentActivity';
import { useCreatorUpcomingDeadlines } from '@/hooks/useCreatorUpcomingDeadlines';
import { Link } from 'react-router-dom';
import { DollarSign, Target, Star, Clock, ChevronDown } from 'lucide-react';
import { RatingPromptManager } from '@/components/reviews/RatingPromptManager';
import { DashboardGreeting } from '@/components/dashboard/DashboardGreeting';
import { HeroPrimaryAction } from '@/components/dashboard/HeroPrimaryAction';
import { StatsRow, type StatItem } from '@/components/dashboard/StatsRow';
import { NeedsAttentionSection } from '@/components/dashboard/NeedsAttentionSection';
import { RecentActivitySection } from '@/components/dashboard/RecentActivitySection';
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { DragonPointsCard } from '@/components/dragonshare/DragonPointsCard';
import { DragonShareActivityCard } from '@/components/dragonshare/DragonShareActivityCard';
import { SocialMediaManagerTile } from '@/components/dashboard/SocialMediaManagerTile';
import { useCreatorDragonShareEarnings } from '@/hooks/useDragonShare';
import { useCreatorDragonShareActivity } from '@/hooks/useCreatorDragonShareActivity';
import { UpcomingPostsWidget } from '@/components/outstand/UpcomingPostsWidget';
import { ContentIdeaCard } from '@/components/donny/ContentIdeaCard';
import { BriefPerformanceCard } from '@/components/dragonshare/BriefPerformanceCard';

const CreatorDashboard = () => {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useCreatorDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useCreatorRecentActivity();
  const { data: deadlines, isLoading: deadlinesLoading } = useCreatorUpcomingDeadlines();
  const { data: dsEarnings } = useCreatorDragonShareEarnings();
  const { data: dsActivity, isLoading: dsActivityLoading } = useCreatorDragonShareActivity();
  const { showTour, tourSteps, completeTour, skipTour, triggerTour } = useTour();
  const { missions, isFirstRun, completeMission, skipMissions } = useFirstRunMissions();

  if (isFirstRun && missions) {
    return (
      <FirstRunDashboard
        role="content_creator"
        missions={missions}
        onCompleteMission={completeMission}
        onSkip={skipMissions}
      />
    );
  }

  if (statsError) {
    return (
      <DashboardLayout userRole="content_creator">
        <ErrorState message={statsError.message} onRetry={refetchStats} />
      </DashboardLayout>
    );
  }

  if (!profile) {
    return (
      <DashboardLayout userRole="content_creator">
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const getActivityBadgeVariant = (status: string) => {
    switch (status) {
      case 'accepted':
      case 'completed':
        return 'default';
      case 'pending':
        return 'outline';
      case 'rejected':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getDeadlineColor = (days: number) => {
    if (days <= 3) return 'border-l-red-500';
    if (days <= 7) return 'border-l-yellow-500';
    return 'border-l-green-500';
  };

  const creatorStats: StatItem[] = [
    { label: 'Revenue', value: formatCurrency(stats?.totalRevenue || 0), subtitle: 'From completed projects', icon: DollarSign, href: '/dashboard/creator/earnings' },
    { label: 'Applied', value: stats?.campaignsApplied || 0, subtitle: 'Total applications', icon: Target, href: '/dashboard/creator/campaigns' },
    { label: 'Completed', value: stats?.projectsCompleted || 0, subtitle: 'Successfully delivered', icon: Clock, href: '/dashboard/creator/my-campaigns' },
    { label: 'Rating', value: stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A', subtitle: 'Client feedback score', icon: Star, href: '/dashboard/creator/settings' },
  ];

  const activityContent = activitiesLoading ? (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  ) : activities && activities.length > 0 ? (
    <div className="space-y-1">
      {activities.map((activity) => {
        const inner = (
          <div className={`flex items-center space-x-4 py-1.5 ${activity.campaign_id ? 'cursor-pointer hover:bg-dc-teal/[0.04] -mx-2 px-2 rounded-lg transition-colors' : ''}`}>
            <Badge variant={getActivityBadgeVariant(activity.status)}>
              {activity.status}
            </Badge>
            <span className="text-sm text-dc-text">{activity.description}</span>
          </div>
        );
        return activity.campaign_id ? (
          <Link key={activity.id} to={`/dashboard/creator/my-campaigns/${activity.campaign_id}`}>
            {inner}
          </Link>
        ) : (
          <div key={activity.id}>{inner}</div>
        );
      })}
    </div>
  ) : (
    <div className="text-center py-8 text-dc-text-muted">
      <p className="text-sm">No recent activity yet</p>
      <p className="text-xs mt-1">Start applying to campaigns to see your activity here</p>
    </div>
  );

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <div className="px-4 lg:px-8 pt-8 lg:pt-12 pb-24 md:pb-12">
          <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-10 lg:space-y-14">

            {/* Greeting + the one loud CTA */}
            <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-8">
              <DashboardGreeting
                roleLabel="Creator Dashboard"
                userName={profile.creator_name || profile.full_name || ''}
              />
              <div data-tour="browse-campaigns">
                <HeroPrimaryAction
                  label="Find paid work"
                  to="/dashboard/creator/campaigns"
                  secondary={{ label: 'Update Portfolio', to: '/dashboard/creator/settings' }}
                />
              </div>
            </div>

            {/* Ratings to leave + upcoming deadlines, one quiet frame */}
            <NeedsAttentionSection>
              <RatingPromptManager variant="row" />
              {!deadlinesLoading && deadlines && deadlines.length > 0 && (
                <div className="divide-y divide-dc-teal/10">
                  {deadlines.map((deadline) => {
                    const inner = (
                      <div className={`border-l-2 ${getDeadlineColor(deadline.daysUntilDeadline)} px-4 py-2.5 ${deadline.campaign_id ? 'cursor-pointer hover:bg-dc-teal/[0.04] transition-colors' : ''}`}>
                        <p className="text-sm font-semibold text-dc-text">{deadline.title}</p>
                        <p className="text-xs text-dc-text-muted">
                          Due in {deadline.daysUntilDeadline} {deadline.daysUntilDeadline === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                    );
                    return deadline.campaign_id ? (
                      <Link key={deadline.id} to={`/dashboard/creator/my-campaigns/${deadline.campaign_id}`} className="block">
                        {inner}
                      </Link>
                    ) : (
                      <div key={deadline.id}>{inner}</div>
                    );
                  })}
                </div>
              )}
            </NeedsAttentionSection>

            {/* Quiet stats + DragonShare / social tiles */}
            <section className="space-y-4">
              <div data-tour="profile-completion">
                <StatsRow stats={creatorStats} isLoading={statsLoading} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <DragonPointsCard />
                <div data-tour="dragonshare-nav">
                  <DragonShareStatTile
                    label="DragonShare earnings"
                    totalCents={dsEarnings?.totalCents ?? 0}
                    count={dsEarnings?.count ?? 0}
                    href="/dashboard/creator/dragonshare"
                  />
                </div>
                <SocialMediaManagerTile href="/dashboard/creator/social" />
              </div>
            </section>

            {/* Donny tools */}
            <section>
              <SectionHeader title="Donny tools" />
              <ContentIdeaCard />
            </section>

            {/* One framed activity zone instead of stacked feeds */}
            <RecentActivitySection
              groups={[
                { id: 'activity', label: 'Activity', content: activityContent },
                {
                  id: 'dragonshare',
                  label: 'DragonShare',
                  content: (
                    <DragonShareActivityCard
                      role="creator"
                      items={dsActivity ?? []}
                      isLoading={dsActivityLoading}
                    />
                  ),
                },
                { id: 'briefs', label: 'Briefs', content: <BriefPerformanceCard /> },
              ]}
              action={<TourButton onClick={triggerTour} />}
            />

            {/* Calendar, tucked behind a disclosure */}
            <Collapsible className="rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-dc-text hover:bg-dc-teal/[0.04] transition-colors [&[data-state=open]>svg]:rotate-180">
                Calendar
                <ChevronDown className="h-4 w-4 text-dc-text-muted transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 flex justify-center">
                  <Calendar />
                </div>
              </CollapsibleContent>
            </Collapsible>

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

export default CreatorDashboard;
