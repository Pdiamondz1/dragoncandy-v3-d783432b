// src/hooks/useCreatorCollaborations.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CollaborationCampaign {
  id: string;
  title: string;
  user_id: string;
  budget_min: number | null;
  budget_max: number | null;
  fixed_price: number | null;
  pricing_type: string | null;
  delivery_type: string | null;
}

export interface CollaborationBusinessProfile {
  business_name: string;
  logo_url: string | null;
  profile_slug: string | null;
}

export type DeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved';

export interface CreatorCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: 'active' | 'completed' | 'cancelled';
  content_deadline: string | null;
  content_status: string | null;
  deliverables_status: Record<string, DeliverableStatus> | null;
  revision_count: number | null;
  completed_at: string | null;
  created_at: string;
  campaign: CollaborationCampaign;
  business_profile?: CollaborationBusinessProfile;
  existing_review_id?: string;
  existing_review_rating?: number;
}

export const useCreatorCollaborations = (statusFilter: 'active' | 'completed') => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-collaborations', user?.id, statusFilter],
    queryFn: async (): Promise<CreatorCollaboration[]> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Step 1: Fetch collaborations with campaign data
      const { data: collabs, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select(`
          id, campaign_id, creator_id, status, content_deadline, content_status,
          deliverables_status, revision_count, completed_at, created_at,
          campaign:campaigns!inner(id, title, user_id, budget_min, budget_max, fixed_price, pricing_type, delivery_type)
        `)
        .eq('creator_id', user.id)
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

      if (collabError) throw collabError;
      if (!collabs || collabs.length === 0) return [];

      // Step 2: Fetch business profiles for campaign owners
      const campaignUserIds = [...new Set(
        collabs
          .map(c => (c.campaign as unknown as CollaborationCampaign)?.user_id)
          .filter(Boolean)
      )];

      const { data: businessProfiles, error: profileError } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url, profile_slug')
        .in('user_id', campaignUserIds);

      if (profileError) throw profileError;

      const profileMap = new Map(
        (businessProfiles || []).map(p => [p.user_id, p])
      );

      // Step 3: For completed collaborations, check for existing reviews
      let reviewMap = new Map<string, string>();
      let reviewRatingMap = new Map<string, number>();
      if (statusFilter === 'completed') {
        const collabIds = collabs.map(c => c.id);
        const { data: reviews } = await supabase
          .from('project_reviews')
          .select('id, collaboration_id, rating')
          .eq('reviewer_id', user.id)
          .in('collaboration_id', collabIds);

        if (reviews) {
          reviewMap = new Map(
            reviews.map(r => [r.collaboration_id!, r.id])
          );
          reviewRatingMap = new Map(
            reviews.map(r => [r.collaboration_id!, r.rating])
          );
        }
      }

      // Step 4: Merge
      return collabs.map(collab => {
        const campaign = collab.campaign as unknown as CollaborationCampaign;
        const businessProfile = campaign ? profileMap.get(campaign.user_id) : undefined;

        return {
          id: collab.id,
          campaign_id: collab.campaign_id,
          creator_id: collab.creator_id,
          status: collab.status as CreatorCollaboration['status'],
          content_deadline: collab.content_deadline,
          content_status: collab.content_status,
          deliverables_status: collab.deliverables_status as Record<string, DeliverableStatus> | null,
          revision_count: collab.revision_count,
          completed_at: collab.completed_at,
          created_at: collab.created_at,
          campaign,
          business_profile: businessProfile ? {
            business_name: businessProfile.business_name,
            logo_url: businessProfile.logo_url,
            profile_slug: businessProfile.profile_slug,
          } : undefined,
          existing_review_id: reviewMap.get(collab.id),
          existing_review_rating: reviewRatingMap.get(collab.id),
        };
      });
    },
    enabled: !!user?.id,
  });
};
