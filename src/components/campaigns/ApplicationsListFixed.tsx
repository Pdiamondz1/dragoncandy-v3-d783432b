
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, BarChart3, Settings, RefreshCw } from 'lucide-react';
import { useCampaignApplications } from '@/hooks/useFetchApplications';
import { useApplicationFilters } from '@/hooks/useApplicationFilters';
import { ApplicationCard } from './ApplicationCard';
import { ApplicationFiltersComponent } from './ApplicationFilters';
import { BulkApplicationActions } from './BulkApplicationActions';
import { ApplicationAnalytics } from './ApplicationAnalytics';
import { CreatorProfileModal } from './CreatorProfileModal';
import { CampaignApplication } from '@/types/applications';
import { useManageApplication } from '@/hooks/useManageApplication';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignSponsorship } from '@/hooks/useCampaignSponsorship';
import { useEscrowCheckout } from '@/hooks/useEscrowCheckout';
import { BRAND_ROLE_ENABLED } from '@/lib/featureConfig';

interface ApplicationsListFixedProps {
  campaignId: string;
  campaign?: { user_id: string; open_for_sponsorship?: boolean | null; fixed_price?: number | null; budget_max?: number | null; delivery_fee?: number | null; delivery_type?: string | null; escrow_status?: string | null; group_id?: string | null };
}

export const ApplicationsListFixed: React.FC<ApplicationsListFixedProps> = ({ campaignId, campaign }) => {
  const { data: applications = [], isLoading, error, refetch } = useCampaignApplications(campaignId);
  const { filters, filteredApplications, updateFilter, resetFilters } = useApplicationFilters(applications);
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<CampaignApplication | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const manageApplication = useManageApplication();
  const { initiateCheckout, isPayingEscrow } = useEscrowCheckout();
  const { profile } = useAuth();
  
  // Check if campaign has an active sponsorship
  const { data: activeSponsorshipData } = useCampaignSponsorship(campaignId);
  const hasActiveSponsor = !!activeSponsorshipData;

  // Determine user role based on profile and campaign ownership
  const getUserRole = (): 'brand' | 'restaurant' | undefined => {
    if (!profile || !campaign) return undefined;
    
    // If user is the campaign owner, they're the restaurant
    if (campaign.user_id === profile.id) return 'restaurant';
    
    // Otherwise, they're viewing as a brand (sponsor)
    return 'brand';
  };

  const userRole = getUserRole();
  
  // Only consider it sponsored if campaign is open for sponsorship AND has an accepted sponsor
  const isSponsored = (BRAND_ROLE_ENABLED && campaign?.open_for_sponsorship && hasActiveSponsor) || false;

  const campaignBudget = campaign?.fixed_price ?? campaign?.budget_max ?? undefined;
  // Free crew campaigns (group_id set) have no escrow — never open a paid checkout on accept.
  const isGroupCampaign = !!campaign?.group_id;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading applications...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <div className="text-red-500 mb-4">Failed to load applications</div>
          <div className="text-sm text-gray-600 mb-4">{error.message}</div>
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
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
      if (!isGroupCampaign) initiateCheckout(campaignId);
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
        <div className="overflow-x-auto -mx-1 px-1 md:overflow-x-visible">
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
                <Users className="h-8 w-8 text-dc-teal" />
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
          {applications.length > 0 && (
            <ApplicationFiltersComponent
              filters={filters}
              onFilterChange={updateFilter}
              onReset={resetFilters}
              totalCount={applications.length}
              filteredCount={filteredApplications.length}
            />
          )}

          {/* Applications List */}
          {applications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No applications yet
                </h3>
                <p className="text-gray-600 text-center max-w-md mb-4">
                  When creators apply to your campaign, their applications will appear here for review.
                </p>
                <Button onClick={() => refetch()} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardContent>
            </Card>
          ) : filteredApplications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No applications match your filters
                </h3>
                <p className="text-gray-600 text-center max-w-md mb-4">
                  Try adjusting your filters to see more applications.
                </p>
                <Button onClick={resetFilters} variant="outline">
                  Reset Filters
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Bulk Actions */}
              {filteredApplications.length > 0 && (
                <BulkApplicationActions
                  applications={filteredApplications}
                  selectedIds={selectedApplicationIds}
                  onSelectionChange={setSelectedApplicationIds}
                />
              )}

              {/* Applications Grid */}
              {filteredApplications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  showActions={true}
                  isSponsored={isSponsored}
                  userRole={userRole}
                  campaignBudget={campaignBudget}
                  campaignDeliveryFee={campaign?.delivery_fee}
                  campaignDeliveryType={campaign?.delivery_type}
                  campaignEscrowStatus={campaign?.escrow_status}
                  onViewProfile={() => handleViewProfile(application)}
                  onPayEscrow={isGroupCampaign ? undefined : () => initiateCheckout(campaignId)}
                  isPayingEscrow={isPayingEscrow}
                />
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

