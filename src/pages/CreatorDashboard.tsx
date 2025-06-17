
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PlusCircle, Settings, DollarSign, Target, Star, Clock } from 'lucide-react';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';

const CreatorDashboard = () => {
  const { user, profile } = useAuth();

  if (!profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {profile.creator_name || profile.full_name}
              </h1>
              <p className="text-gray-600 mt-2">
                Here's what's happening with your creator account today.
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/dashboard/creator/settings">
                <Button variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </Link>
              <Link to="/dashboard/creator/campaigns">
                <Button>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Browse Campaigns
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
                <div className="text-2xl font-bold">$23,456</div>
                <p className="text-xs text-muted-foreground">+12% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Campaigns Applied</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">143</div>
                <p className="text-xs text-muted-foreground">-8% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Projects Completed</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">32</div>
                <p className="text-xs text-muted-foreground">+5% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                <Star className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">4.8</div>
                <p className="text-xs text-muted-foreground">+2% from last month</p>
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
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <Badge variant="outline">New</Badge>
                    <span className="text-sm">Campaign application submitted</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge variant="secondary">Completed</Badge>
                    <span className="text-sm">Project delivered successfully</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <Badge variant="outline">Pending</Badge>
                    <span className="text-sm">Awaiting client feedback</span>
                  </div>
                </div>
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
                <div className="space-y-4">
                  <div className="border-l-4 border-blue-500 pl-4">
                    <h4 className="font-medium">Social Media Campaign</h4>
                    <p className="text-sm text-gray-600">Due in 3 days</p>
                  </div>
                  <div className="border-l-4 border-yellow-500 pl-4">
                    <h4 className="font-medium">Product Photography</h4>
                    <p className="text-sm text-gray-600">Due in 1 week</p>
                  </div>
                  <div className="border-l-4 border-green-500 pl-4">
                    <h4 className="font-medium">Brand Video Content</h4>
                    <p className="text-sm text-gray-600">Due in 2 weeks</p>
                  </div>
                </div>
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
