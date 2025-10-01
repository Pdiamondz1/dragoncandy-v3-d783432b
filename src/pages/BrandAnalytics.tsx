import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, TrendingUp, DollarSign, Target, Users, Eye } from 'lucide-react';

const BrandAnalytics = () => {
  const { profile } = useAuth();

  if (!profile) {
    return <div>Loading...</div>;
  }

  const analyticsCards = [
    {
      title: 'Total Sponsorships',
      value: '0',
      change: '+0%',
      icon: Target,
      color: 'text-blue-600',
    },
    {
      title: 'Total Investment',
      value: '$0',
      change: '+0%',
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Active Campaigns',
      value: '0',
      change: '+0%',
      icon: TrendingUp,
      color: 'text-purple-600',
    },
    {
      title: 'Brand Impressions',
      value: '0',
      change: '+0%',
      icon: Eye,
      color: 'text-orange-600',
    },
  ];

  return (
    <DashboardLayout userRole="brand">
      <div className="p-8 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Brand Analytics</h1>
          <p className="text-muted-foreground">
            Track your sponsorship performance and ROI metrics
          </p>
        </div>

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
                  {card.change} from last month
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
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No sponsorship data available yet</p>
                  <p className="text-sm mt-1">Start sponsoring campaigns to see analytics</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>ROI Overview</CardTitle>
              <CardDescription>
                Track return on investment across all brand partnerships
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No ROI data available yet</p>
                  <p className="text-sm mt-1">Complete your first sponsorship to see results</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Brand Reach & Engagement</CardTitle>
              <CardDescription>
                View how your sponsored content is performing across platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No engagement data available yet</p>
                  <p className="text-sm mt-1">Analytics will appear as campaigns go live</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BrandAnalytics;
