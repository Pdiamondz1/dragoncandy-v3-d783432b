
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Clock, Calendar, DollarSign } from 'lucide-react';
import { CampaignApplication } from '@/types/applications';

interface ApplicationsStatsProps {
  applications: CampaignApplication[];
  pendingCount: number;
  acceptedCount: number;
}

export const ApplicationsStats: React.FC<ApplicationsStatsProps> = ({
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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
              <Search className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600 truncate">Total Applications</p>
              <p className="text-xl md:text-2xl font-bold truncate">{applications.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 bg-yellow-100 rounded-lg flex-shrink-0">
              <Clock className="h-5 w-5 md:h-6 md:w-6 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600 truncate">Pending</p>
              <p className="text-xl md:text-2xl font-bold truncate">{pendingCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 bg-green-100 rounded-lg flex-shrink-0">
              <Calendar className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600 truncate">Accepted</p>
              <p className="text-xl md:text-2xl font-bold truncate">{acceptedCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
              <DollarSign className="h-5 w-5 md:h-6 md:w-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs md:text-sm text-gray-600 truncate">Avg. Proposed Rate</p>
              <p className="text-xl md:text-2xl font-bold truncate">{averageRate}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

