import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Users, LayoutDashboard, MessageSquare } from 'lucide-react';
import RatingPromptManager from '@/components/reviews/RatingPromptManager';

const BusinessDashboard = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [campaignCount, setCampaignCount] = useState(0);
  const [creatorCount, setCreatorCount] = useState(0);
  const [projectCount, setProjectCount] = useState(0);

  React.useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user) return;

      try {
        // Fetch campaign count
        const { data: campaigns, error: campaignError } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id);

        if (campaignError) {
          console.error("Error fetching campaigns:", campaignError);
        } else if (campaigns) {
          setCampaignCount(campaigns.length);
        }

        // Fetch creator count (number of collaborations)
        const { data: collaborations, error: collaborationError } = await supabase
          .from('campaign_collaborations')
          .select('*', { count: 'exact' })
          .in('campaign_id', (campaigns || []).map(c => c.id));

        if (collaborationError) {
          console.error("Error fetching collaborations:", collaborationError);
        } else if (collaborations) {
          // Assuming each collaboration is a unique creator
          setCreatorCount(new Set(collaborations.map(c => c.creator_id)).size);
        }

        // Fetch project count (number of completed collaborations)
        const { data: completedCollaborations, error: completedError } = await supabase
          .from('campaign_collaborations')
          .select('*', { count: 'exact' })
          .in('campaign_id', (campaigns || []).map(c => c.id))
          .eq('status', 'completed');

        if (completedError) {
          console.error("Error fetching completed collaborations:", completedError);
        } else if (completedCollaborations) {
          setProjectCount(completedCollaborations.length);
        }

      } catch (error) {
        console.error("Unexpected error fetching dashboard data:", error);
      }
    };

    fetchDashboardData();
  }, [user]);

  if (!user || !profile) {
    return <div>Loading...</div>;
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Welcome back, {profile.business_name}!
                </h1>
                <p className="text-gray-600">
                  Here's an overview of your campaigns and activity.
                </p>
              </div>
              <Button onClick={() => navigate('/dashboard/business/campaigns/create')}>
                Create New Campaign
              </Button>
            </div>
          </div>

          {/* Rating Prompts */}
          <RatingPromptManager />

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Total Campaigns
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{campaignCount}</div>
                <p className="text-sm text-gray-500">Active and past campaigns</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Creators Collaborating
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{creatorCount}</div>
                <p className="text-sm text-gray-500">Creators in your campaigns</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Projects Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{projectCount}</div>
                <p className="text-sm text-gray-500">Collaborations successfully completed</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Campaigns</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Track the performance of your recent campaigns and manage ongoing collaborations.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => navigate('/dashboard/business/campaigns')}
                >
                  View All Campaigns
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Find New Creators</CardTitle>
              </CardHeader>
              <CardContent>
                <p>
                  Discover talented creators for your next campaign. Browse profiles and invite them to collaborate.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => navigate('/dashboard/business/creators')}
                >
                  Browse Creators
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessDashboard;
