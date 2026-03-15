import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type CollaborationCampaign = { id: string; title: string; user_id: string };

export interface CollaborationDetails {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: string;
  content_status: string | null;
  content_started_at: string | null;
  content_deadline: string | null;
  revision_count: number;
  business_completion_status: string | null;
  creator_completion_status: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  campaign: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    deadline: string | null;
    budget_min: number | null;
    budget_max: number | null;
    fixed_price: number | null;
    delivery_type: string | null;
    delivery_fee: number | null;
    pricing_type: string | null;
    user_id: string;
  };
  creator_profile: {
    user_id: string;
    creator_name: string;
    avatar_url: string | null;
    bio: string | null;
  } | null;
  business_profile: {
    user_id: string;
    business_name: string;
    logo_url: string | null;
  } | null;
}

export function useCollaboration(collaborationId: string) {
  return useQuery({
    queryKey: ['collaboration', collaborationId],
    queryFn: async (): Promise<CollaborationDetails | null> => {
      if (!collaborationId) return null;

      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          campaign_id,
          creator_id,
          status,
          content_status,
          content_started_at,
          content_deadline,
          revision_count,
          business_completion_status,
          creator_completion_status,
          completed_at,
          created_at,
          updated_at,
          campaigns!inner (
            id,
            title,
            description,
            status,
            deadline,
            budget_min,
            budget_max,
            fixed_price,
            delivery_type,
            delivery_fee,
            pricing_type,
            user_id
          )
        `)
        .eq('id', collaborationId)
        .single();

      if (error) throw error;
      if (!data) return null;

      // Fetch creator profile
      const { data: creatorProfile } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name, avatar_url, bio')
        .eq('user_id', data.creator_id)
        .single();

      // Fetch business profile
      const campaignData = data.campaigns as unknown as CollaborationCampaign;
      const { data: businessProfile } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url')
        .eq('user_id', campaignData.user_id)
        .single();

      return {
        id: data.id,
        campaign_id: data.campaign_id,
        creator_id: data.creator_id,
        status: data.status,
        content_status: data.content_status,
        content_started_at: data.content_started_at,
        content_deadline: data.content_deadline,
        revision_count: data.revision_count ?? 0,
        business_completion_status: data.business_completion_status,
        creator_completion_status: data.creator_completion_status,
        completed_at: data.completed_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
        campaign: campaignData,
        creator_profile: creatorProfile,
        business_profile: businessProfile
      };
    },
    enabled: !!collaborationId
  });
}
