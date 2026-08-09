import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PendingAction {
  /** The row's own primary key (campaign_applications.id or campaign_collaborations.id).
   *  Distinguishes two applicants on the SAME campaign — campaignId alone collides. */
  sourceId: string;
  campaignId: string;
  campaignTitle: string;
  actionType: 'review_application' | 'review_content';
  creatorName: string;
  occurredAt: string;
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
          const campaign = app.campaigns as unknown as { title: string; user_id: string };
          const profile = app.profiles as unknown as { full_name: string | null };
          actions.push({
            sourceId: app.id,
            campaignId: app.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_application',
            creatorName: profile?.full_name ?? 'A creator',
            occurredAt: app.created_at,
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
          const campaign = collab.campaigns as unknown as { title: string; user_id: string };
          const profile = collab.profiles as unknown as { full_name: string | null };
          actions.push({
            sourceId: collab.id,
            campaignId: collab.campaign_id,
            campaignTitle: campaign?.title ?? 'Untitled Campaign',
            actionType: 'review_content',
            creatorName: profile?.full_name ?? 'A creator',
            occurredAt: collab.updated_at,
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
