
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, BarChart3, Settings, Eye } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useCampaignApplications';
import { useApplicationFilters } from '@/hooks/useApplicationFilters';
import ApplicationCard from './ApplicationCard';
import ApplicationFiltersComponent from './ApplicationFilters';
import BulkApplicationActions from './BulkApplicationActions';
import ApplicationAnalytics from './ApplicationAnalytics';
import CreatorProfileModal from './CreatorProfileModal';
import { CampaignApplication } from '@/types/applications';
import { useManageApplication } from '@/hooks/useManageApplication';

interface ApplicationsListProps {
  campaignId: string;
}

const ApplicationsList: React.FC<ApplicationsListProps> = ({ campaignId }) => {
  const { data: applications = [], isLoading, error } = useCampaignApplications(campaignId);
  const { filters, filteredApplications, updateFilter, resetFilters } = useApplicationFilters(applications);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<CampaignApplication | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const manageApplication = useManageApplication();

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
    <div className="space-y-6">
      <Tabs defaultValue="applications" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="applications" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Applications ({applications.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="applications" className="space-y-6">
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
                <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                  <span className="text-yellow-600 font-bold">{pendingCount}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-gray-600">Pending Review</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 font-bold">{acceptedCount}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{acceptedCount}</p>
                  <p className="text-sm text-gray-600">Accepted</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold">{rejectedCount}</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">{rejectedCount}</p>
                  <p className="text-sm text-gray-600">Rejected</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <ApplicationFiltersComponent
            filters={filters}
            onFilterChange={updateFilter}
            onReset={resetFilters}
            totalCount={applications.length}
            filteredCount={filteredApplications.length}
          />

          {/* Bulk Actions */}
          <BulkApplicationActions
            applications={filteredApplications}
            selectedIds={selectedApplicationIds}
            onSelectionChange={setSelectedApplicationIds}
          />

          {/* Applications List */}
          {filteredApplications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {applications.length === 0 ? 'No applications yet' : 'No applications match your filters'}
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  {applications.length === 0 
                    ? 'When creators apply to your campaign, their applications will appear here for review.'
                    : 'Try adjusting your filters to see more applications.'
                  }
                </p>
                {applications.length > 0 && (
                  <Button onClick={resetFilters} variant="outline" className="mt-4">
                    Reset Filters
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredApplications.map((application) => (
                <div key={application.id} className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedApplicationIds.includes(application.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedApplicationIds(prev => [...prev, application.id]);
                      } else {
                        setSelectedApplicationIds(prev => prev.filter(id => id !== application.id));
                      }
                    }}
                    className="mt-6"
                  />
                  <div className="flex-1">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <ApplicationCard
                          application={application}
                          showActions={true}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewProfile(application)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Profile
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Analytics</CardTitle>
              <p className="text-sm text-gray-600">
                Insights into your campaign's application performance
              </p>
            </CardHeader>
            <CardContent>
              <ApplicationAnalytics applications={applications} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
              <p className="text-sm text-gray-600">
                Configure how applications are handled for this campaign
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8 text-gray-500">
                <Settings className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Settings Coming Soon</h3>
                <p>Advanced application settings will be available here, including:</p>
                <ul className="mt-4 space-y-1 text-sm">
                  <li>• Auto-response templates</li>
                  <li>• Application requirements</li>
                  <li>• Notification preferences</li>
                  <li>• Screening criteria</li>
                </ul>
              </div>
            </CardContent>
          </Card>
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
  );
};

export default ApplicationsList;
