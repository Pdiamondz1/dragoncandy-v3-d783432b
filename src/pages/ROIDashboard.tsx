import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import {
  DollarSign,
  TrendingUp,
  Target,
  Star,
  BarChart3,
  Users,
  Zap,
  Award,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useROIDashboard } from '@/hooks/useROIDashboard';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  iconColor: string;
  trend?: 'up' | 'down' | 'neutral';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon, iconColor, trend }) => (
  <div className="border-2 border-dc-teal rounded-2xl p-4 bg-white">
    <div className="flex items-center justify-between mb-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">{title}</p>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
    <div className="flex items-center gap-2">
      <span className="text-3xl font-extrabold text-gray-900">{value}</span>
      {trend === 'up' && <ArrowUpRight className="h-4 w-4 text-green-500" />}
      {trend === 'down' && <ArrowDownRight className="h-4 w-4 text-red-500" />}
    </div>
    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
  </div>
);

const getRoleConfig = (role: UserRole) => {
  switch (role) {
    case 'business_client':
      return {
        title: 'Campaign ROI Dashboard',
        subtitle: 'Track your campaign performance, spending, and content delivery metrics',
        layoutRole: 'business_client' as const,
        chartLabel: 'Spending',
        chartColor: '#4DD9C0',
      };
    case 'content_creator':
      return {
        title: 'Creator Earnings Dashboard',
        subtitle: 'Track your earnings, project performance, and growth metrics',
        layoutRole: 'content_creator' as const,
        chartLabel: 'Earnings',
        chartColor: '#F9A8D4',
      };
    case 'brand':
      return {
        title: 'Sponsorship ROI Dashboard',
        subtitle: 'Track your sponsorship investments, campaign reach, and return metrics',
        layoutRole: 'brand' as const,
        chartLabel: 'Investment',
        chartColor: '#FACC15',
      };
    default:
      return {
        title: 'ROI Dashboard',
        subtitle: 'Track your performance metrics',
        layoutRole: 'business_client' as const,
        chartLabel: 'Revenue',
        chartColor: '#4DD9C0',
      };
  }
};

const ROIDashboard: React.FC = () => {
  const { profile } = useAuth();
  const userRole = (profile?.role as UserRole) || 'business_client';
  const { data: metrics, isLoading } = useROIDashboard(userRole);
  const config = getRoleConfig(userRole);

  const getStatCards = (): StatCardProps[] => {
    if (!metrics) return [];

    switch (userRole) {
      case 'business_client':
        return [
          {
            title: 'Total Spent',
            value: `$${(metrics.totalSpent || 0).toLocaleString()}`,
            subtitle: `${metrics.campaignsCreated || 0} campaigns created`,
            icon: DollarSign,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Content Delivered',
            value: (metrics.contentDelivered || 0).toString(),
            subtitle: `${metrics.activeProjects} in progress`,
            icon: Target,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Avg Cost per Content',
            value: `$${(metrics.avgCostPerContent || 0).toLocaleString()}`,
            subtitle: 'Per completed deliverable',
            icon: TrendingUp,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Conversion Rate',
            value: `${metrics.conversionRate}%`,
            subtitle: 'Applications to completions',
            icon: Zap,
            iconColor: 'text-dc-teal',
          },
        ];

      case 'content_creator':
        return [
          {
            title: 'Total Earnings',
            value: `$${(metrics.totalEarnings || 0).toLocaleString()}`,
            subtitle: `${metrics.completedProjects} projects completed`,
            icon: DollarSign,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Acceptance Rate',
            value: `${metrics.acceptanceRate || 0}%`,
            subtitle: `${metrics.campaignsApplied || 0} applications sent`,
            icon: Target,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Avg per Project',
            value: `$${(metrics.avgEarningsPerProject || 0).toLocaleString()}`,
            subtitle: 'Average earnings per gig',
            icon: TrendingUp,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Rating',
            value: metrics.averageRating > 0 ? metrics.averageRating.toFixed(1) : '—',
            subtitle: metrics.averageRating > 0 ? 'Average client rating' : 'No ratings yet',
            icon: Star,
            iconColor: 'text-dc-teal',
          },
        ];

      case 'brand':
        return [
          {
            title: 'Total Investment',
            value: `$${(metrics.totalInvestment || 0).toLocaleString()}`,
            subtitle: `${metrics.sponsoredCampaigns || 0} campaigns sponsored`,
            icon: DollarSign,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Active Sponsorships',
            value: (metrics.activeSponsorships || 0).toString(),
            subtitle: 'Currently running',
            icon: Zap,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Avg Sponsorship',
            value: `$${(metrics.avgSponsorshipAmount || 0).toLocaleString()}`,
            subtitle: 'Per campaign',
            icon: TrendingUp,
            iconColor: 'text-dc-teal',
          },
          {
            title: 'Acceptance Rate',
            value: `${metrics.conversionRate}%`,
            subtitle: 'Proposals accepted',
            icon: Award,
            iconColor: 'text-dc-teal',
          },
        ];

      default:
        return [];
    }
  };

  return (
    <DashboardLayout userRole={config.layoutRole}>
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Pink gradient header */}
        <div className="bg-gradient-to-b from-dc-pink-bg to-pink-50 px-4 pt-6 pb-8">
          <div className="max-w-2xl mx-auto space-y-4">
            <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
              Analytics
            </p>
            <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
            <p className="text-gray-500 text-sm">{config.subtitle}</p>

            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-dc-teal" />
              </div>
            ) : (
              /* Stat Cards */
              <div className="grid grid-cols-2 gap-4">
                {getStatCards().map((card, i) => (
                  <StatCard key={i} {...card} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* White body content */}
        {!isLoading && (
          <div className="px-4 py-6 pb-24 md:pb-0">
            <div className="max-w-2xl mx-auto space-y-6">

              {/* Revenue/Earnings/Investment Over Time */}
              <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
                <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-dc-teal" />
                  <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                    {config.chartLabel} Over Time
                  </p>
                </div>
                <p className="px-4 text-xs text-gray-500 mb-3">Last 6 months</p>
                <div className="px-4 pb-4">
                  {metrics && metrics.monthlyData.some(d => d.revenue > 0) ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metrics.monthlyData}>
                          <defs>
                            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={config.chartColor} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={config.chartColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="month" className="text-xs" />
                          <YAxis className="text-xs" tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            formatter={(value: number) => [`$${value.toLocaleString()}`, config.chartLabel]}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke={config.chartColor}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorRevenue)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-gray-500">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No data available yet</p>
                        <p className="text-sm mt-1">Complete your first project to see trends</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Projects Over Time */}
              <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
                <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                  <Users className="h-5 w-5 text-dc-pink-accent" />
                  <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                    Projects Over Time
                  </p>
                </div>
                <p className="px-4 text-xs text-gray-500 mb-3">Last 6 months</p>
                <div className="px-4 pb-4">
                  {metrics && metrics.monthlyData.some(d => d.projects > 0) ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={metrics.monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="month" className="text-xs" />
                          <YAxis className="text-xs" allowDecimals={false} />
                          <Tooltip
                            formatter={(value: number) => [value, 'Projects']}
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                          />
                          <Bar dataKey="projects" fill="#F9A8D4" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-gray-500">
                      <div className="text-center">
                        <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No project data yet</p>
                        <p className="text-sm mt-1">Start collaborating to track progress</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Performance Summary */}
              <div className="border-2 border-dc-teal rounded-2xl bg-white overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <p className="font-sans text-sm font-bold uppercase tracking-wide text-dc-teal">
                    Performance Summary
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Key metrics at a glance</p>
                </div>
                <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-dc-teal">
                      {metrics?.activeProjects || 0}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Active</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-green-500">
                      {metrics?.completedProjects || 0}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Completed</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-yellow-500">
                      {metrics?.averageRating ? metrics.averageRating.toFixed(1) : '—'}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Avg Rating</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-extrabold text-dc-pink-accent">
                      {metrics?.conversionRate || 0}%
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Conversion</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ROIDashboard;
