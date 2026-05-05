
import React, { useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, BarChart3, Settings, Eye } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useCampaignApplications';
import { useApplicationFilters } from '@/hooks/useApplicationFilters';
import { ApplicationCard } from './ApplicationCard';
import { ApplicationFiltersComponent } from './ApplicationFilters';
import { BulkApplicationActions } from './BulkApplicationActions';
import { ApplicationAnalytics } from './ApplicationAnalytics';
import { CreatorProfileModal } from './CreatorProfileModal';
import { CampaignApplication } from '@/types/applications';
import { useManageApplication } from '@/hooks/useManageApplication';

function VirtualizedApplications({
  applications,
  selectedApplicationIds,
  onSelectionChange,
  onViewProfile,
  campaignEscrowStatus,
}: {
  applications: CampaignApplication[];
  selectedApplicationIds: string[];
  onSelectionChange: React.Dispatch<React.SetStateAction<string[]>>;
  onViewProfile: (app: CampaignApplication) => void;
  campaignEscrowStatus?: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: applications.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-y-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const application = applications[virtualRow.index];
          return (
            <div
              key={application.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute w-full pb-4"
              style={{ top: `${virtualRow.start}px` }}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedApplicationIds.includes(application.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onSelectionChange(prev => [...prev, application.id]);
                    } else {
                      onSelectionChange(prev => prev.filter(id => id !== application.id));
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
                        campaignEscrowStatus={campaignEscrowStatus}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => onViewProfile(application)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Profile
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ApplicationsListProps {
  campaignId: string;
}

export const ApplicationsList: React.FC<ApplicationsListProps> = ({ campaignId }) => {
  const { data: applications = [], isLoading, error } = useCampaignApplications(campaignId);
  const { filters, filteredApplications, updateFilter, resetFilters } = useApplicationFilters(applications);
  const { data: campaignData } = useQuery({
    queryKey: ['campaign-escrow', campaignId],
    queryFn: async () => {
      const { data } = await supabase.from('campaigns').select('escrow_status').eq('id', campaignId).single();
      return data;
    },
    enabled: !!campaignId,
  });
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<CampaignApplication | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const manageApplication = useManageApplication();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Loading applications...</div>
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
        <div className="overflow-x-auto -mx-1 px-1">
        <TabsList className="grid w-full min-w-max whitespace-nowrap grid-cols-3">
          <TabsTrigger value="applications" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Users className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Applications ({applications.length})</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Settings className="h-4 w-4 shrink-0" />
            <span>Settings</span>
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="applications" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-2xl font-bold">{applications.length}</p>
                  <p className="text-sm text-muted-foreground">Total Applications</p>
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
                  <p className="text-sm text-muted-foreground">Pending Review</p>
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
                  <p className="text-sm text-muted-foreground">Accepted</p>
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
                  <p className="text-sm text-muted-foreground">Rejected</p>
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
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {applications.length === 0 ? 'No applications yet' : 'No applications match your filters'}
                </h3>
                <p className="text-muted-foreground text-center max-w-md">
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
            <VirtualizedApplications
              applications={filteredApplications}
              selectedApplicationIds={selectedApplicationIds}
              onSelectionChange={setSelectedApplicationIds}
              onViewProfile={handleViewProfile}
              campaignEscrowStatus={campaignData?.escrow_status}
            />
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Analytics</CardTitle>
              <p className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                Configure how applications are handled for this campaign
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-40" />
                <h3 className="text-lg font-medium mb-2 text-gray-700">Application Settings</h3>
                <p className="text-sm">Configure requirements and auto-responses for this campaign.</p>
                <p className="text-xs mt-2 text-muted-foreground">Settings panel not yet enabled for this campaign.</p>
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

