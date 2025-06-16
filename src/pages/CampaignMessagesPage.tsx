
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { useCampaign } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import MessageThread from '@/components/messages/MessageThread';
import { Skeleton } from '@/components/ui/skeleton';

const CampaignMessagesPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaign, isLoading, error } = useCampaign(campaignId!);

  const userRole = user?.user_metadata?.role || 'business_client';

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-8 w-64" />
            </div>
            <Skeleton className="h-96" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !campaign) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Campaign not found
                </h3>
                <p className="text-gray-600 mb-4">
                  The campaign you're looking for doesn't exist or you don't have access to it.
                </p>
                <Button onClick={() => navigate('/messages')}>
                  Back to Messages
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // For now, we'll determine the recipient as the other party in the campaign
  // In a real scenario, this would be more sophisticated with multiple participants
  const recipientId = campaign.user_id === user?.id 
    ? 'creator-placeholder' // This would be determined by campaign collaborators
    : campaign.user_id;

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate('/messages')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Messages
            </Button>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{campaign.title}</h1>
                <p className="text-sm text-gray-600">Campaign Discussion</p>
              </div>
            </div>
          </div>

          {/* Message Thread */}
          <MessageThread 
            campaignId={campaign.id}
            recipientId={recipientId}
            campaignTitle={campaign.title}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CampaignMessagesPage;
