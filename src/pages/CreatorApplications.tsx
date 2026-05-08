
import React from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCreatorApplications } from '@/hooks/useFetchApplications';
import { DCSkeleton } from '@/components/ui/dc-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/PageHeader';
import { ApplicationsStats } from '@/components/applications/ApplicationsStats';
import { ApplicationsSearch } from '@/components/applications/ApplicationsSearch';
import { ApplicationsTabsContent } from '@/components/applications/ApplicationsTabsContent';

const CreatorApplications: React.FC = () => {
  const navigate = useNavigate();
  const { data: applications = [], isLoading, error, refetch } = useCreatorApplications();
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
        <div className="min-h-screen bg-white overflow-x-hidden">
          <PageHeader>
            <div className="flex items-center">
              <span className="h-5 w-5 bg-gray-200 rounded-full animate-pulse mr-2" />
              <span className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-8" />
            </div>
          </PageHeader>
          <div className="px-4 pt-4 pb-24 md:pb-0 space-y-3">
            <DCSkeleton variant="list-row" count={4} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="content_creator">
        <ErrorState message={error.message} onRetry={refetch} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden md:max-w-4xl md:mx-auto">
        <PageHeader>
          <div className="flex items-center">
            <button
              onClick={() => navigate('/dashboard/creator')}
              className="text-dc-pink-accent mr-2"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
              My Applications
            </h1>
            <span className="text-xs text-gray-400 font-semibold">
              {applications.length}
            </span>
          </div>
        </PageHeader>

        {/* Content */}
        <div className="px-4 pt-4 pb-24 md:pb-0 space-y-4">
          {/* Stats row */}
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

          {/* Applications tabs — teal-bordered cards inside */}
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
