import { useAuth } from '@/hooks/useAuth';
import { useBrandAnalytics } from '@/hooks/useBrandAnalytics';
import { DashboardLayout } from '@/components/DashboardLayout';
import { BarChart3, TrendingUp, DollarSign, Target, Eye, Loader2, AlertCircle } from 'lucide-react';

const BrandAnalytics = () => {
  const { profile } = useAuth();
  const { data: analytics, isLoading, isError } = useBrandAnalytics();

  if (!profile) {
    return (
      <DashboardLayout userRole="brand">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
        </div>
      </DashboardLayout>
    );
  }

  const analyticsCards = [
    {
      title: 'Total Sponsorships',
      value: analytics?.totalSponsorships.toString() || '0',
      subtitle: `${analytics?.pendingSponsorships || 0} pending`,
      icon: Target,
      color: 'text-dc-teal',
    },
    {
      title: 'Total Investment',
      value: `$${analytics?.totalInvestment.toLocaleString() || '0'}`,
      subtitle: 'Total sponsorship spend',
      icon: DollarSign,
      color: 'text-dc-teal',
    },
    {
      title: 'Active Campaigns',
      value: analytics?.activeCampaigns.toString() || '0',
      subtitle: 'Paid and active',
      icon: TrendingUp,
      color: 'text-dc-teal',
    },
    {
      title: 'Accepted Proposals',
      value: analytics?.acceptedSponsorships.toString() || '0',
      subtitle: `${analytics?.rejectedSponsorships || 0} rejected`,
      icon: Eye,
      color: 'text-dc-teal',
    },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="min-h-screen overflow-x-hidden md:max-w-4xl md:mx-auto">
        {/* Template A — Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-4 pb-6">
          <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal mb-1">
            Performance Overview
          </p>
          <h1 className="text-2xl font-extrabold text-gray-900">Brand Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Track your sponsorship performance and ROI metrics</p>
        </div>

        {/* Template A — White body */}
        <div className="bg-white px-4 pt-4 pb-24 md:pb-0 space-y-4">

          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
            </div>
          ) : isError ? (
            <div className="border-2 border-dc-teal rounded-2xl p-8 text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 mb-2">Unable to load analytics</h3>
              <p className="text-sm text-gray-500">There was a problem fetching your analytics data. Please refresh the page.</p>
            </div>
          ) : (
            <>
              {/* Stats grid — 2×2 teal-bordered cards */}
              <div className="grid grid-cols-2 gap-3">
                {analyticsCards.map((card, index) => (
                  <div key={index} className="border-2 border-dc-teal rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                        {card.title}
                      </p>
                      <card.icon className={`h-4 w-4 ${card.color}`} />
                    </div>
                    <p className="text-3xl font-extrabold text-gray-900">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
                  </div>
                ))}
              </div>

              {/* Sponsorship Performance */}
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm mb-3">
                  Sponsorship Performance
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Monitor your active sponsorships and their engagement metrics
                </p>

                {analytics && analytics.totalSponsorships > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Total Proposals</span>
                      <span className="font-extrabold text-gray-900">{analytics.totalSponsorships}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Accepted</span>
                      <span className="font-extrabold text-green-600">{analytics.acceptedSponsorships}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Pending</span>
                      <span className="font-extrabold text-amber-600">{analytics.pendingSponsorships}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-500">Rejected</span>
                      <span className="font-extrabold text-red-500">{analytics.rejectedSponsorships}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-10 text-gray-400">
                    <div className="text-center">
                      <BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">No sponsorship data yet</p>
                      <p className="text-xs mt-1">Start sponsoring campaigns to see analytics</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Investment Overview */}
              <div className="border-2 border-dc-teal rounded-2xl p-4">
                <h2 className="font-bold text-gray-900 uppercase tracking-wide text-sm mb-3">
                  Investment Overview
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Track your sponsorship spending and ROI
                </p>

                {analytics && analytics.totalInvestment > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Total Invested</span>
                      <span className="font-extrabold text-green-600">
                        ${analytics.totalInvestment.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-gray-100">
                      <span className="text-sm text-gray-500">Active Campaigns</span>
                      <span className="font-extrabold text-gray-900">{analytics.activeCampaigns}</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-500">Avg. per Campaign</span>
                      <span className="font-extrabold text-gray-900">
                        ${analytics.totalSponsorships > 0
                          ? Math.round(analytics.totalInvestment / analytics.totalSponsorships).toLocaleString()
                          : '0'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-10 text-gray-400">
                    <div className="text-center">
                      <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium">No investment data yet</p>
                      <p className="text-xs mt-1">Complete your first sponsorship to see results</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandAnalytics;
