import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Grid, Row, Col } from '@/components/ui/grid';
import { Badge } from '@/components/ui/badge';
import { CalendarRange } from '@/components/ui/calendar';
import { OverviewRevenue } from '@/components/OverviewRevenue';
import { OverviewLatestOrders } from '@/components/OverviewLatestOrders';
import { OverviewTotalRevenue } from '@/components/OverviewTotalRevenue';
import { OverviewTasks } from '@/components/OverviewTasks';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PlusCircle, Settings } from 'lucide-react';
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
                Welcome back, {profile.full_name}
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
          <Grid className="gap-6">
            <Row>
              <Col size={{ initial: 6, sm: 3 }}>
                <OverviewTotalRevenue value="$23,456" percentageChange="+12%" />
              </Col>
              <Col size={{ initial: 6, sm: 3 }}>
                <OverviewTotalRevenue value="143" title="Campaigns Applied" percentageChange="-8%" />
              </Col>
              <Col size={{ initial: 6, sm: 3 }}>
                <OverviewTotalRevenue value="32" title="Projects Completed" percentageChange="+5%" />
              </Col>
              <Col size={{ initial: 6, sm: 3 }}>
                <OverviewTotalRevenue value="4.8" title="Average Rating" percentageChange="+2%" />
              </Col>
            </Row>
          </Grid>

          {/* Main Content Grid */}
          <Grid className="gap-6">
            <Row>
              <Col size={{ initial: 12, md: 6 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OverviewRevenue />
                  </CardContent>
                </Card>
              </Col>
              <Col size={{ initial: 12, md: 6 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Latest Projects</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OverviewLatestOrders />
                  </CardContent>
                </Card>
              </Col>
            </Row>
            <Row>
              <Col size={{ initial: 12, md: 8 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <OverviewTasks />
                  </CardContent>
                </Card>
              </Col>
              <Col size={{ initial: 12, md: 4 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Upcoming Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CalendarRange />
                  </CardContent>
                </Card>
              </Col>
            </Row>
          </Grid>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDashboard;
