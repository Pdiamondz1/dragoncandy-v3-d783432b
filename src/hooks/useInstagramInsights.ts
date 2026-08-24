import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { codeFromInvokeError, messageFromInvokeError } from '@/lib/invokeError';

/**
 * Read-only Instagram account insights.
 *
 * Every figure arrives with the N behind it — `days_with_data`, never
 * `requested_days` — because Meta processes insights up to 48 hours in arrears,
 * so a 30-day request routinely returns fewer days. A caller that divides by the
 * requested window is quietly wrong. See [[Honest Analytics]].
 *
 * Note what the types below do NOT do: `totals` is a PARTIAL record. A metric
 * Instagram did not return is an ABSENT KEY, not a zero, and the card is
 * expected to render it as "—" rather than "0". Typing it as a full record with
 * zeroes would push the fabricated-zero bug from the server into the UI, where
 * it is harder to see.
 */

/**
 * Codes that mean the SERVER has just changed the connection's status to
 * `needs_reconnect`. Seeing one here means our cached connection list is stale
 * by exactly one field — the field that decides whether the user is offered the
 * Reconnect button, i.e. the only way out of the error they are looking at.
 *
 * `rate_limited` is deliberately NOT in this set. Meta overloads its error
 * surface the way Google overloads HTTP 403, and treating throttling as a dead
 * grant would tell every user on the platform to reconnect during one bad hour.
 */
const RECONNECT_CODES = new Set(['needs_reconnect', 'missing_permission']);

export type InstagramMetric =
  | 'reach'
  | 'views'
  | 'total_interactions'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'saves';

export interface InstagramDailyPoint {
  date: string;
  value: number;
}

export interface InstagramInsights {
  ig_user_id: string;
  username: string | null;
  account_type: string | null;
  followers_count: number | null;
  requested_days: number;
  /** Distinct days Meta actually returned. This is the number to show. */
  days_with_data: number;
  totals: Partial<Record<InstagramMetric, number>>;
  /** Derived from the two totals, never averaged from daily rates. Null when undefined. */
  interactions_per_reach: number | null;
  series: Partial<Record<InstagramMetric, InstagramDailyPoint[]>>;
}

export function useInstagramInsights(
  igUserId: string | undefined,
  days = 30,
  options: { enabled?: boolean } = {},
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['instagram-insights', user?.id, igUserId, days],
    enabled: !!user?.id && !!igUserId && options.enabled !== false,
    // Insights move once a day at most, so re-fetching on every mount spends
    // Meta's rate limit to show the user the same numbers.
    staleTime: 15 * 60 * 1000,
    // A missing permission or a dead token will not fix itself on a retry; both
    // need the user to reconnect, and retrying just delays the message.
    retry: false,
    queryFn: async (): Promise<InstagramInsights> => {
      const { data, error } = await supabase.functions.invoke<InstagramInsights>(
        'instagram-insights',
        { body: { ig_user_id: igUserId, days } },
      );

      if (error) {
        // Read the code before the message: the server has already written
        // `needs_reconnect` to the row, so the connection query must be
        // refetched or the card keeps saying "Connected" and keeps the
        // Reconnect button hidden behind an error the user cannot act on.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['instagram-connections', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not read Instagram insights'));
      }
      if (!data) throw new Error('Could not read Instagram insights');
      return data;
    },
  });
}
