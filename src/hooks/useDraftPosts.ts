import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { composeCaption } from '@/lib/composeCaption';

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
  deliverable_id: string | null;
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
        .select('id, user_id, campaign_id, platform, content_type, caption, media_urls, hashtags, scheduled_at, status, ai_suggested_time, ai_reasoning, metadata, created_at, plan_group_id, plan_order, deliverable_id')
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

  /** Edit a draft IN PLACE.
   *
   * A draft is a `donny_scheduled_posts` row, so editing it is an UPDATE on that
   * row — not a new post. The Edit button used to switch to the Compose tab and
   * pass nothing, which both dropped the draft's content on the floor AND left
   * the original row behind, so finishing the edit would have published a
   * duplicate and stranded the draft. Compose calls the provider's `createPost`;
   * it is not, and cannot be, a draft editor.
   *
   * Scoped to caption / hashtags / scheduled_at deliberately. Media lives behind
   * the provider upload flow and editing it needs that whole path, so this does
   * not pretend to offer it.
   *
   * `.eq('user_id', user.id)` matches every other mutation here: RLS already
   * restricts to own rows, and this makes the intent explicit rather than
   * resting on the policy alone.
   */
  const updateDraft = useMutation({
    mutationFn: async ({
      draftId,
      caption,
      hashtags,
      scheduledAt,
    }: {
      draftId: string;
      caption: string | null;
      hashtags: string[];
      scheduledAt: string;
    }) => {
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('donny_scheduled_posts')
        .update({ caption, hashtags, scheduled_at: scheduledAt })
        .eq('id', draftId)
        .eq('user_id', user.id)
        .eq('status', 'draft');

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-posts'] });
    },
    onError: (err: Error) => { toast.error(err.message || 'Failed to save draft'); },
  });

  const scheduleDraft = useMutation({
    mutationFn: async ({ draftId, scheduledAt }: { draftId: string; scheduledAt?: string }) => {
      if (!user) throw new Error('User not authenticated');

      const { data: draft, error: fetchErr } = await supabase
        .from('donny_scheduled_posts')
        .select('caption, hashtags, media_urls, platform, content_type, scheduled_at')
        .eq('id', draftId)
        .eq('user_id', user.id)
        .single();

      if (fetchErr || !draft) throw new Error('Draft not found');

      const scheduleTime = scheduledAt || draft.scheduled_at;

      // Validate a connected account exists for this platform.
      //
      // This previously used .maybeSingle() on (user_id, platform) with NO
      // status filter. Users accumulate rows per platform over time — a revoked
      // one plus a live one, say — so the query matched >1 row, .maybeSingle()
      // errored, the discarded error left `data` null, and the code told people
      // who DID have a working account to "Connect your account in Settings >
      // Social." Both founders were hitting this in production.
      //
      // Fix: filter to active rows and take the most recent, so extra history
      // rows are irrelevant rather than fatal.
      const { data: accountRows, error: accountErr } = await supabase
        .from('business_outstand_accounts')
        .select('id, status, provider, connected_at')
        .eq('user_id', user.id)
        .eq('platform', draft.platform)
        .eq('status', 'active')
        .order('connected_at', { ascending: false })
        .limit(1);

      if (accountErr) {
        throw new Error(`Could not check your ${draft.platform} connection: ${accountErr.message}`);
      }
      if (!accountRows || accountRows.length === 0) {
        throw new Error(
          `No active ${draft.platform} account. Connect your account in Settings > Social.`,
        );
      }

      let outstandScheduled = false;
      try {
        await supabase.functions.invoke('outstand-proxy', {
          body: {
            path: '/v1/posts',
            method: 'POST',
            payload: {
              // Same gap as publishDraft: hashtags live in their own column and
              // were never sent, so every tag on the draft was dropped at
              // schedule time. composeCaption is the shared join, so scheduling
              // and posting now produce identical text.
              caption: composeCaption(draft.caption, draft.hashtags as string[] | null),
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

  return { drafts, isLoading, draftCount: drafts.length, cancelDraft, updateDraft, scheduleDraft, scheduleAllDrafts, cancelPlanGroup };
}
