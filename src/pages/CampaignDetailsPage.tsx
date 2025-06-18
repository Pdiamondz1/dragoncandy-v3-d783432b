
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Users, Target, AlertCircle } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import ApplicationsListFixed from '@/components/campaigns/ApplicationsListFixed';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';
import { Skeleton } from '@/components/ui/skeleton';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, isLoading, error } = useCampaign(id!);

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
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
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-8">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center space-y-4">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                  <div className="text-lg font-medium">Campaign not found</div>
                  <div className="text-gray-600">
                    The campaign you're looking for doesn't exist or you don't have access to it.
                  </div>
                  <Button onClick={() => navigate('/dashboard/business/campaigns')}>
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
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/dashboard/business/campaigns')}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Campaigns
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{campaign.title}</h1>
                <p className="text-gray-600">Campaign Details & Management</p>
              </div>
            </div>
            <Button onClick={() => navigate(`/dashboard/business/campaigns/${campaign.id}/edit`)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Campaign
            </Button>
          </div>

          {/* Campaign Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="applications" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Applications
              </TabsTrigger>
              <TabsTrigger value="matching" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                AI Match
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>

            <TabsContent value="applications">
              <ApplicationsListFixed campaignId={campaign.id} />
            </TabsContent>

            <TabsContent value="matching">
              <CreatorMatchingSection campaignId={campaign.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
