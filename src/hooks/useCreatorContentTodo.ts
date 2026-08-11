import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CreatorContentTodo {
  collaborationId: string;
  campaignId: string;
  campaignTitle: string;
  createdAt: string;
}

/**
 * Active collaborations where content hasn't been started yet.
 *
 * `status='active'` is required, mirroring usePendingActions.ts — without it
 * a cancelled collaboration still sitting at content_status='pending' would
 * render as "content not started", which is a lie.
 */
export function useCreatorContentTodo() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-content-todo', user?.id],
    queryFn: async (): Promise<CreatorContentTodo[]> => {
      const { data, error } = await supabase
        .from('campaign_collaborations')
        .select('id, campaign_id, created_at, campaigns(title)')
        .eq('creator_id', user!.id)
        .eq('status', 'active')
        .eq('content_status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row) => {
        const campaign = row.campaigns as unknown as { title: string } | null;
        return {
          collaborationId: row.id,
          campaignId: row.campaign_id,
          campaignTitle: campaign?.title ?? 'Untitled Campaign',
          createdAt: row.created_at,
        };
      });
    },
    enabled: !!user,
  });
}
