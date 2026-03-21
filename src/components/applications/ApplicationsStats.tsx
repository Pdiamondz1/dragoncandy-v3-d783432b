
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Clock, Calendar, DollarSign } from 'lucide-react';
import { CampaignApplication } from '@/types/applications';

interface ApplicationsStatsProps {
  applications: CampaignApplication[];
  pendingCount: number;
  acceptedCount: number;
}

const ApplicationsStats: React.FC<ApplicationsStatsProps> = ({
  applications,
  pendingCount,
  acceptedCount,
}) => {
  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const averageRate = applications.length > 0 
    ? formatCurrency(
        applications
          .filter(app => app.proposed_rate)
          .reduce((sum, app) => sum + (app.proposed_rate || 0), 0) /
        applications.filter(app => app.proposed_rate).length
      )
    : '$0';

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Search className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Applications</p>
              <p className="text-2xl font-bold">{applications.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Accepted</p>
              <p className="text-2xl font-bold">{acceptedCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg. Proposed Rate</p>
              <p className="text-2xl font-bold">{averageRate}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApplicationsStats;
