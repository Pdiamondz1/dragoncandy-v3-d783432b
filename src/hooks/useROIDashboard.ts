import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';
import type { DashboardSummary } from '@/types/dashboard';

export interface ROIMetrics {
  // Shared across all roles
  totalRevenue: number;
  activeProjects: number;
  completedProjects: number;
  averageRating: number;
  conversionRate: number;

  // Business-specific
  campaignsCreated?: number;
  totalSpent?: number;
  avgCostPerContent?: number;
  contentDelivered?: number;

  // Creator-specific
  totalEarnings?: number;
  campaignsApplied?: number;
  acceptanceRate?: number;
  avgEarningsPerProject?: number;

  // Brand-specific
  totalInvestment?: number;
  sponsoredCampaigns?: number;
  avgSponsorshipAmount?: number;
  activeSponsorships?: number;

  // Time-series data for charts
  monthlyData: MonthlyDataPoint[];
}

export interface MonthlyDataPoint {
  month: string;
  revenue: number;
  projects: number;
}

const getMonthLabel = (date: Date): string => {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const buildMonthlyBuckets = (): Map<string, MonthlyDataPoint> => {
  const buckets = new Map<string, MonthlyDataPoint>();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = getMonthLabel(d);
    buckets.set(label, { month: label, revenue: 0, projects: 0 });
  }
  return buckets;
};

async function fetchBusinessROI(userId: string): Promise<ROIMetrics> {
  const { data: summary, error } = await supabase
    .rpc('get_dashboard_summary', { p_user_id: userId });

  if (error) throw error;

  const s = summary as DashboardSummary;

  const totalSpent = s.total_spent;
  const conversionRate = s.total_applications > 0
    ? Math.round((s.completed_collaborations / s.total_applications) * 100)
    : 0;

  const monthlyData: MonthlyDataPoint[] = s.monthly_data.map(m => ({
    month: getMonthLabel(new Date(m.month)),
    revenue: 0,
    projects: m.collaborations || 0,
  }));

  // Pad to 6 months if RPC returned fewer
  const buckets = buildMonthlyBuckets();
  for (const point of monthlyData) {
    buckets.set(point.month, point);
  }

  return {
    totalRevenue: totalSpent,
    activeProjects: s.active_collaborations,
    completedProjects: s.completed_collaborations,
    averageRating: Math.round(s.avg_review_score * 10) / 10,
    conversionRate,
    campaignsCreated: s.campaign_count,
    totalSpent,
    avgCostPerContent: s.completed_collaborations > 0 ? Math.round(totalSpent / s.completed_collaborations) : 0,
    contentDelivered: s.completed_collaborations,
    monthlyData: Array.from(buckets.values()),
  };
}

async function fetchCreatorROI(userId: string): Promise<ROIMetrics> {
  const buckets = buildMonthlyBuckets();

  // Applications
  const { data: applications } = await supabase
    .from('campaign_applications')
    .select('id, status, proposed_rate, created_at')
    .eq('creator_id', userId);

  // Collaborations
  const { data: collaborations } = await supabase
    .from('campaign_collaborations')
    .select('id, status, created_at, completed_at')
    .eq('creator_id', userId);

  // Accepted applications for earnings
  const acceptedApps = applications?.filter(a => a.status === 'accepted') || [];
  const totalEarnings = acceptedApps.reduce((sum, a) => sum + (a.proposed_rate || 0), 0);

  // Reviews
  const { data: reviews } = await supabase
    .from('project_reviews')
    .select('rating')
    .eq('reviewee_id', userId);

  const avgRating = reviews && reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : 0;

  const activeProjects = collaborations?.filter(c => c.status === 'active').length || 0;
  const completedProjects = collaborations?.filter(c => c.status === 'completed').length || 0;
  const totalApplied = applications?.length || 0;
  const acceptanceRate = totalApplied > 0
    ? Math.round((acceptedApps.length / totalApplied) * 100)
    : 0;

  // Monthly earnings from accepted applications
  acceptedApps.forEach(app => {
    const date = new Date(app.created_at);
    const label = getMonthLabel(date);
    const bucket = buckets.get(label);
    if (bucket) {
      bucket.revenue += (app.proposed_rate || 0);
      bucket.projects += 1;
    }
  });

  return {
    totalRevenue: totalEarnings,
    activeProjects,
    completedProjects,
    averageRating: Math.round(avgRating * 10) / 10,
    conversionRate: acceptanceRate,
    totalEarnings,
    campaignsApplied: totalApplied,
    acceptanceRate,
    avgEarningsPerProject: completedProjects > 0 ? Math.round(totalEarnings / completedProjects) : 0,
    monthlyData: Array.from(buckets.values()),
  };
}

async function fetchBrandROI(userId: string): Promise<ROIMetrics> {
  const buckets = buildMonthlyBuckets();

  // Get brand profile
  const { data: brandProfile } = await supabase
    .from('business_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('account_type', 'brand')
    .maybeSingle();

  if (!brandProfile) {
    return {
      totalRevenue: 0,
      activeProjects: 0,
      completedProjects: 0,
      averageRating: 0,
      conversionRate: 0,
      totalInvestment: 0,
      sponsoredCampaigns: 0,
      avgSponsorshipAmount: 0,
      activeSponsorships: 0,
      monthlyData: Array.from(buckets.values()),
    };
  }

  // Sponsorships
  const { data: sponsorships } = await supabase
    .from('campaign_sponsorships')
    .select('sponsorship_amount, status, payment_status, created_at')
    .eq('brand_id', brandProfile.id);

  const totalInvestment = sponsorships?.reduce(
    (sum, s) => sum + (Number(s.sponsorship_amount) || 0), 0
  ) || 0;

  const activeSponsorships = sponsorships?.filter(
    s => s.status === 'accepted' && s.payment_status === 'paid'
  ).length || 0;

  const acceptedSponsorships = sponsorships?.filter(s => s.status === 'accepted').length || 0;
  const totalSponsorships = sponsorships?.length || 0;

  const conversionRate = totalSponsorships > 0
    ? Math.round((acceptedSponsorships / totalSponsorships) * 100)
    : 0;

  // Reviews
  const { data: reviews } = await supabase
    .from('project_reviews')
    .select('rating')
    .eq('reviewee_id', userId);

  const avgRating = reviews && reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : 0;

  // Monthly investment data
  sponsorships?.filter(s => s.status === 'accepted').forEach(s => {
    const date = new Date(s.created_at);
    const label = getMonthLabel(date);
    const bucket = buckets.get(label);
    if (bucket) {
      bucket.revenue += Number(s.sponsorship_amount) || 0;
      bucket.projects += 1;
    }
  });

  return {
    totalRevenue: totalInvestment,
    activeProjects: activeSponsorships,
    completedProjects: acceptedSponsorships,
    averageRating: Math.round(avgRating * 10) / 10,
    conversionRate,
    totalInvestment,
    sponsoredCampaigns: totalSponsorships,
    avgSponsorshipAmount: totalSponsorships > 0 ? Math.round(totalInvestment / totalSponsorships) : 0,
    activeSponsorships,
    monthlyData: Array.from(buckets.values()),
  };
}

export const useROIDashboard = (userRole: UserRole) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['roi-dashboard', user?.id, userRole],
    queryFn: async (): Promise<ROIMetrics> => {
      if (!user?.id) throw new Error('User not authenticated');

      switch (userRole) {
        case 'business_client':
          return fetchBusinessROI(user.id);
        case 'content_creator':
          return fetchCreatorROI(user.id);
        case 'brand':
          return fetchBrandROI(user.id);
        default:
          return fetchBusinessROI(user.id);
      }
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });
};
