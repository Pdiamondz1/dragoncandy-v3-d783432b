
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  Users, 
  Eye, 
  MessageSquare, 
  Clock,
  DollarSign,
  Target,
  Calendar
} from 'lucide-react';

interface CampaignAnalyticsProps {
  campaignId?: string;
  analytics?: {
    totalViews: number;
    totalApplications: number;
    acceptedApplications: number;
    averageProposedRate: number;
    averageResponseTime: number; // in hours
    skillDemand: { skill: string; count: number }[];
    applicationTrends: { date: string; count: number }[];
  };
}

const CampaignAnalytics: React.FC<CampaignAnalyticsProps> = ({ 
  campaignId, 
  analytics 
}) => {
  // Mock data if no analytics provided
  const mockAnalytics = {
    totalViews: 234,
    totalApplications: 12,
    acceptedApplications: 3,
    averageProposedRate: 85,
    averageResponseTime: 6,
    skillDemand: [
      { skill: 'Video Editing', count: 8 },
      { skill: 'Photography', count: 6 },
      { skill: 'Graphic Design', count: 4 },
      { skill: 'Copywriting', count: 3 },
    ],
    applicationTrends: [
      { date: '2024-01-01', count: 2 },
      { date: '2024-01-02', count: 3 },
      { date: '2024-01-03', count: 4 },
      { date: '2024-01-04', count: 3 },
    ]
  };

  const data = analytics || mockAnalytics;
  const acceptanceRate = data.totalApplications > 0 ? 
    Math.round((data.acceptedApplications / data.totalApplications) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalViews}</div>
            <p className="text-xs text-muted-foreground">
              Campaign visibility
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applications</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalApplications}</div>
            <p className="text-xs text-muted-foreground">
              {data.acceptedApplications} accepted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Rate</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.averageProposedRate}</div>
            <p className="text-xs text-muted-foreground">
              Per hour proposed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.averageResponseTime}h</div>
            <p className="text-xs text-muted-foreground">
              Average response
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Acceptance Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Application Success Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Acceptance Rate</span>
              <span className="font-medium">{acceptanceRate}%</span>
            </div>
            <Progress value={acceptanceRate} className="w-full" />
            <p className="text-xs text-muted-foreground">
              {data.acceptedApplications} out of {data.totalApplications} applications accepted
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Skills in Demand */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Most Requested Skills
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.skillDemand.map((skill, index) => (
              <div key={skill.skill} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{index + 1}</Badge>
                  <span className="text-sm font-medium">{skill.skill}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${(skill.count / data.totalApplications) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">{skill.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Application Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Application Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.applicationTrends.map((trend, index) => (
              <div key={trend.date} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {new Date(trend.date).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-600 rounded-full"
                      style={{ width: `${(trend.count / Math.max(...data.applicationTrends.map(t => t.count))) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-8 text-right">{trend.count}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignAnalytics;
