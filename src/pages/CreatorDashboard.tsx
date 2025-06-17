
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePublicCampaigns } from '@/hooks/usePublicCampaigns';
import { useCreatorApplications } from '@/hooks/useCampaignApplications';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Briefcase, DollarSign, Star, Eye, Users, TrendingUp, Clock } from 'lucide-react';

const CreatorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { data: availableCampaigns = [] } = usePublicCampaigns(user?.id);
  const { data: applications = [] } = useCreatorApplications();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const checkProfile = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role !== 'content_creator') {
          navigate('/dashboard/business');
          return;
        }

        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!creatorProfile?.is_completed) {
          navigate('/profile/creator');
          return;
        }
      } catch (error) {
        console.error('Error checking profile:', error);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  const pendingApplications = applications.filter(app => app.status === 'pending');
  const acceptedApplications = applications.filter(app => app.status === 'accepted');
  const totalEarnings = acceptedApplications.reduce((sum, app) => sum + (app.proposed_rate || 0), 0);
  const featuredCampaigns = availableCampaigns.slice(0, 3);

  return (
    <DashboardLayout userRole="content_creator">
      <div className="flex-1 p-8">
        {/* Welcome Section */}
        <div className="bg-white rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome back, Creator!
              </h1>
              <p className="text-gray-600">
                Find new campaigns and grow your business with DragonCandy
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-2">
                <Star className="w-5 h-5 text-yellow-500" />
                <span className="font-semibold">4.9</span>
                <span className="text-gray-600">(24 reviews)</span>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                Active Creator
              </Badge>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Briefcase className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Active Projects</p>
                  <p className="text-2xl font-bold">{acceptedApplications.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Potential Earnings</p>
                  <p className="text-2xl font-bold">${totalEarnings.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Clock className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Pending</p>
                  <p className="text-2xl font-bold">{pendingApplications.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Available</p>
                  <p className="text-2xl font-bold">{availableCampaigns.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Available Campaigns */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Featured Campaigns</h2>
            <Button 
              variant="outline"
              onClick={() => navigate('/dashboard/creator/campaigns')}
            >
              View All ({availableCampaigns.length})
            </Button>
          </div>

          {featuredCampaigns.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredCampaigns.map((campaign) => (
                <Card key={campaign.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                        {campaign.platforms?.[0] || 'Digital'}
                      </Badge>
                      <span className="text-lg font-bold text-green-600">
                        {campaign.budget_max ? `$${campaign.budget_max.toLocaleString()}` : 'Budget TBD'}
                      </span>
                    </div>
                    <h3 className="font-semibold mb-2 line-clamp-1">{campaign.title}</h3>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {campaign.description || 'No description provided'}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-gray-500">
                        <Users className="h-4 w-4" />
                        <span>{campaign.application_count || 0} applied</span>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => navigate('/dashboard/creator/campaigns')}
                        disabled={campaign.user_applied}
                      >
                        {campaign.user_applied ? 'Applied' : 'Apply'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No campaigns available yet
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  Check back later for new campaign opportunities from businesses.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card 
              className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate('/dashboard/creator/campaigns')}
            >
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Eye className="text-blue-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Browse Campaigns</h3>
                <p className="text-sm text-gray-600">
                  Discover new opportunities and apply to campaigns
                </p>
              </CardContent>
            </Card>
            
            <Card 
              className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate('/dashboard/creator/applications')}
            >
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Users className="text-green-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">My Applications</h3>
                <p className="text-sm text-gray-600">
                  Track your applications and project status
                </p>
              </CardContent>
            </Card>
            
            <Card 
              className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate('/profile/creator')}
            >
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="text-purple-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Update Profile</h3>
                <p className="text-sm text-gray-600">
                  Keep your portfolio and skills up to date
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDashboard;
