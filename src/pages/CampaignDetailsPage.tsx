
import React, { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle, Send, CheckCircle, FolderOpen } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorApplicationStatus } from '@/hooks/useCreatorApplicationStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ApplicationForm from '@/components/campaigns/ApplicationForm';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(id!);
  const [showApplicationDialog, setShowApplicationDialog] = useState(false);
  
  // Determine user role based on current route
  const isCreatorView = location.pathname.includes('/creator/');
  const userRole = isCreatorView ? 'content_creator' : 'business_client';
  const isOwnCampaign = campaign?.user_id === user?.id;
  
  // Check if creator has already applied
  const { hasApplied, applicationStatus, isLoading: isCheckingStatus } = useCreatorApplicationStatus(id);
  
  // Determine what button to show for creators
  const canApply = isCreatorView && !isOwnCampaign && campaign?.status === 'published' && !hasApplied;
  const showAppliedBadge = isCreatorView && hasApplied && applicationStatus === 'pending';
  const showAcceptedButton = isCreatorView && hasApplied && applicationStatus === 'accepted';
  const canReapply = isCreatorView && hasApplied && applicationStatus === 'rejected';


  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-8 w-64" />
            </div>
            <Skeleton className="h-64" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole={userRole}>
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                  <div className="text-lg font-medium">Campaign not found</div>
                  <div className="text-gray-600">
                    The campaign you're looking for doesn't exist or you don't have access to it.
                  </div>
                  <Button onClick={() => navigate(isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns')}>
                    Back to Campaigns
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={userRole}>
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(isCreatorView ? '/dashboard/creator/campaigns' : '/dashboard/business/campaigns')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaigns
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{campaign.title}</h1>
                <p className="text-gray-600">
                  {isCreatorView ? 'Campaign Details' : 'Campaign Details & Management'}
                </p>
              </div>
            </div>
            {isOwnCampaign && (
              <Button onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Campaign
              </Button>
            )}
            
            {/* Creator Apply Button */}
            {canApply && (
              <Button onClick={() => setShowApplicationDialog(true)}>
                <Send className="h-4 w-4 mr-2" />
                Apply to Campaign
              </Button>
            )}
            
            {/* Show Applied Badge for pending */}
            {showAppliedBadge && (
              <Button variant="secondary" disabled>
                <CheckCircle className="h-4 w-4 mr-2" />
                Applied (Pending)
              </Button>
            )}
            
            {/* Show View Project for accepted */}
            {showAcceptedButton && (
              <Button onClick={() => navigate('/dashboard/creator/projects')}>
                <FolderOpen className="h-4 w-4 mr-2" />
                View Project
              </Button>
            )}
            
            {/* Show Reapply for rejected */}
            {canReapply && (
              <Button onClick={() => setShowApplicationDialog(true)} variant="outline">
                <Send className="h-4 w-4 mr-2" />
                Apply Again
              </Button>
            )}
          </div>

          {/* Campaign Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className={`grid w-full ${isCreatorView ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Overview
              </TabsTrigger>
              {!isCreatorView && (
                <>
                  <TabsTrigger value="applications" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Applications
                  </TabsTrigger>
                  <TabsTrigger value="matching" className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    AI Match
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="overview">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>

            {!isCreatorView && (
              <>
                <TabsContent value="applications">
                  <ApplicationsListFixed campaignId={campaign.id} />
                </TabsContent>

                <TabsContent value="matching">
                  <CreatorMatchingSection campaignId={campaign.id} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>
      
      {/* Application Dialog for Creators */}
      <Dialog open={showApplicationDialog} onOpenChange={setShowApplicationDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply to Campaign</DialogTitle>
          </DialogHeader>
          {campaign && (
            <ApplicationForm
              campaign={campaign}
              onSuccess={() => setShowApplicationDialog(false)}
              onCancel={() => setShowApplicationDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
