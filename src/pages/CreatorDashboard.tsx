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
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Pink Welcome Header */}
          <div className="bg-dc-pink-bg -mx-8 -mt-8 px-8 pt-6 pb-6 mb-6">
            <h1 className="text-xl font-extrabold text-dc-teal uppercase tracking-wide text-center">
              Welcome Back, {profile.creator_name || profile.full_name}!
            </h1>
            <p className="text-sm text-[#111111] text-center mt-1">Ready to create amazing content?</p>
          </div>

          {/* Ask Bar */}
          <AskBar onClick={openModal} userRole="content_creator" />

          {/* Browse Campaigns CTA */}
          <div className="flex justify-end">
            <Link to="/dashboard/creator/campaigns">
              <Button className="rounded-full bg-dc-teal text-white hover:bg-dc-teal-dark">
                <PlusCircle className="h-4 w-4 mr-2" /> Browse Campaigns
              </Button>
            </Link>
          </div>

          {/* Rating Prompts */}
          <RatingPromptManager />

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-2 border-dc-teal rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <div className="bg-dc-teal/10 rounded-lg p-1">
                  <DollarSign className="h-4 w-4 text-dc-teal" />
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-extrabold text-dc-teal">{formatCurrency(stats?.totalRevenue || 0)}</div>
                )}
                <p className="text-xs text-muted-foreground">From completed projects</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-dc-teal rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Campaigns Applied</CardTitle>
                <div className="bg-dc-teal/10 rounded-lg p-1">
                  <Target className="h-4 w-4 text-dc-teal" />
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-extrabold text-dc-teal">{stats?.campaignsApplied || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Total applications submitted</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-dc-teal rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects Completed</CardTitle>
                <div className="bg-dc-teal/10 rounded-lg p-1">
                  <Clock className="h-4 w-4 text-dc-teal" />
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-extrabold text-dc-teal">{stats?.projectsCompleted || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Successfully delivered</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-dc-teal rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                <div className="bg-dc-teal/10 rounded-lg p-1">
                  <Star className="h-4 w-4 text-dc-teal" />
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-extrabold text-dc-teal">
                    {stats?.averageRating ? stats.averageRating.toFixed(1) : 'N/A'}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Client feedback score</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-dc-teal font-semibold">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
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
                        <span className="text-sm">{activity.description}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No recent activity yet</p>
                    <p className="text-xs">Start applying to campaigns to see your activity here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-dc-teal font-semibold">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full rounded-full bg-dc-teal text-white hover:bg-dc-teal-dark" asChild>
                  <Link to="/dashboard/creator/campaigns">
                    Browse New Campaigns
                  </Link>
                </Button>
                <Button className="w-full rounded-full" variant="outline" asChild>
                  <Link to="/dashboard/creator/projects">
                    View Active Projects
                  </Link>
                </Button>
                <Button className="w-full rounded-full" variant="outline" asChild>
                  <Link to="/reviews">
                    Manage Reviews
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Calendar and Tasks */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-dc-teal font-semibold">Upcoming Deadlines</CardTitle>
              </CardHeader>
              <CardContent>
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
                        <h4 className="font-medium">{deadline.title}</h4>
                        <p className="text-sm text-gray-600">
                          Due in {deadline.daysUntilDeadline} {deadline.daysUntilDeadline === 1 ? 'day' : 'days'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No upcoming deadlines</p>
                    <p className="text-xs">Active projects with deadlines will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-dc-teal font-semibold">Calendar</CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDashboard;
