import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { DCTour } from '@/components/guidance/DCTour';
import { useTour } from '@/hooks/useTour';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { DCSkeleton, DCSkeletonGrid } from '@/components/ui/dc-skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorDashboardStats } from '@/hooks/useCreatorDashboardStats';
import { useCreatorRecentActivity } from '@/hooks/useCreatorRecentActivity';
import { useCreatorUpcomingDeadlines } from '@/hooks/useCreatorUpcomingDeadlines';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DollarSign, Target, Star, Clock, Loader2 } from 'lucide-react';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { DragonShareStatTile } from '@/components/dragonshare/DragonShareStatTile';
import { useCreatorDragonShareEarnings } from '@/hooks/useDragonShare';

const CreatorDashboard = () => {
  const { user, profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useCreatorDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useCreatorRecentActivity();
  const { data: deadlines, isLoading: deadlinesLoading } = useCreatorUpcomingDeadlines();
  const { data: dsEarnings } = useCreatorDragonShareEarnings();
  const { showTour, tourSteps, completeTour, skipTour } = useTour('/dashboard/creator');

  if (!profile) {
    return (
      <DashboardLayout userRole="content_creator">
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
    if (days <= 3) return 'border-red-500';
    if (days <= 7) return 'border-yellow-500';
    return 'border-green-500';
  };

  const creatorStats: StatItem[] = [
    { label: 'Revenue', value: formatCurrency(stats?.totalRevenue || 0), subtitle: 'From completed projects', icon: DollarSign },
    { label: 'Applied', value: stats?.campaignsApplied || 0, subtitle: 'Total applications', icon: Target },
    { label: 'Completed', value: stats?.projectsCompleted || 0, subtitle: 'Successfully delivered', icon: Clock },
    { label: 'Rating', value: stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A', subtitle: 'Client feedback score', icon: Star },
  ];

  const creatorActions: [QuickAction, QuickAction] = [
    { label: 'Browse Campaigns', to: '/dashboard/creator/campaigns', variant: 'primary' },
    { label: 'Update Portfolio', to: '/dashboard/creator/settings', variant: 'secondary' },
  ];

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Unified gradient header */}
        <DashboardHero
          roleLabel="Creator Dashboard"
          userName={profile.creator_name || profile.full_name}
        >
          {/* Rating Prompts */}
          <RatingPromptManager />

          {/* Stats Grid */}
          <div data-tour="profile-completion">
            <DashboardStatsGrid stats={creatorStats} isLoading={statsLoading} />
          </div>

          {/* DragonShare earnings tile */}
          <div data-tour="dragonshare-nav">
            <DragonShareStatTile
              label="DragonShare earnings"
              totalCents={dsEarnings?.totalCents ?? 0}
              count={dsEarnings?.count ?? 0}
              href="/dashboard/creator/dragonshare"
            />
          </div>

          {/* Quick Actions */}
          <div data-tour="browse-campaigns">
            <QuickActionButtons actions={creatorActions} />
          </div>
        </DashboardHero>

        {/* White body content */}
        <div className="px-4 py-6 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

            {/* Recent Activity */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Recent Activity
                </p>
              </div>
              <div className="px-4 pb-4">
                {activitiesLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-4 flex-1" />
                      </div>
                    ))}
                  </div>
                ) : activities && activities.length > 0 ? (
                  <div className="space-y-4">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex items-center space-x-4">
                        <Badge variant={getActivityBadgeVariant(activity.status)}>
                          {activity.status}
                        </Badge>
                        <span className="text-sm text-gray-700">{activity.description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No recent activity yet</p>
                    <p className="text-xs mt-1">Start applying to campaigns to see your activity here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Upcoming Deadlines
                </p>
              </div>
              <div className="px-4 pb-4">
                {deadlinesLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="border-l-4 border-gray-200 pl-4">
                        <Skeleton className="h-5 w-48 mb-2" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    ))}
                  </div>
                ) : deadlines && deadlines.length > 0 ? (
                  <div className="space-y-4">
                    {deadlines.map((deadline) => (
                      <div key={deadline.id} className={`border-l-4 ${getDeadlineColor(deadline.daysUntilDeadline)} pl-4`}>
                        <h4 className="font-semibold text-gray-900">{deadline.title}</h4>
                        <p className="text-sm text-gray-500">
                          Due in {deadline.daysUntilDeadline} {deadline.daysUntilDeadline === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No upcoming deadlines</p>
                    <p className="text-xs mt-1">Active projects with deadlines will appear here</p>
                  </div>
                )}
              </div>
            </div>

            {/* Calendar */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Calendar
                </p>
              </div>
              <div className="px-4 pb-4 flex justify-center">
                <Calendar />
              </div>
            </div>

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
