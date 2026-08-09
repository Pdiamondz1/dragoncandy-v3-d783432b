// The once-only guard for Donny's social draft card (CT-4b).
//
// The card is persisted verbatim into `donny_messages.rich_cards` and
// re-rendered on every conversation load, so "already sent" cannot live in
// component state — reopening the conversation would re-arm the button on a
// draft that is already on a real public feed, and a second tap posts a
// duplicate. `donny_draft_publications` holds that fact durably.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { buildDonnyScheduleRow } from '@/lib/donnyScheduleRow';

const key = (draftId: string) => ['donny-draft-published', draftId];

export interface DraftPublicationState {
  /** True once we KNOW this draft was published. */
  isPublished: boolean;
  /**
   * True while we do not yet know. The button stays disabled through this:
   * publishing is irreversible, so "not loaded yet" must not read as
   * "safe to send".
   */
  isLoading: boolean;
  /**
   * The read failed. Distinct from `isPublished: false` on purpose — one means
   * "not published", the other means "we cannot tell", and rendering a live
   * Post button in the second case is exactly the guess this card exists to
   * avoid.
   */
  isUnknown: boolean;
}

export function useDraftPublication(draftId: string | undefined): DraftPublicationState {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: key(draftId ?? 'none'),
    queryFn: async () => {
      // RLS already scopes this to the caller; the explicit user_id filter is
      // for the index, not for safety.
      const { data: row, error: qErr } = await supabase
        .from('donny_draft_publications')
        .select('published_at')
        .eq('draft_id', draftId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (qErr) throw qErr;
      return row ?? null;
    },
    enabled: !!draftId && !!user,
    // A publication is permanent — once true it can never become false, so
    // there is nothing to re-poll for.
    staleTime: Infinity,
  });

  return {
    isPublished: !!data,
    // "No session yet" counts as NOT KNOWN, not as "safe to send". React Query
    // reports a disabled query as not-loading, so without the `!user` term this
    // returns all-false during the auth-loading window and the card arms itself
    // with no guard behind it — the exact failure this hook exists to prevent,
    // just in a narrower window.
    isLoading: !!draftId && (!user || isLoading),
    isUnknown: !!error,
  };
}

export function useRecordDraftPublication() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (draftId: string) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase
        .from('donny_draft_publications')
        .insert({ draft_id: draftId, user_id: user.id });
      // A duplicate is not a failure — the primary key doing its job means this
      // draft was already recorded, which is the state we were trying to reach.
      if (error && error.code !== '23505') throw error;
      return draftId;
    },
    onSuccess: (draftId) => {
      queryClient.setQueryData(key(draftId), { published_at: new Date().toISOString() });
    },
  });
}

export interface RecordDonnyPostInput {
  platform: string;
  caption: string;
  mediaUrls: string[];
  accountIds: string[];
  scheduledAt: string | null;
  outstandPostId: string | null;
}

/**
 * Writes the `donny_scheduled_posts` row for a post published from a Donny
 * draft card.
 *
 * Without it a post scheduled through Donny goes out upstream and then vanishes
 * from the product — the calendar, `UpcomingPostsWidget`, `SocialPostStatus`
 * and `PostManagementPanel` all read that table, and every other cross-post
 * path already writes to it. Immediate posts get a row too (status
 * `published`), matching `SocialPostPrompt`'s `syncScheduledPost` rather than
 * inventing a second convention.
 *
 * Called AFTER the post is live, so a failure here means published-but-
 * unrecorded. It is surfaced, never swallowed and never retried: a retry would
 * re-publish a post that is already on a real public feed.
 */
export function useRecordDonnyScheduledPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: RecordDonnyPostInput) => {
      if (!user) throw new Error('not signed in');
      if (input.outstandPostId == null) {
        // Same warning the other publish paths emit: with no provider id the
        // webhook can never match this row, so the post is live but
        // permanently unmeasurable, and nothing else would say so.
        console.warn(
          '[useRecordDonnyScheduledPost] outstand_post_id is null — this post will never be matched by the webhook and will not be measured.',
        );
      }
      const row = buildDonnyScheduleRow({
        userId: user.id,
        platform: input.platform,
        caption: input.caption,
        mediaUrls: input.mediaUrls,
        accountIds: input.accountIds,
        scheduledAt: input.scheduledAt,
        outstandPostId: input.outstandPostId,
        now: new Date().toISOString(),
      });
      const { error } = await supabase.from('donny_scheduled_posts').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      // So the calendar and upcoming-posts surfaces show it without a reload.
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-posts'] });
    },
    onError: (error: Error) => {
      console.error('[useRecordDonnyScheduledPost] failed to record post:', error);
      toast({
        variant: 'destructive',
        title: 'Posted, but not saved',
        description: 'It went out, but we could not save it for scheduling or analytics.',
      });
    },
  });
}
