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
  plan_group_id: string | null;
  plan_order: number | null;
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
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, status, ai_suggested_time, ai_reasoning, metadata, created_at, plan_group_id, plan_order')
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

      // Validate Outstand account is connected for this platform
      const { data: outstandAccount } = await supabase
        .from('business_outstand_accounts')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('platform', draft.platform)
        .maybeSingle();

      if (!outstandAccount) {
        throw new Error(`No active Outstand account for ${draft.platform}. Connect your account in Settings > Social.`);
      }
      if (outstandAccount.status !== 'active') {
        throw new Error(`Your Outstand ${draft.platform} account is disconnected or expired. Reconnect in Settings > Social.`);
      }

      let outstandScheduled = false;
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
        outstandScheduled = true;
      } catch {
        toast.error('Outstand scheduling failed — draft saved locally. You can retry later.');
      }

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({
          status: outstandScheduled ? 'scheduled' : 'draft',
          scheduled_at: scheduleTime,
        })
        .eq('id', draftId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
    onError: (err: Error) => { toast.error(err.message || 'Failed to schedule draft'); },
  });

  const scheduleAllDrafts = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      await Promise.all(drafts.map((draft) => scheduleDraft.mutateAsync({ draftId: draft.id })));
    },
    onError: () => { toast.error('Failed to schedule all drafts'); },
  });

  const cancelPlanGroup = useMutation({
    mutationFn: async (planGroupId: string) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('plan_group_id', planGroupId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
    onError: () => { toast.error('Failed to cancel plan'); },
  });

  return { drafts, isLoading, draftCount: drafts.length, cancelDraft, scheduleDraft, scheduleAllDrafts, cancelPlanGroup };
}
