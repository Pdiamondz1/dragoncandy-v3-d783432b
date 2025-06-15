
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Briefcase, DollarSign, Star, Eye, Users, TrendingUp } from 'lucide-react';

const CreatorDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

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
                  <p className="text-2xl font-bold">3</p>
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
                  <p className="text-sm text-gray-600">Earnings</p>
                  <p className="text-2xl font-bold">$2,450</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Star className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Rating</p>
                  <p className="text-2xl font-bold">4.9</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Briefcase className="w-6 h-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Available Campaigns */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Available Campaigns</h2>
            <Button 
              variant="outline"
              onClick={() => navigate('/dashboard/creator/marketplace')}
            >
              View All
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    Video Editing
                  </Badge>
                  <span className="text-lg font-bold text-green-600">$500</span>
                </div>
                <h3 className="font-semibold mb-2">Product Launch Video</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Create a 60-second product launch video for a tech startup...
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Due: 5 days</span>
                  <Button size="sm">Apply</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <Badge variant="secondary" className="bg-pink-100 text-pink-700">
                    Photography
                  </Badge>
                  <span className="text-lg font-bold text-green-600">$300</span>
                </div>
                <h3 className="font-semibold mb-2">Fashion Brand Shoot</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Product photography for new fashion collection...
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Due: 3 days</span>
                  <Button size="sm">Apply</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                    Content Strategy
                  </Badge>
                  <span className="text-lg font-bold text-green-600">$750</span>
                </div>
                <h3 className="font-semibold mb-2">Social Media Strategy</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Develop comprehensive social media strategy...
                </p>
                <div className="flex items-center justify-between text-sm text-gray-500">
                  <span>Due: 7 days</span>
                  <Button size="sm">Apply</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <Eye className="text-gray-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">View Portfolio</h3>
              </CardContent>
            </Card>
            
            <Card className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <Users className="text-gray-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Browse Campaigns</h3>
              </CardContent>
            </Card>
            
            <Card className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <TrendingUp className="text-gray-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">View Analytics</h3>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CreatorDashboard;
