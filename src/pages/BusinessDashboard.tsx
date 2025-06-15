
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Target, Users, BarChart3, Eye, TrendingUp, Calendar } from 'lucide-react';

const BusinessDashboard = () => {
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

        if (profile?.role !== 'business_client') {
          navigate('/dashboard/creator');
          return;
        }

        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!businessProfile?.is_completed) {
          navigate('/profile/business');
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
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl p-8 mb-8 text-center">
          <div className="mx-auto mb-6 w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center">
            <Sparkles className="text-pink-600 w-8 h-8" />
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Create Your Campaign
          </h1>
          
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Launch a powerful marketing campaign in minutes. Our AI will help you find
            the perfect creators and manage everything from start to finish.
          </p>
          
          <Button 
            className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3"
            onClick={() => navigate('/dashboard/business/campaigns/create')}
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Start Creating Campaign
          </Button>
        </div>

        {/* How It Works Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <Target className="text-pink-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">1. Describe Your Goal</h3>
              <p className="text-sm text-gray-600">
                Tell us what you want to promote and your target audience
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <Sparkles className="text-pink-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">2. AI Creates Your Campaign</h3>
              <p className="text-sm text-gray-600">
                Our AI will generate a complete campaign strategy for you
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <Users className="text-pink-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">3. Find Perfect Creators</h3>
              <p className="text-sm text-gray-600">
                We'll match you with top creators who fit your brand
              </p>
            </div>
            
            <div className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <BarChart3 className="text-pink-600 w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">4. Launch & Track</h3>
              <p className="text-sm text-gray-600">
                Manage content creation and track your campaign's success
              </p>
            </div>
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
                <h3 className="font-semibold mb-2">View All Campaigns</h3>
              </CardContent>
            </Card>
            
            <Card className="p-6 text-center hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-0">
                <div className="mx-auto mb-4 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <Users className="text-gray-600 w-6 h-6" />
                </div>
                <h3 className="font-semibold mb-2">Browse Creators</h3>
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

export default BusinessDashboard;
