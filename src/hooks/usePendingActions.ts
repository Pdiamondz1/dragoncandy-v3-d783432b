import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PendingAction {
  campaignId: string;
  campaignTitle: string;
  actionType: 'review_application' | 'review_content';
  creatorName: string;
  daysAgo: number;
}

export function usePendingActions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-actions', user?.id],
    queryFn: async (): Promise<PendingAction[]> => {
      const actions: PendingAction[] = [];

      // Pending applications
      // FK: campaign_applications_creator_id_fkey → profiles (column: creator_id)
      const { data: pendingApps } = await supabase
        .from('campaign_applications')
        .select(`
          id,
          created_at,
          campaign_id,
          campaigns!inner(title, user_id),
          profiles!campaign_applications_creator_id_fkey(full_name)
        `)
        .eq('status', 'pending')
        .eq('campaigns.user_id', user!.id);

      if (pendingApps) {
        for (const app of pendingApps) {
          const createdAt = new Date(app.created_at);
          const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
          const campaign = app.campaigns as unknown as { title: string; user_id: string };
          const profile = app.profiles as unknown as { full_name: string | null };
          actions.push({
            campaignId: app.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_application',
            creatorName: profile?.full_name ?? 'A creator',
            daysAgo,
          });
        }
      }

      // Content submitted but not reviewed
      // FK: campaign_collaborations_creator_id_fkey → profiles (column: creator_id)
      const { data: pendingContent } = await supabase
        .from('campaign_collaborations')
        .select(`
          id,
          updated_at,
          campaign_id,
          campaigns!inner(title, user_id),
          profiles!campaign_collaborations_creator_id_fkey(full_name)
        `)
        .eq('content_status', 'submitted')
        .eq('status', 'active')
        .eq('campaigns.user_id', user!.id);

      if (pendingContent) {
        for (const collab of pendingContent) {
          const updatedAt = new Date(collab.updated_at);
          const daysAgo = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
          const campaign = collab.campaigns as unknown as { title: string; user_id: string };
          const profile = collab.profiles as unknown as { full_name: string | null };
          actions.push({
            campaignId: collab.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_content',
            creatorName: profile?.full_name ?? 'A creator',
            daysAgo,
          });
        }
      }

      return actions;
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
}
