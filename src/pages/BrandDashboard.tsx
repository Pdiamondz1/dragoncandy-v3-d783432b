import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandDashboardStats } from '@/hooks/useBrandDashboardStats';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Search, TrendingUp, Users, DollarSign, Target, Sparkles, Calendar, BarChart3, Loader2, AlertCircle } from 'lucide-react';
import { AskBar } from '@/components/ai-assistant';
import { useAIChatModal } from '@/contexts/AIChatModalContext';

const BrandDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { openModal } = useAIChatModal();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useBrandDashboardStats();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const quickStats = [
    {
      title: "Active Sponsorships",
      value: statsLoading ? "..." : stats?.activeSponsorships.toString() || "0",
      icon: <Target className="h-5 w-5 text-dc-teal" />,
      description: "Currently sponsored campaigns"
    },
    {
      title: "Campaigns Discovered",
      value: statsLoading ? "..." : stats?.campaignsDiscovered.toString() || "0",
      icon: <Search className="h-5 w-5 text-dc-teal" />,
      description: "Available opportunities"
    },
    {
      title: "Creators Connected",
      value: statsLoading ? "..." : stats?.creatorsConnected.toString() || "0",
      icon: <Users className="h-5 w-5 text-dc-teal" />,
      description: "In your network"
    },
    {
      title: "Marketing ROI",
      value: statsLoading ? "..." : `${stats?.marketingROI || 0}%`,
      icon: <TrendingUp className="h-5 w-5 text-dc-teal" />,
      description: "Average return"
    }
  ];

  const quickActions = [
    {
      title: "Discover Campaigns",
      description: "Browse restaurant campaigns seeking brand partnerships",
      icon: <Search className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/discover-campaigns'),
      buttonText: "Browse Campaigns",
      primary: true
    },
    {
      title: "Creator Directory",
      description: "Find local content creators for brand collaborations",
      icon: <Users className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/creators'),
      buttonText: "Browse Creators",
      primary: false
    },
    {
      title: "Analytics & ROI",
      description: "Track sponsorship performance and brand awareness",
      icon: <BarChart3 className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/analytics'),
      buttonText: "View Analytics",
      primary: false
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

          {/* Pink Welcome Header */}
          <div className="bg-dc-pink-bg -mx-8 -mt-8 px-8 pt-6 pb-6 mb-6">
            <h1 className="text-xl font-extrabold text-dc-teal uppercase tracking-wide text-center">
              Welcome Back, {profile.business_name || 'Brand Partner'}!
            </h1>
            <p className="text-sm text-[#111111] text-center mt-1">Connect with creators and amplify your brand</p>
          </div>

          {/* Ask Bar */}
          <AskBar onClick={openModal} userRole="brand" />

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickStats.map((stat, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 bg-dc-teal/10 rounded-lg">
                      {stat.icon}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-extrabold text-dc-teal">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main CTA - Discover Campaigns */}
          <div className="text-center">
            <Card className="max-w-2xl mx-auto border-2 border-dc-teal rounded-3xl bg-white shadow-sm">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="w-16 h-16 bg-dc-teal rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[#111111] mb-2">
                      Start Discovering Opportunities
                    </h2>
                    <p className="text-muted-foreground">
                      Find restaurant campaigns and local creators that align with your brand values
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="bg-dc-teal text-white rounded-full px-8 hover:bg-dc-teal-dark"
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
              <h2 className="text-3xl font-extrabold text-dc-teal uppercase mb-4">How Brand Sponsorship Works</h2>
              <p className="text-muted-foreground">Simple steps to amplify your brand through local partnerships</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 bg-dc-teal text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
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
              <h2 className="text-3xl font-extrabold text-dc-teal uppercase mb-4">Quick Actions</h2>
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
                      {action.primary ? (
                        <Button
                          className="w-full rounded-full bg-dc-teal text-white hover:bg-dc-teal-dark"
                          onClick={action.action}
                        >
                          {action.buttonText}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full rounded-full"
                          onClick={action.action}
                        >
                          {action.buttonText}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Budget Overview */}
          <Card className="border-2 border-dc-teal">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-dc-teal font-semibold">
                <DollarSign className="h-5 w-5" />
                Marketing Budget Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : statsError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>Unable to load budget data. Please refresh the page.</AlertDescription>
                </Alert>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Monthly Budget</p>
                    <p className="text-2xl font-bold text-foreground">
                      ${stats?.monthlyBudget.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats?.monthlyBudget ? 'Set in profile settings' : 'Not set'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Allocated</p>
                    <p className="text-2xl font-bold text-foreground">
                      ${stats?.allocatedBudget.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats?.budgetPercentage || 0}% of budget
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Available</p>
                    <p className="text-2xl font-bold text-dc-teal">
                      ${stats?.availableBudget.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Ready to allocate</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandDashboard;
