
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Search, BarChart3, Users, Target, Zap, CheckCircle } from 'lucide-react';

const BusinessDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const quickActions = [
    {
      title: "View Campaigns",
      description: "Manage your active and past campaigns",
      icon: <Target className="h-6 w-6 text-blue-600" />,
      action: () => navigate('/dashboard/business/campaigns')
    },
    {
      title: "Browse Creators",
      description: "Discover talented content creators",
      icon: <Users className="h-6 w-6 text-green-600" />,
      action: () => navigate('/dashboard/business/creators')
    },
    {
      title: "View Analytics",
      description: "Track your campaign performance",
      icon: <BarChart3 className="h-6 w-6 text-purple-600" />,
      action: () => navigate('/dashboard/analytics')
    }
  ];

  const howItWorksSteps = [
    {
      number: "1",
      title: "Create Campaign",
      description: "Use our AI-powered wizard to create your campaign strategy"
    },
    {
      number: "2",
      title: "Find Creators",
      description: "Browse and connect with talented content creators"
    },
    {
      number: "3",
      title: "Collaborate",
      description: "Work together to create amazing content"
    },
    {
      number: "4",
      title: "Launch & Grow",
      description: "Publish your content and watch your brand grow"
    }
  ];

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto space-y-12">
          
          {/* Welcome Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-gray-900">
              Welcome back, {profile.business_name}!
            </h1>
            <p className="text-xl text-gray-600">
              Ready to create amazing content with talented creators?
            </p>
          </div>

          {/* Create Campaign CTA */}
          <div className="text-center">
            <Card className="max-w-2xl mx-auto bg-gradient-to-br from-pink-50 to-indigo-50 border-pink-200">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-pink-600 rounded-full flex items-center justify-center mx-auto">
                    <PlusCircle className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      Create Your First Campaign
                    </h2>
                    <p className="text-gray-600">
                      Use our AI-powered campaign wizard to define your goals and find the perfect creators
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="bg-pink-600 hover:bg-pink-700 text-white px-8 py-3"
                    onClick={() => navigate('/dashboard/business/campaigns/create')}
                  >
                    <Zap className="w-5 h-5 mr-2" />
                    Start Campaign Wizard
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
              <p className="text-gray-600">Simple steps to launch your next successful campaign</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-pink-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                      {step.number}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Quick Actions</h2>
              <p className="text-gray-600">Manage your campaigns and discover new opportunities</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={action.action}>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        {action.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {action.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {action.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessDashboard;
