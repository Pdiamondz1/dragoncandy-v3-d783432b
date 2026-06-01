import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { deriveCreatorActivity, type DSPostRow, type DSActivityItem } from '@/lib/dragonshareActivity';

export interface ActivityItem {
  id: string;
  type: 'application' | 'collaboration' | 'completion' | 'dragonshare';
  status: string;
  description: string;
  created_at: string;
  campaign_id?: string;
}

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const dsDescription = (d: DSActivityItem): string => {
  switch (d.kind) {
    case 'paid':
      return `${d.contentType ? capitalize(d.contentType) : 'Your post'} boosted — +$${((d.payoutCents ?? 0) / 100).toFixed(0)}`;
    case 'not_selected':
      return 'A restaurant passed — share again';
    default:
      return 'Shared a post — awaiting a boost';
  }
};

export const useCreatorRecentActivity = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-recent-activity', user?.id],
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!user?.id) return [];

      try {
        const activities: ActivityItem[] = [];

        // Get recent applications
        const { data: applications, error: applicationsError } = await supabase
          .from('campaign_applications')
          .select(`
            id,
            status,
            created_at,
            campaign_id,
            campaigns(title)
          `)
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (applicationsError) {
          console.error('Error fetching applications:', applicationsError);
        } else {
          applications?.forEach((app) => {
            const campaignArr = app.campaigns as { title: string }[] | null;
            const campaignTitle = campaignArr?.[0]?.title;
            if (!campaignTitle) return;
            activities.push({
              id: app.id,
              type: 'application',
              status: app.status,
              description: `Applied to "${campaignTitle}" campaign`,
              created_at: app.created_at,
              campaign_id: app.campaign_id,
            });
          });
        }

        // Get recent collaborations
        const { data: collaborations, error: collaborationsError } = await supabase
          .from('campaign_collaborations')
          .select(`
            id,
            status,
            created_at,
            updated_at,
            campaign_id,
            campaigns(title)
          `)
          .eq('creator_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(5);

        if (collaborationsError) {
          console.error('Error fetching collaborations:', collaborationsError);
        } else {
          collaborations?.forEach((collab) => {
            const collabCampaignArr = collab.campaigns as { title: string }[] | null;
            const campaignTitle = collabCampaignArr?.[0]?.title;
            if (!campaignTitle) return;
            let description = '';
            switch (collab.status) {
              case 'active':
                description = `Started working on "${campaignTitle}"`;
                break;
              case 'completed':
                description = `Completed project "${campaignTitle}"`;
                break;
              default:
                description = `Project "${campaignTitle}" status updated`;
            }

            activities.push({
              id: collab.id,
              type: 'collaboration',
              status: collab.status,
              description,
              created_at: collab.updated_at,
              campaign_id: collab.campaign_id,
            });
          });
        }

        // Get recent DragonShare activity
        const { data: dsPosts, error: dsError } = await supabase
          .from('dragonshare_posts')
          .select('id, content_type, submitted_at, boost_status, declined_at, boosts:dragonshare_boosts(status, creator_payout_cents, transferred_at)')
          .eq('creator_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(6);

        if (dsError) {
          console.error('Error fetching dragonshare activity:', dsError);
        } else if (dsPosts) {
          const dsItems = deriveCreatorActivity(dsPosts as unknown as DSPostRow[]);
          dsItems.forEach((d) => {
            activities.push({
              id: `ds-${d.postId}-${d.kind}`,
              type: 'dragonshare',
              status: d.kind === 'paid' ? 'completed' : 'pending',
              description: dsDescription(d),
              created_at: d.timestamp || new Date(0).toISOString(),
              // no campaign_id → renders as a non-link row
            });
          });
        }

        // Sort by date and return latest 6
        return activities
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 6);
      } catch (error) {
        console.error('Error in useCreatorRecentActivity:', error);
        return [];
      }
    },
    enabled: !!user?.id,
  });
};