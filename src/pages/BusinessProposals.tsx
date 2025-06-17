
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Clock, CheckCircle, XCircle, Eye } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useCampaignApplications';
import { useManageApplication } from '@/hooks/useManageApplication';
import { useCampaign } from '@/hooks/useCampaignQueries';
import ApplicationCard from '@/components/campaigns/ApplicationCard';
import CreatorProfileModal from '@/components/campaigns/CreatorProfileModal';
import BulkApplicationActions from '@/components/campaigns/BulkApplicationActions';
import { useApplicationFilters } from '@/hooks/useApplicationFilters';
import ApplicationFiltersComponent from '@/components/campaigns/ApplicationFilters';
import { CampaignApplication } from '@/types/applications';

const BusinessProposals = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [selectedApplication, setSelectedApplication] = useState<CampaignApplication | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId!);
  const { data: applications = [], isLoading, error } = useCampaignApplications(campaignId!);
  const { filters, filteredApplications, updateFilter, resetFilters } = useApplicationFilters(applications);
  const manageApplication = useManageApplication();

  if (campaignLoading || isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded"></div>
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
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-red-500">Failed to load proposals</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const pendingApplications = applications.filter(app => app.status === 'pending');
  const acceptedApplications = applications.filter(app => app.status === 'accepted');
  const rejectedApplications = applications.filter(app => app.status === 'rejected');

  const handleViewProfile = (application: CampaignApplication) => {
    setSelectedApplication(application);
    setShowProfileModal(true);
  };

  const handleAcceptFromModal = async () => {
    if (selectedApplication) {
      await manageApplication.mutateAsync({
        applicationId: selectedApplication.id,
        status: 'accepted',
      });
      setShowProfileModal(false);
      setSelectedApplication(null);
    }
  };

  const handleRejectFromModal = async () => {
    if (selectedApplication) {
      await manageApplication.mutateAsync({
        applicationId: selectedApplication.id,
        status: 'rejected',
      });
      setShowProfileModal(false);
      setSelectedApplication(null);
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Proposals for "{campaign?.title}"
            </h1>
            <p className="text-gray-600 mt-1">
              Review and manage creator applications for your campaign
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{applications.length}</p>
                  <p className="text-sm text-gray-600">Total Proposals</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div>
                  <p className="text-2xl font-bold">{pendingApplications.length}</p>
                  <p className="text-sm text-gray-600">Pending Review</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{acceptedApplications.length}</p>
                  <p className="text-sm text-gray-600">Accepted</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <XCircle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold">{rejectedApplications.length}</p>
                  <p className="text-sm text-gray-600">Rejected</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="all" className="space-y-6">
            <TabsList>
              <TabsTrigger value="all">All Proposals ({applications.length})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({pendingApplications.length})</TabsTrigger>
              <TabsTrigger value="accepted">Accepted ({acceptedApplications.length})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({rejectedApplications.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-6">
              <ApplicationFiltersComponent
                filters={filters}
                onFilterChange={updateFilter}
                onReset={resetFilters}
                totalCount={applications.length}
                filteredCount={filteredApplications.length}
              />

              <BulkApplicationActions
                applications={filteredApplications}
                selectedIds={selectedApplicationIds}
                onSelectionChange={setSelectedApplicationIds}
              />

              <div className="grid grid-cols-1 gap-4">
                {filteredApplications.map((application) => (
                  <Card key={application.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <ApplicationCard application={application} showActions={false} />
                        <div className="flex gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewProfile(application)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Profile
                          </Button>
                          {application.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                onClick={async () => {
                                  await manageApplication.mutateAsync({
                                    applicationId: application.id,
                                    status: 'accepted',
                                  });
                                }}
                                disabled={manageApplication.isPending}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  await manageApplication.mutateAsync({
                                    applicationId: application.id,
                                    status: 'rejected',
                                  });
                                }}
                                disabled={manageApplication.isPending}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="pending">
              <div className="grid grid-cols-1 gap-4">
                {pendingApplications.map((application) => (
                  <Card key={application.id}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <ApplicationCard application={application} showActions={true} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewProfile(application)}
                          className="ml-4"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Profile
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="accepted">
              <div className="grid grid-cols-1 gap-4">
                {acceptedApplications.map((application) => (
                  <Card key={application.id}>
                    <CardContent className="p-6">
                      <ApplicationCard application={application} showActions={false} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="rejected">
              <div className="grid grid-cols-1 gap-4">
                {rejectedApplications.map((application) => (
                  <Card key={application.id}>
                    <CardContent className="p-6">
                      <ApplicationCard application={application} showActions={false} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Creator Profile Modal */}
          <CreatorProfileModal
            application={selectedApplication}
            isOpen={showProfileModal}
            onClose={() => {
              setShowProfileModal(false);
              setSelectedApplication(null);
            }}
            onAccept={handleAcceptFromModal}
            onReject={handleRejectFromModal}
            showActions={selectedApplication?.status === 'pending'}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessProposals;
