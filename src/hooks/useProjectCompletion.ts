
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CollaborationWithCampaign {
  id: string;
  status: string;
  review_status: string | null;
  creator_id: string;
  campaign_id: string;
  campaigns: { id: string; title: string; user_id: string } | null;
}

export interface CompletedCollaboration {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: string;
  review_status: string | null;
  campaign_title: string;
  other_party_name: string;
  other_party_id: string;
  user_role: 'creator' | 'business';
  can_review: boolean;
}

export const useProjectCompletion = (userId?: string) => {
  return useQuery({
    queryKey: ['project-completion', userId],
    queryFn: async (): Promise<CompletedCollaboration[]> => {
      if (!userId) return [];

      try {
        // Get completed collaborations where user is involved
        const { data: collaborations, error: collabError } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            review_status,
            creator_id,
            campaign_id,
            campaigns(id, title, user_id)
          `)
          .eq('status', 'completed');

        if (collabError) {
          console.error('Error fetching collaborations:', collabError);
          return [];
        }

        if (!collaborations || collaborations.length === 0) {
          return [];
        }

        // Filter collaborations where user is involved
        const userCollaborations = (collaborations as unknown as CollaborationWithCampaign[]).filter((collab) =>
          collab.creator_id === userId || collab.campaigns?.user_id === userId
        );

        if (userCollaborations.length === 0) return [];

        // Get profile names for all participants
        const allUserIds = [...new Set([
          ...userCollaborations.map((c) => c.creator_id),
          ...userCollaborations.map((c) => c.campaigns?.user_id).filter(Boolean) as string[]
        ])];

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', allUserIds);

        // Check for existing reviews
        const { data: existingReviews } = await supabase
          .from('project_reviews')
          .select('collaboration_id, reviewer_id')
          .in('collaboration_id', userCollaborations.map((c) => c.id))
          .eq('reviewer_id', userId);

        const reviewedCollaborationIds = new Set((existingReviews ?? []).map((r) => r.collaboration_id));

        // Transform to final format
        const result: CompletedCollaboration[] = userCollaborations.map((collab) => {
          const isCreator = collab.creator_id === userId;
          const otherPartyId = isCreator ? collab.campaigns?.user_id : collab.creator_id;
          const otherPartyProfile = (profiles ?? []).find((p) => p.id === otherPartyId);
          
          return {
            id: collab.id,
            campaign_id: collab.campaign_id,
            creator_id: collab.creator_id,
            status: collab.status,
            review_status: collab.review_status,
            campaign_title: collab.campaigns?.title || 'Unknown Campaign',
            other_party_name: otherPartyProfile?.full_name || 'Unknown User',
            other_party_id: otherPartyId || '',
            user_role: isCreator ? 'creator' : 'business',
            can_review: !reviewedCollaborationIds.has(collab.id)
          };
        });

        return result;
      } catch (error) {
        console.error('Error in useProjectCompletion:', error);
        return [];
      }
    },
    enabled: !!userId,
    retry: 1,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};
