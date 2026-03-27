import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorDashboardStats } from '@/hooks/useCreatorDashboardStats';
import { useCreatorRecentActivity } from '@/hooks/useCreatorRecentActivity';
import { useCreatorUpcomingDeadlines } from '@/hooks/useCreatorUpcomingDeadlines';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PlusCircle, Settings, DollarSign, Target, Star, Clock } from 'lucide-react';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';
import { AskBar } from '@/components/ai-assistant';
import { useAIChatModal } from '@/contexts/AIChatModalContext';
import { DonnyCard } from '@/components/donny/DonnyCard';

const CreatorDashboard = () => {
  const { user, profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useCreatorDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useCreatorRecentActivity();
  const { data: deadlines, isLoading: deadlinesLoading } = useCreatorUpcomingDeadlines();
  const { openModal } = useAIChatModal();
  if (!profile) {
    return <div>Loading...</div>;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
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

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
          <div className="max-w-2xl mx-auto space-y-4">
            {/* Donny AI Card */}
            <DonnyCard
              onOpenChat={(message) => {
                window.dispatchEvent(
                  new CustomEvent('donny-open-chat', { detail: { message } })
                );
              }}
            />

            {/* Ask Bar */}
            <AskBar onClick={openModal} userRole="content_creator" />
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Creator Dashboard
                </p>
                <h1 className="text-2xl font-bold text-gray-900 truncate mt-1">
                  Welcome back, {profile.creator_name || profile.full_name}
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Here's what's happening with your creator account today.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link to="/dashboard/creator/settings">
                  <Button variant="outline" size="sm" className="rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10">
                    <Settings className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Settings</span>
                  </Button>
                </Link>
                <Link to="/dashboard/creator/campaigns">
                  <Button size="sm" className="rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-bold">
                    <PlusCircle className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Browse Campaigns</span>
                    <span className="sm:hidden">Browse</span>
                  </Button>
                </Link>
              </div>
            </div>

            {/* Rating Prompts */}
            <RatingPromptManager />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Revenue</p>
                  <DollarSign className="h-4 w-4 text-dc-teal" />
                </div>
                {statsLoading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className="text-3xl font-extrabold text-gray-900">{formatCurrency(stats?.totalRevenue || 0)}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">From completed projects</p>
              </div>

              <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Applied</p>
                  <Target className="h-4 w-4 text-dc-teal" />
                </div>
                {statsLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <div className="text-3xl font-extrabold text-gray-900">{stats?.campaignsApplied || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">Total applications</p>
              </div>

              <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Completed</p>
                  <Clock className="h-4 w-4 text-dc-teal" />
                </div>
                {statsLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  <div className="text-3xl font-extrabold text-gray-900">{stats?.projectsCompleted || 0}</div>
                )}
                <p className="text-xs text-gray-500 mt-1">Successfully delivered</p>
              </div>

              <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Rating</p>
                  <Star className="h-4 w-4 text-dc-teal" />
                </div>
                {statsLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <div className="text-3xl font-extrabold text-gray-900">
                    {stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A'}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">Client feedback score</p>
              </div>
            </div>
          </div>
        </div>

        {/* White body content */}
        <div className="px-4 py-6 pb-24">
          <div className="max-w-2xl mx-auto space-y-6">

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

            {/* Quick Actions */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Quick Actions
                </p>
              </div>
              <div className="px-4 pb-4 space-y-3">
                <Button className="w-full rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10 font-semibold" variant="outline" asChild>
                  <Link to="/dashboard/creator/campaigns">Browse New Campaigns</Link>
                </Button>
                <Button className="w-full rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10 font-semibold" variant="outline" asChild>
                  <Link to="/dashboard/creator/projects">View Active Projects</Link>
                </Button>
                <Button className="w-full rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10 font-semibold" variant="outline" asChild>
                  <Link to="/reviews">Manage Reviews</Link>
                </Button>
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
      </div>
    </DashboardLayout>
  );
};

export default CreatorDashboard;
