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
    isLoading: !!draftId && !!user && isLoading,
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
