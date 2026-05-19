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

      // Fetch collaborations for these campaigns
      const campaignIds = campaigns.map((c) => c.id);
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('campaign_id, creator_id, status')
        .in('campaign_id', campaignIds)
        .in('status', ['active', 'completed']);

      if (collabError) throw collabError;

      // Map collaboration status and collect creator IDs
      const collabStatusMap = new Map<string, { status: string }>();
      const collabCreatorMap = new Map<string, string>();
      collabs?.forEach((c) => {
        collabStatusMap.set(c.campaign_id, { status: c.status });
        if (c.creator_id) collabCreatorMap.set(c.campaign_id, c.creator_id);
      });

      // Fallback: check accepted applications for campaigns without a collaboration
      const campaignsWithoutCollab = campaigns
        .filter((c) => !collabCreatorMap.has(c.id))
        .map((c) => c.id);

      if (campaignsWithoutCollab.length > 0) {
        const { data: acceptedApps } = await supabase
          .from('campaign_applications')
          .select('campaign_id, creator_id')
          .in('campaign_id', campaignsWithoutCollab)
          .eq('status', 'accepted');

        acceptedApps?.forEach((app) => {
          if (app.creator_id && !collabCreatorMap.has(app.campaign_id)) {
            collabCreatorMap.set(app.campaign_id, app.creator_id);
          }
        });
      }

      // Batch-fetch creator display names from creator_profiles, fall back to profiles
      const creatorMap = new Map<string, string>();
      const allCreatorIds = [...new Set(collabCreatorMap.values())];
      if (allCreatorIds.length > 0) {
        const { data: creatorProfiles } = await supabase
          .from('creator_profiles')
          .select('user_id, creator_name')
          .in('user_id', allCreatorIds);

        const cpMap = new Map(
          (creatorProfiles ?? []).map((cp) => [cp.user_id, cp.creator_name])
        );

        const missingIds = allCreatorIds.filter((id) => !cpMap.get(id));
        let profileMap = new Map<string, string | null>();
        if (missingIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', missingIds);
          profileMap = new Map(
            (profiles ?? []).map((p) => [p.id, p.full_name])
          );
        }

        collabCreatorMap.forEach((creatorId, campaignId) => {
          const name = cpMap.get(creatorId) || profileMap.get(creatorId);
          if (name) creatorMap.set(campaignId, name);
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
