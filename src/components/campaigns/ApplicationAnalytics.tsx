import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Clock, DollarSign, Target } from 'lucide-react';
import { CampaignApplication } from '@/types/applications';

interface ApplicationAnalyticsProps {
  applications: CampaignApplication[];
}

export const ApplicationAnalytics: React.FC<ApplicationAnalyticsProps> = ({ applications }) => {
  const totalApplications = applications.length;
  const pendingCount = applications.filter(app => app.status === 'pending').length;
  const acceptedCount = applications.filter(app => app.status === 'accepted').length;
  const rejectedCount = applications.filter(app => app.status === 'rejected').length;

  const averageRate = applications.length > 0 
    ? applications
        .filter(app => app.proposed_rate)
        .reduce((sum, app) => sum + (app.proposed_rate || 0), 0) / 
      applications.filter(app => app.proposed_rate).length
    : 0;

  const responseRate = totalApplications > 0 
    ? ((acceptedCount + rejectedCount) / totalApplications) * 100 
    : 0;

  const acceptanceRate = (acceptedCount + rejectedCount) > 0 
    ? (acceptedCount / (acceptedCount + rejectedCount)) * 100 
    : 0;

  const recentApplications = applications.filter(app => {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return new Date(app.created_at) > dayAgo;
  }).length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Application Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{recentApplications}</div>
          <p className="text-xs text-muted-foreground">applications in last 24h</p>
          <div className="flex gap-1 mt-2">
            <Badge variant="outline" className="text-xs">
              {totalApplications} total
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
          <Clock className="h-4 w-4 text-yellow-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{responseRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">applications reviewed</p>
          <div className="flex gap-1 mt-2">
            <Badge variant="secondary" className="text-xs">
              {pendingCount} pending
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Acceptance Rate</CardTitle>
          <Target className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{acceptanceRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">of reviewed applications</p>
          <div className="flex gap-1 mt-2">
            <Badge variant="default" className="text-xs">
              {acceptedCount} accepted
            </Badge>
            <Badge variant="outline" className="text-xs">
              {rejectedCount} rejected
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Proposed Rate</CardTitle>
          <DollarSign className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {averageRate > 0 ? formatCurrency(averageRate) : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">across all applications</p>
          <div className="flex gap-1 mt-2">
            <Badge variant="outline" className="text-xs">
              {applications.filter(app => app.proposed_rate).length} with rates
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Creator Diversity</CardTitle>
          <Users className="h-4 w-4 text-dc-teal" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalApplications}</div>
          <p className="text-xs text-muted-foreground">unique creators applied</p>
          <div className="flex gap-1 mt-2">
            <Badge variant="outline" className="text-xs">
              100% unique
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

