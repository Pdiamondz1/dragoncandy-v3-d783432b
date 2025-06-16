
import React from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Calendar, Users } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';

const MessagesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaigns, isLoading } = useCampaigns();

  // Filter campaigns that are published or active (have potential for messaging)
  const messagingCampaigns = campaigns.filter(
    campaign => campaign.status === 'published' || campaign.status === 'active'
  );

  const userRole = user?.user_metadata?.role || 'business_client';

  if (isLoading) {
    return (
      <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
        <div className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-300 rounded w-1/4"></div>
              <div className="h-32 bg-gray-300 rounded"></div>
              <div className="h-32 bg-gray-300 rounded"></div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole={userRole as 'business_client' | 'content_creator'}>
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
              <p className="text-gray-600">Communicate with your campaign collaborators</p>
            </div>
          </div>

          {/* Campaign Conversations */}
          {messagingCampaigns.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-16 w-16 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No active conversations
                </h3>
                <p className="text-gray-600 text-center mb-4">
                  You'll see conversations here once you have active campaigns with collaborators.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {messagingCampaigns.map((campaign) => (
                <Card 
                  key={campaign.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/messages/${campaign.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{campaign.title}</CardTitle>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {campaign.deadline 
                                ? new Date(campaign.deadline).toLocaleDateString()
                                : 'No deadline'
                              }
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>Campaign discussion</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {campaign.description || 'Click to start messaging about this campaign'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default MessagesPage;
