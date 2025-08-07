
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useProjectCompletion = (userId?: string) => {
  return useQuery({
    queryKey: ['project-completion', userId],
    queryFn: async () => {
      if (!userId) return [];

      try {
        // Simplified approach: get collaborations first, then fetch related data separately
        const { data: collaborations, error: collabError } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            review_status,
            creator_id,
            campaign_id
          `)
          .eq('status', 'completed')
          .eq('creator_id', userId)
          .in('review_status', ['pending', 'completed']);

        if (collabError) {
          console.error('Error fetching collaborations:', collabError);
          return [];
        }

        // Also get collaborations where user is the business owner
        const { data: businessCollabs, error: businessError } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            review_status,
            creator_id,
            campaign_id,
            campaigns!inner(user_id)
          `)
          .eq('status', 'completed')
          .eq('campaigns.user_id', userId)
          .in('review_status', ['pending', 'completed']);

        if (businessError) {
          console.error('Error fetching business collaborations:', businessError);
        }

        // Combine both arrays
        const allCollabs = [...(collaborations || []), ...(businessCollabs || [])];

        // Get unique campaign IDs to fetch campaign details
        const campaignIds = [...new Set(allCollabs.map(c => c.campaign_id))];
        
        if (campaignIds.length === 0) return [];

        // Fetch campaign details
        const { data: campaigns, error: campaignError } = await supabase
          .from('campaigns')
          .select('id, title, user_id')
          .in('id', campaignIds);

        if (campaignError) {
          console.error('Error fetching campaigns:', campaignError);
        }

        // Fetch creator profiles
        const creatorIds = [...new Set(allCollabs.map(c => c.creator_id))];
        const { data: creators, error: creatorError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);

        if (creatorError) {
          console.error('Error fetching creators:', creatorError);
        }

        // Fetch business profiles
        const businessIds = [...new Set(campaigns?.map(c => c.user_id) || [])];
        const { data: businesses, error: businessError2 } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', businessIds);

        if (businessError2) {
          console.error('Error fetching businesses:', businessError2);
        }

        // Combine all data
        return allCollabs.map(collab => {
          const campaign = campaigns?.find(c => c.id === collab.campaign_id);
          const creator = creators?.find(c => c.id === collab.creator_id);
          const business = businesses?.find(b => b.id === campaign?.user_id);

          return {
            ...collab,
            campaigns: campaign ? {
              user_id: campaign.user_id,
              title: campaign.title,
              profiles: business ? { full_name: business.full_name } : null
            } : null,
            creator: creator ? { full_name: creator.full_name } : null,
            business: business ? [{ profiles: { full_name: business.full_name } }] : []
          };
        });
      } catch (error) {
        console.error('Error in useProjectCompletion:', error);
        return [];
      }
    },
    enabled: !!userId,
  });
};
