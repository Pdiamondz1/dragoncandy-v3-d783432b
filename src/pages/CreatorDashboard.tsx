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
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
          {/* Ask Bar */}
          <AskBar onClick={openModal} userRole="content_creator" />
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">
                Welcome back, {profile.creator_name || profile.full_name}
              </h1>
              <p className="text-muted-foreground mt-1 sm:mt-2 text-sm sm:text-base">
                Here's what's happening with your creator account today.
              </p>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <Link to="/dashboard/creator/settings">
                <Button variant="outline" size="sm" className="sm:size-default">
                  <Settings className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
              </Link>
              <Link to="/dashboard/creator/campaigns">
                <Button size="sm" className="sm:size-default">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">{formatCurrency(stats?.totalRevenue || 0)}</div>
                )}
                <p className="text-xs text-muted-foreground">From completed projects</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Campaigns Applied</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.campaignsApplied || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Total applications submitted</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects Completed</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{stats?.projectsCompleted || 0}</div>
                )}
                <p className="text-xs text-muted-foreground">Successfully delivered</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">
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
                <CardTitle>Recent Activity</CardTitle>
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
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button className="w-full" variant="outline" asChild>
                  <Link to="/dashboard/creator/campaigns">
                    Browse New Campaigns
                  </Link>
                </Button>
                <Button className="w-full" variant="outline" asChild>
                  <Link to="/dashboard/creator/projects">
                    View Active Projects
                  </Link>
                </Button>
                <Button className="w-full" variant="outline" asChild>
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
                <CardTitle>Upcoming Deadlines</CardTitle>
              </CardHeader>
              <CardContent>
                {deadlinesLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="border-l-4 border-border pl-4">
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
                        <p className="text-sm text-muted-foreground">
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
                <CardTitle>Calendar</CardTitle>
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
