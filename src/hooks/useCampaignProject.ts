import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { deriveCurrentStep as deriveStep, type ProjectStep } from '@/lib/campaignPhase';

export type { ProjectStep };

export interface CampaignProject {
  collaboration: {
    id: string;
    status: string;
    content_status: string | null;
    revision_count: number;
    business_completion_status: string | null;
    creator_completion_status: string | null;
    completed_at: string | null;
    creator_id: string;
  };
  campaign: {
    id: string;
    title: string;
    description: string;
    status: string;
    deadline: string | null;
    budget_min: number | null;
    budget_max: number | null;
    deliverables: string[] | null;
    platforms: string[] | null;
    escrow_status: string | null;
    delivery_type: string | null;
  };
  creator: {
    user_id: string;
    creator_name: string;
    avatar_url: string | null;
    bio: string | null;
    rating: number | null;
    completed_projects: number;
  };
}

export function deriveCurrentStep(project: CampaignProject): ProjectStep {
  return deriveStep(project.collaboration);
}

export function useCampaignProject(campaignId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['campaign-project', campaignId],
    queryFn: async (): Promise<CampaignProject | null> => {
      if (!user) return null;

      const { data: collabs, error } = await supabase
        .from('campaign_collaborations')
        .select(`
          id, status, content_status, revision_count,
          business_completion_status, creator_completion_status,
          completed_at, creator_id,
          campaigns!inner (
            id, title, description, status, deadline,
            budget_min, budget_max, deliverables, platforms,
            escrow_status, delivery_type, user_id
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('campaigns.user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!collabs || collabs.length === 0) return null;

      const collab = collabs[0];
      const campaign = Array.isArray(collab.campaigns)
        ? collab.campaigns[0]
        : collab.campaigns;

      const [{ data: creatorProfile }, { data: projectCount }, { data: reviews }] = await Promise.all([
        supabase
          .from('creator_profiles')
          .select('user_id, creator_name, avatar_url, bio')
          .eq('user_id', collab.creator_id)
          .maybeSingle(),
        supabase
          .from('campaign_collaborations')
          .select('id')
          .eq('creator_id', collab.creator_id)
          .eq('status', 'completed'),
        supabase
          .from('project_reviews')
          .select('rating')
          .eq('reviewee_id', collab.creator_id)
          .eq('review_type', 'business_to_creator'),
      ]);

      const avgRating = reviews?.length
        ? reviews.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviews.length
        : null;

      return {
        collaboration: {
          id: collab.id,
          status: collab.status,
          content_status: collab.content_status ?? null,
          revision_count: collab.revision_count ?? 0,
          business_completion_status: collab.business_completion_status ?? null,
          creator_completion_status: collab.creator_completion_status ?? null,
          completed_at: collab.completed_at ?? null,
          creator_id: collab.creator_id,
        },
        campaign: {
          id: campaign.id,
          title: campaign.title,
          description: campaign.description,
          status: campaign.status,
          deadline: campaign.deadline,
          budget_min: campaign.budget_min,
          budget_max: campaign.budget_max,
          deliverables: campaign.deliverables as string[] | null,
          platforms: campaign.platforms as string[] | null,
          escrow_status: campaign.escrow_status,
          delivery_type: campaign.delivery_type,
        },
        creator: {
          user_id: collab.creator_id,
          creator_name: creatorProfile?.creator_name ?? 'Creator',
          avatar_url: creatorProfile?.avatar_url ?? null,
          bio: creatorProfile?.bio ?? null,
          rating: avgRating,
          completed_projects: projectCount?.length ?? 0,
        },
      };
    },
    enabled: !!user && !!campaignId,
  });
}
