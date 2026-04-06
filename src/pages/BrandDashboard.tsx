import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandDashboardStats } from '@/hooks/useBrandDashboardStats';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Search, TrendingUp, Users, DollarSign, Target, Sparkles, Calendar, BarChart3, Loader2, AlertCircle } from 'lucide-react';
import { DonnyAIBar } from '@/components/dashboard/DonnyAIBar';

const BrandDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useBrandDashboardStats();

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
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
      description: "Browse campaigns open for brand sponsorships",
      icon: <Search className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/discover-campaigns'),
      buttonText: "Browse Campaigns"
    },
    {
      title: "Creator Directory",
      description: "Find content creators for your brand collaborations",
      icon: <Users className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/creators'),
      buttonText: "Browse Creators"
    },
    {
      title: "Analytics & ROI",
      description: "Track sponsorship performance and brand awareness",
      icon: <BarChart3 className="h-6 w-6 text-dc-teal" />,
      action: () => navigate('/dashboard/brand/analytics'),
      buttonText: "View Analytics"
    }
  ];

  const howItWorksSteps = [
    {
      number: "1",
      title: "Discover Opportunities",
      description: "Browse campaigns and creators seeking brand partnerships"
    },
    {
      number: "2",
      title: "Connect & Sponsor",
      description: "Choose campaigns that align with your brand values and target audience"
    },
    {
      number: "3",
      title: "Collaborate",
      description: "Work with businesses and creators to develop authentic branded content"
    },
    {
      number: "4",
      title: "Track Impact",
      description: "Monitor performance, engagement, and ROI through detailed analytics"
    }
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4">

            {/* Donny AI Bar */}
            <DonnyAIBar placeholder="Ask Donny... 'Show me campaign ROI' or 'Find top creators'" />

            {/* Welcome Header */}
            <div>
              <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                Brand Dashboard
              </p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">
                Welcome back, {profile.business_name || 'Brand Partner'}!
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Connect with local restaurants and creators to amplify your brand
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              {quickStats.map((stat, index) => (
                <div key={index} className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold truncate pr-1">{stat.title}</p>
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-extrabold text-gray-900">{stat.value}</div>
                  <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* White body content */}
        <div className="px-4 py-6 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

            {/* Main CTA - Discover Campaigns */}
            <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center space-y-4">
              <div className="w-16 h-16 bg-dc-teal rounded-full flex items-center justify-center mx-auto">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Start Discovering Opportunities
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Find campaigns and creators that align with your brand values
                </p>
              </div>
              <Button
                className="w-full rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-bold px-8"
                onClick={() => navigate('/dashboard/brand/discover-campaigns')}
              >
                <Search className="w-5 h-5 mr-2" />
                Discover Campaigns
              </Button>
            </div>

            {/* How It Works */}
            <div className="space-y-4">
              <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                How Brand Sponsorship Works
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {howItWorksSteps.map((step, index) => (
                  <div key={index} className="border-2 border-dc-teal rounded-2xl p-4 bg-white text-center">
                    <div className="w-10 h-10 bg-dc-teal text-white rounded-full flex items-center justify-center mx-auto mb-3 text-base font-bold">
                      {step.number}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">
                      {step.title}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-4">
              <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                Quick Actions
              </p>
              <div className="space-y-4">
                {quickActions.map((action, index) => (
                  <div key={index} className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
                    <div className="flex items-start space-x-4 mb-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {action.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">
                          {action.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {action.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="w-full rounded-full border-dc-teal text-dc-teal hover:bg-dc-teal/10 font-semibold"
                      variant="outline"
                      onClick={action.action}
                    >
                      {action.buttonText}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Budget Overview */}
            <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-dc-teal" />
                <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                  Marketing Budget
                </p>
              </div>
              <div className="px-4 pb-4">
                {statsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
                  </div>
                ) : statsError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>Unable to load budget data. Please refresh the page.</AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Monthly</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        ${stats?.monthlyBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.monthlyBudget ? 'Set in profile' : 'Not set'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Allocated</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        ${stats?.allocatedBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.budgetPercentage || 0}% of budget
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Available</p>
                      <p className="text-3xl font-extrabold text-dc-teal">
                        ${stats?.availableBudget.toLocaleString() || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Ready to allocate</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandDashboard;
