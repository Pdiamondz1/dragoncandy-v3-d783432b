// src/hooks/useBusinessDashboardMetrics.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BusinessMetric {
  value: number | string;
  label: string;
  trend?: { direction: 'up' | 'down'; value: string } | null;
  emptyNudge?: string;
}

export interface BusinessDashboardMetrics {
  activeCampaigns: BusinessMetric;
  pendingContent: BusinessMetric;
  totalSpend: BusinessMetric;
  avgEngagement: BusinessMetric;
}

export function useBusinessDashboardMetrics(orgUnitId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business_dashboard_metrics', user?.id, orgUnitId ?? 'all'],
    queryFn: async (): Promise<BusinessDashboardMetrics> => {
      if (!user) throw new Error('User not authenticated');

      // Active campaigns count
      let activeQuery = supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['active', 'published']);

      if (orgUnitId) {
        activeQuery = activeQuery.eq('org_unit_id', orgUnitId);
      }

      const { count: activeCount, error: activeError } = await activeQuery;

      if (activeError) throw activeError;

      // Pending content (collaborations in progress on user's campaigns)
      let pendingQuery = supabase
        .from('campaign_collaborations')
        .select('id, campaigns!inner(user_id, org_unit_id)')
        .eq('campaigns.user_id', user.id)
        .eq('status', 'active');

      if (orgUnitId) {
        pendingQuery = pendingQuery.eq('campaigns.org_unit_id', orgUnitId);
      }

      const { data: pendingCollabs, error: pendingError } = await pendingQuery;

      if (pendingError) throw pendingError;

      // Total spend (sum of proposed_rate from accepted applications on user's campaigns)
      let spendQuery = supabase
        .from('campaign_applications')
        .select('proposed_rate, campaigns!inner(user_id, org_unit_id)')
        .eq('campaigns.user_id', user.id)
        .eq('status', 'accepted');

      if (orgUnitId) {
        spendQuery = spendQuery.eq('campaigns.org_unit_id', orgUnitId);
      }

      const { data: acceptedApps, error: spendError } = await spendQuery;

      if (spendError) throw spendError;

      const totalSpend = acceptedApps?.reduce(
        (sum, app) => sum + (Number(app.proposed_rate) || 0),
        0
      ) ?? 0;

      const activeCampaignsVal = activeCount ?? 0;
      const pendingContentVal = pendingCollabs?.length ?? 0;

      return {
        activeCampaigns: {
          value: activeCampaignsVal,
          label: 'Active Campaigns',
          trend: null,
          emptyNudge: activeCampaignsVal === 0 ? 'Launch your first campaign' : undefined,
        },
        pendingContent: {
          value: pendingContentVal,
          label: 'Pending Content',
          trend: null,
          emptyNudge: pendingContentVal === 0 ? 'No content pending' : undefined,
        },
        totalSpend: {
          value: totalSpend > 0 ? `$${totalSpend >= 1000 ? `${(totalSpend / 1000).toFixed(1)}k` : totalSpend}` : '$0',
          label: 'Total Spend',
          trend: null,
          emptyNudge: totalSpend === 0 ? 'Track your investment' : undefined,
        },
        avgEngagement: {
          value: '—',
          label: 'Avg. Engagement',
          trend: null,
          emptyNudge: 'Coming soon',
        },
      };
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
