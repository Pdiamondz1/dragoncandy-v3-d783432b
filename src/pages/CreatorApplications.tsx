
import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { useCreatorApplications } from '@/hooks/useFetchApplications';
import ApplicationsStats from '@/components/applications/ApplicationsStats';
import ApplicationsSearch from '@/components/applications/ApplicationsSearch';
import ApplicationsTabsContent from '@/components/applications/ApplicationsTabsContent';

const CreatorApplications: React.FC = () => {
  const { data: applications = [], isLoading, error } = useCreatorApplications();
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredApplications = applications.filter(application =>
    application.campaign?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    application.intro_message?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingApplications = filteredApplications.filter(app => app.status === 'pending');
  const counterOfferedApplications = filteredApplications.filter(app => app.status === 'counter_offered');
  const acceptedApplications = filteredApplications.filter(app => app.status === 'accepted');
  const rejectedApplications = filteredApplications.filter(app => app.status === 'rejected');

  if (isLoading) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load applications
                </h3>
                <p className="text-gray-600">
                  There was an error loading your applications.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Applications</h1>
              <p className="text-gray-600">Track your campaign applications and their status</p>
            </div>
          </div>

          {/* Stats Cards */}
          <ApplicationsStats 
            applications={applications}
            pendingCount={pendingApplications.length}
            acceptedCount={acceptedApplications.length}
          />

          {/* Search */}
          <ApplicationsSearch 
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
          />

          {/* Applications Tabs */}
          <ApplicationsTabsContent
            filteredApplications={filteredApplications}
            pendingApplications={pendingApplications}
            counterOfferedApplications={counterOfferedApplications}
            acceptedApplications={acceptedApplications}
            rejectedApplications={rejectedApplications}
            searchTerm={searchTerm}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorApplications;
