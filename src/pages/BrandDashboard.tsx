import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBrandDashboardStats } from '@/hooks/useBrandDashboardStats';
import { useBrandActiveCampaigns } from '@/hooks/useBrandActiveCampaigns';
import DashboardLayout from '@/components/DashboardLayout';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { DashboardStatsGrid, type StatItem } from '@/components/dashboard/DashboardStatsGrid';
import { QuickActionButtons, type QuickAction } from '@/components/dashboard/QuickActionButtons';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { Rocket, DollarSign, Users, TrendingUp, Loader2, AlertCircle } from 'lucide-react';

function formatSpend(amount: number): string {
  if (amount === 0) return '$0';
  return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount}`;
}

const BrandDashboard = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useBrandDashboardStats();
  const { data: campaigns, isLoading: campaignsLoading } = useBrandActiveCampaigns();

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  const brandStats: StatItem[] = [
    { label: 'Active Campaigns', value: statsLoading ? '...' : stats?.activeCampaigns ?? 0, icon: Rocket },
    { label: 'Total Spend', value: statsLoading ? '...' : formatSpend(stats?.totalSpend ?? 0), icon: DollarSign },
    { label: 'Creators', value: statsLoading ? '...' : stats?.creatorsConnected ?? 0, subtitle: 'In your network', icon: Users },
    { label: 'Avg. ROI', value: statsLoading ? '...' : `${stats?.avgROI ?? 0}%`, icon: TrendingUp },
  ];

  const brandActions: [QuickAction, QuickAction] = [
    { label: 'Create Sponsorship Campaign', to: '/dashboard/business/campaigns/create', variant: 'primary' },
    { label: 'Browse & Sponsor', to: '/dashboard/brand/discover-campaigns', variant: 'secondary' },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Unified gradient header */}
        <DashboardHero
          roleLabel="Brand Dashboard"
          userName={profile.business_name || 'Brand Partner'}
        >
          <DashboardStatsGrid stats={brandStats} isLoading={statsLoading} />
          <QuickActionButtons actions={brandActions} />
        </DashboardHero>

        {/* White body content */}
        <div className="px-4 py-6 pb-24 md:pb-0">
          <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-6">

            {/* Active Campaigns Feed */}
            <div>
              <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal mb-2">
                Active Campaigns
              </p>
              {campaignsLoading ? (
                <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-dc-teal animate-spin" />
                </div>
              ) : !campaigns || campaigns.length === 0 ? (
                <div className="border-2 border-dc-teal rounded-2xl p-6 bg-white text-center">
                  <p className="text-sm text-gray-500">No active campaigns yet.</p>
                  <button
                    onClick={() => navigate('/dashboard/business/campaigns/create')}
                    className="text-sm font-semibold text-dc-teal hover:underline mt-1"
                  >
                    Let Donny help you create one
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map((campaign) => (
                    <ActivityFeedCard
                      key={campaign.id}
                      title={campaign.title}
                      subtitle={campaign.subtitle}
                      status={campaign.status}
                      onClick={() => navigate(
                        campaign.type === 'own'
                          ? `/dashboard/brand/campaigns/${campaign.id}`
                          : `/dashboard/brand/discover-campaigns`
                      )}
                    />
                  ))}
                </div>
              )}
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
                        ${(stats?.monthlyBudget ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.monthlyBudget ? 'Set in profile' : 'Not set'}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Allocated</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        ${(stats?.allocatedBudget ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {stats?.budgetPercentage || 0}% of budget
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">Available</p>
                      <p className="text-3xl font-extrabold text-dc-teal">
                        ${(stats?.availableBudget ?? 0).toLocaleString()}
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
