// src/hooks/useBusinessActiveCampaigns.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { deriveCampaignPhase, phaseToDisplayLabel } from '@/lib/campaignPhase';

export interface ActiveCampaignItem {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'active' | 'completed' | 'cancelled';
  displayStatus: string;
  deadline: string | null;
  creatorName: string | null;
}

export function useBusinessActiveCampaigns(orgUnitId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business_active_campaigns', user?.id, orgUnitId ?? 'all'],
    queryFn: async (): Promise<ActiveCampaignItem[]> => {
      if (!user) throw new Error('User not authenticated');

      let campaignQuery = supabase
        .from('campaigns')
        .select('id, title, status, deadline')
        .eq('user_id', user.id)
        .not('status', 'eq', 'cancelled');

      if (orgUnitId) {
        campaignQuery = campaignQuery.eq('org_unit_id', orgUnitId);
      }

      const { data: campaigns, error } = await campaignQuery
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) return [];

      // Fetch collaborations for these campaigns to get creator names
      const campaignIds = campaigns.map((c) => c.id);
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('campaign_id, creator_id, status, profiles:creator_id(full_name), creator_profiles:creator_id(creator_name)')
        .in('campaign_id', campaignIds)
        .in('status', ['active', 'completed']);

      if (collabError) throw collabError;

      // Map creator names and collaboration status by campaign_id
      const creatorMap = new Map<string, string>();
      const collabStatusMap = new Map<string, { status: string }>();
      collabs?.forEach((c) => {
        const creatorName = (c.creator_profiles as unknown as { creator_name: string | null })?.creator_name;
        const fullName = (c.profiles as unknown as { full_name: string | null })?.full_name;
        const name = creatorName || fullName;
        if (name) creatorMap.set(c.campaign_id, name);
        collabStatusMap.set(c.campaign_id, { status: c.status });
      });

      // Fallback: check accepted applications for campaigns without a collaboration match
      const campaignsWithoutCreator = campaigns
        .filter((c) => !creatorMap.has(c.id))
        .map((c) => c.id);

      if (campaignsWithoutCreator.length > 0) {
        const { data: acceptedApps } = await supabase
          .from('campaign_applications')
          .select('campaign_id, creator_id, profiles:creator_id(full_name), creator_profiles:creator_id(creator_name)')
          .in('campaign_id', campaignsWithoutCreator)
          .eq('status', 'accepted');

        acceptedApps?.forEach((app) => {
          const creatorName = (app.creator_profiles as unknown as { creator_name: string | null })?.creator_name;
          const fullName = (app.profiles as unknown as { full_name: string | null })?.full_name;
          const name = creatorName || fullName;
          if (name && !creatorMap.has(app.campaign_id)) {
            creatorMap.set(app.campaign_id, name);
          }
        });
      }

      return campaigns.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status as ActiveCampaignItem['status'],
        displayStatus: phaseToDisplayLabel(deriveCampaignPhase(c.status, collabStatusMap.get(c.id) ?? null)),
        deadline: c.deadline,
        creatorName: creatorMap.get(c.id) ?? null,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
