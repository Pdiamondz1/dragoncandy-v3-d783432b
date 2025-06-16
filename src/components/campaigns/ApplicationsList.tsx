
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Clock, Check, X } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useCampaignApplications';
import ApplicationCard from './ApplicationCard';

interface ApplicationsListProps {
  campaignId: string;
}

const ApplicationsList: React.FC<ApplicationsListProps> = ({ campaignId }) => {
  const { data: applications = [], isLoading, error } = useCampaignApplications(campaignId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-gray-500">Loading applications...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-red-500">Failed to load applications</div>
        </CardContent>
      </Card>
    );
  }

  const pendingCount = applications.filter(app => app.status === 'pending').length;
  const acceptedCount = applications.filter(app => app.status === 'accepted').length;
  const rejectedCount = applications.filter(app => app.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Users className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{applications.length}</p>
              <p className="text-sm text-gray-600">Total Applications</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-sm text-gray-600">Pending Review</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Check className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold">{acceptedCount}</p>
              <p className="text-sm text-gray-600">Accepted</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <X className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold">{rejectedCount}</p>
              <p className="text-sm text-gray-600">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Applications List */}
      {applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No applications yet
            </h3>
            <p className="text-gray-600 text-center max-w-md">
              When creators apply to your campaign, their applications will appear here for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Applications</h3>
            <div className="flex gap-2">
              <Badge variant="secondary">{pendingCount} Pending</Badge>
              <Badge variant="default">{acceptedCount} Accepted</Badge>
            </div>
          </div>
          
          <div className="space-y-4">
            {applications.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                showActions={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplicationsList;
