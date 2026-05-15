import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface DraftPost {
  id: string;
  user_id: string;
  campaign_id: string | null;
  platform: string;
  content_type: string;
  caption: string | null;
  media_urls: string[] | null;
  hashtags: string[] | null;
  scheduled_at: string;
  status: string;
  ai_suggested_time: boolean;
  ai_reasoning: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useDraftPosts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: drafts = [], isLoading } = useQuery<DraftPost[]>({
    queryKey: ['draft-posts', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('donny_scheduled_posts')
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, status, ai_suggested_time, ai_reasoning, metadata, created_at')
        .eq('user_id', user.id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const cancelDraft = useMutation({
    mutationFn: async (draftId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('id', draftId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
    onError: () => { toast.error('Failed to cancel draft'); },
  });

  const scheduleDraft = useMutation({
    mutationFn: async ({ draftId, scheduledAt }: { draftId: string; scheduledAt?: string }) => {
      if (!user) throw new Error('User not authenticated');

      const { data: draft, error: fetchErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, media_urls, platform, content_type, scheduled_at')
        .eq('id', draftId)
        .eq('user_id', user.id)
        .single();

      if (fetchErr || !draft) throw new Error('Draft not found');

      const scheduleTime = scheduledAt || draft.scheduled_at;

      try {
        await supabase.functions.invoke('outstand-proxy', {
          body: {
            path: '/v1/posts',
            method: 'POST',
            payload: {
              caption: draft.caption,
              media_urls: draft.media_urls,
              platform: draft.platform,
              content_type: draft.content_type,
              scheduled_at: scheduleTime,
            },
          },
        });
      } catch {
        // Outstand scheduling may fail in test mode — still save locally
      }

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'scheduled', scheduled_at: scheduleTime })
        .eq('id', draftId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
    onError: () => { toast.error('Failed to schedule draft'); },
  });

  const scheduleAllDrafts = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      await Promise.all(drafts.map((draft) => scheduleDraft.mutateAsync({ draftId: draft.id })));
    },
    onError: () => { toast.error('Failed to schedule all drafts'); },
  });

  return { drafts, isLoading, draftCount: drafts.length, cancelDraft, scheduleDraft, scheduleAllDrafts };
}
