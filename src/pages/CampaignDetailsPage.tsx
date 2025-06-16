import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Edit2, Eye, MessageSquare, Users, Brain } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { Skeleton } from '@/components/ui/skeleton';
import CampaignDetailsOverview from '@/components/campaigns/CampaignDetailsOverview';
import CreatorMatchingSection from '@/components/campaigns/CreatorMatchingSection';

const CampaignDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { campaign, isLoading, error } = useCampaign(id!);

  if (isLoading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-8 w-64" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Campaign not found
                </h3>
                <p className="text-gray-600 mb-4">
                  The campaign you're looking for doesn't exist or you don't have access to it.
                </p>
                <Button onClick={() => navigate('/dashboard/business/campaigns')}>
                  Back to Campaigns
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-6">
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
                <h1 className="text-2xl font-bold text-gray-900">{campaign.title}</h1>
                <p className="text-gray-600">Campaign Details & Creator Matching</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => navigate(`/dashboard/business/campaigns/${id}/edit`)}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit Campaign
              </Button>
              {campaign.status === 'published' && (
                <Button>
                  <Eye className="h-4 w-4 mr-2" />
                  View Public
                </Button>
              )}
            </div>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="creators" className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                AI Matching
              </TabsTrigger>
              <TabsTrigger value="applications" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Applications
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Messages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <CampaignDetailsOverview campaign={campaign} />
            </TabsContent>

            <TabsContent value="creators" className="space-y-6">
              <CreatorMatchingSection campaignId={campaign.id} />
            </TabsContent>

            <TabsContent value="applications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Creator Applications</CardTitle>
                  <p className="text-sm text-gray-600">
                    View and manage applications from creators interested in your campaign
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Applications feature coming soon...
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Messages</CardTitle>
                  <p className="text-sm text-gray-600">
                    Communicate with creators about this campaign
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-gray-500">
                    Messaging feature coming soon...
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignDetailsPage;
