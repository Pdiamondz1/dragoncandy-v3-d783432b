import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Video, CheckCircle, Ticket, TrendingUp } from 'lucide-react';

interface PromotionStatsProps {
  stats: {
    totalSubmissions: number;
    approvedCount: number;
    rejectedCount: number;
    pendingCount: number;
    redemptionCount: number;
    totalCodes: number;
  };
}

export const PromotionStats: React.FC<PromotionStatsProps> = ({ stats }) => {
  if (!stats) return null;

  const { totalSubmissions = 0, approvedCount = 0, rejectedCount = 0, pendingCount = 0, redemptionCount = 0, totalCodes = 0 } = stats;
  
  const approvalRate = totalSubmissions > 0 ? Math.round((approvedCount / totalSubmissions) * 100) : 0;
  const redemptionRate = totalCodes > 0 ? Math.round((redemptionCount / totalCodes) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
          <Video className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalSubmissions}</div>
          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
            <span className="text-yellow-600">{pendingCount} pending</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{approvalRate}%</div>
          <div className="flex gap-2 text-xs mt-1">
            <span className="text-green-600">{approvedCount} approved</span>
            <span className="text-red-600">{rejectedCount} rejected</span>
          </div>
          <Progress value={approvalRate} className="h-1 mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Codes Generated</CardTitle>
          <Ticket className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCodes}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {redemptionCount} redeemed
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Redemption Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{redemptionRate}%</div>
          <div className="text-xs text-muted-foreground mt-1">
            of codes used
          </div>
          <Progress value={redemptionRate} className="h-1 mt-2" />
        </CardContent>
      </Card>
    </div>
  );
};
