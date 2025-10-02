import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, TrendingUp, Users, DollarSign, Target, Sparkles, Calendar, BarChart3 } from 'lucide-react';

const BrandDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const quickStats = [
    {
      title: "Active Sponsorships",
      value: "0",
      icon: <Target className="h-5 w-5 text-primary" />,
      description: "Currently sponsored campaigns"
    },
    {
      title: "Campaigns Discovered",
      value: "0",
      icon: <Search className="h-5 w-5 text-primary" />,
      description: "Available opportunities"
    },
    {
      title: "Creators Connected",
      value: "0",
      icon: <Users className="h-5 w-5 text-primary" />,
      description: "In your network"
    },
    {
      title: "Marketing ROI",
      value: "0%",
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      description: "Average return"
    }
  ];

  const quickActions = [
    {
      title: "Discover Campaigns",
      description: "Browse restaurant campaigns seeking brand partnerships",
      icon: <Search className="h-6 w-6 text-blue-600" />,
      action: () => navigate('/dashboard/brand/discover-campaigns'),
      buttonText: "Browse Campaigns"
    },
    {
      title: "Creator Directory",
      description: "Find local content creators for brand collaborations",
      icon: <Users className="h-6 w-6 text-green-600" />,
      action: () => navigate('/dashboard/brand/creators'),
      buttonText: "Browse Creators"
    },
    {
      title: "Analytics & ROI",
      description: "Track sponsorship performance and brand awareness",
      icon: <BarChart3 className="h-6 w-6 text-purple-600" />,
      action: () => navigate('/dashboard/brand/analytics'),
      buttonText: "View Analytics"
    }
  ];

  const howItWorksSteps = [
    {
      number: "1",
      title: "Discover Opportunities",
      description: "Browse local restaurant campaigns and creators seeking brand partnerships"
    },
    {
      number: "2",
      title: "Connect & Sponsor",
      description: "Choose campaigns that align with your brand values and target audience"
    },
    {
      number: "3",
      title: "Collaborate",
      description: "Work with restaurants and creators to develop authentic branded content"
    },
    {
      number: "4",
      title: "Track Impact",
      description: "Monitor performance, engagement, and ROI through detailed analytics"
    }
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="flex-1 p-8">
        <div className="max-w-7xl mx-auto space-y-12">
          
          {/* Welcome Header */}
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold text-foreground">
              Welcome back, {profile.business_name || 'Brand Partner'}!
            </h1>
            <p className="text-xl text-muted-foreground">
              Connect with local restaurants and creators to amplify your brand
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickStats.map((stat, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {stat.icon}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main CTA - Discover Campaigns */}
          <div className="text-center">
            <Card className="max-w-2xl mx-auto bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-2">
                      Start Discovering Opportunities
                    </h2>
                    <p className="text-muted-foreground">
                      Find restaurant campaigns and local creators that align with your brand values
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="px-8 py-3"
                    onClick={() => navigate('/dashboard/brand/discover-campaigns')}
                  >
                    <Search className="w-5 h-5 mr-2" />
                    Discover Campaigns
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* How It Works */}
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-foreground mb-4">How Brand Sponsorship Works</h2>
              <p className="text-muted-foreground">Simple steps to amplify your brand through local partnerships</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                      {step.number}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
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
              <h2 className="text-3xl font-bold text-foreground mb-4">Quick Actions</h2>
              <p className="text-muted-foreground">Manage your brand partnerships and discover new opportunities</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex-shrink-0">
                          {action.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-foreground mb-1">
                            {action.title}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {action.description}
                          </p>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={action.action}
                      >
                        {action.buttonText}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Budget Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Marketing Budget Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Monthly Budget</p>
                  <p className="text-2xl font-bold text-foreground">$0</p>
                  <p className="text-xs text-muted-foreground">Set in profile settings</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Allocated</p>
                  <p className="text-2xl font-bold text-foreground">$0</p>
                  <p className="text-xs text-muted-foreground">0% of budget</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Available</p>
                  <p className="text-2xl font-bold text-primary">$0</p>
                  <p className="text-xs text-muted-foreground">Ready to allocate</p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandDashboard;
