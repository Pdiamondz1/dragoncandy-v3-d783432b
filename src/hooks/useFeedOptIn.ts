import { useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const DISMISS_KEY = (userId: string) => `dc:dragonfeed:optInDismissed:${userId}`;

/**
 * The signed-in creator's Dragon Feed opt-in (`creator_profiles.allow_portfolio_in_feed`).
 *
 * Exists because the flag defaults to false and its only UI was a switch inside a collapsed
 * Settings accordion — so most creators never knew the feed existed, let alone that they were
 * absent from it. This backs a dashboard prompt for creators who have work to show and are opted
 * out.
 *
 * The prompt is **self-limiting**: `shouldPrompt` requires the flag to still be false, so opting
 * in removes it permanently with no dismissal state to store. "Not now" is a per-device
 * localStorage flag — deliberately not a new column, since the only cost of it reappearing on a
 * second device is one more glance at a card the creator can act on in one tap.
 */
export function useFeedOptIn() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['creator-feed-opt-in', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('allow_portfolio_in_feed, portfolio_urls, profile_visibility')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  const optIn = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('creator_profiles')
        .update({ allow_portfolio_in_feed: true })
        .eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-feed-opt-in', userId] });
    },
  });

  const dismiss = useCallback(() => {
    if (!userId) return;
    try {
      window.localStorage.setItem(DISMISS_KEY(userId), '1');
    } catch {
      // Storage disabled — the card simply shows again next visit.
    }
  }, [userId]);

  const locallyDismissed = (() => {
    if (!userId) return true;
    try {
      return !!window.localStorage.getItem(DISMISS_KEY(userId));
    } catch {
      return false;
    }
  })();

  // Only ask creators the answer can actually help: opted out, publicly visible, and with work
  // to show. Prompting someone with an empty portfolio just asks them to publish nothing.
  const shouldPrompt =
    !isLoading &&
    !!data &&
    data.allow_portfolio_in_feed === false &&
    data.profile_visibility === 'public' &&
    (data.portfolio_urls?.length ?? 0) > 0 &&
    !locallyDismissed;

  return { shouldPrompt, optIn: optIn.mutateAsync, isOptingIn: optIn.isPending, dismiss };
}
