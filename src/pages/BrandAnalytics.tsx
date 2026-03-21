import { useAuth } from '@/hooks/useAuth';
import { useBrandAnalytics } from '@/hooks/useBrandAnalytics';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Target, Users, Eye, Loader2 } from 'lucide-react';

const BrandAnalytics = () => {
  const { profile } = useAuth();
  const { data: analytics, isLoading } = useBrandAnalytics();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const analyticsCards = [
    {
      title: 'Total Sponsorships',
      value: analytics?.totalSponsorships.toString() || '0',
      subtitle: `${analytics?.pendingSponsorships || 0} pending`,
      icon: Target,
      color: 'text-blue-600',
    },
    {
      title: 'Total Investment',
      value: `$${analytics?.totalInvestment.toLocaleString() || '0'}`,
      subtitle: 'Total sponsorship spend',
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Active Campaigns',
      value: analytics?.activeCampaigns.toString() || '0',
      subtitle: 'Paid and active',
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      title: 'Accepted Proposals',
      value: analytics?.acceptedSponsorships.toString() || '0',
      subtitle: `${analytics?.rejectedSponsorships || 0} rejected`,
      icon: Eye,
      color: 'text-orange-600',
    },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-foreground">Brand Analytics</h1>
          <p className="text-muted-foreground">
            Track your sponsorship performance and ROI metrics
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {analyticsCards.map((card, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {card.title}
                    </CardTitle>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{card.value}</div>
                    <p className="text-xs text-muted-foreground">
                      {card.subtitle}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Sponsorship Performance</CardTitle>
                  <CardDescription>
                    Monitor your active sponsorships and their engagement metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics && analytics.totalSponsorships > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Proposals</span>
                        <span className="font-semibold">{analytics.totalSponsorships}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Accepted</span>
                        <span className="font-semibold text-green-600">{analytics.acceptedSponsorships}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Pending</span>
                        <span className="font-semibold text-yellow-600">{analytics.pendingSponsorships}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Rejected</span>
                        <span className="font-semibold text-red-600">{analytics.rejectedSponsorships}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <div className="text-center">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No sponsorship data available yet</p>
                        <p className="text-sm mt-1">Start sponsoring campaigns to see analytics</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Investment Overview</CardTitle>
                  <CardDescription>
                    Track your sponsorship spending and ROI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analytics && analytics.totalInvestment > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Invested</span>
                        <span className="font-semibold text-green-600">
                          ${analytics.totalInvestment.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Active Campaigns</span>
                        <span className="font-semibold">{analytics.activeCampaigns}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Avg. per Campaign</span>
                        <span className="font-semibold">
                          ${analytics.totalSponsorships > 0 
                            ? Math.round(analytics.totalInvestment / analytics.totalSponsorships).toLocaleString() 
                            : '0'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <div className="text-center">
                        <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No investment data available yet</p>
                        <p className="text-sm mt-1">Complete your first sponsorship to see results</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

      </div>
    </DashboardLayout>
  );
};

export default BrandAnalytics;
