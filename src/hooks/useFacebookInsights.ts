import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { codeFromInvokeError, messageFromInvokeError } from '@/lib/invokeError';

/**
 * Read-only Facebook Page insights.
 *
 * Every figure arrives with the N behind it — `days_with_data`, never
 * `requested_days` — because Meta processes insights in arrears, so a 30-day
 * request routinely returns fewer days. A caller dividing by the requested
 * window is quietly wrong. See [[Honest Analytics]].
 *
 * `totals` is a partial record on purpose. A metric Meta did not return is an
 * ABSENT KEY, never a zero, and the card renders it as "—". Typing it as a full
 * record with zeroes would push the fabricated-zero bug from the server into the
 * UI, where it is much harder to see.
 *
 * `unavailable_metrics` has no Instagram equivalent and is the important one
 * here. Meta deprecated 85 Page Insights metrics on 2026-06-15 across all API
 * versions, and rejects an entire request over one bad name — so the server
 * drops rejected metrics and retries. This field is how the UI can tell "this
 * metric is gone" from "this metric was zero", which are the same picture and
 * opposite meanings.
 */

/**
 * Codes meaning the SERVER has just set the connection to `needs_reconnect`, so
 * our cached connection list is stale by exactly the field that decides whether
 * the user is offered the only button that fixes their error.
 *
 * `rate_limited` is deliberately absent. Meta answers 403 for both a dead grant
 * and being over quota, and treating throttling as revocation would tell every
 * user on the platform to reconnect during one bad hour — the defect the YouTube
 * connector shipped and had to correct.
 */
const RECONNECT_CODES = new Set(['auth_failed', 'missing_task', 'missing_permission']);

export interface FacebookDailyPoint {
  date: string;
  value: number;
}

export interface FacebookPageInsights {
  page_id: string;
  page_name: string | null;
  requested_days: number;
  /** Distinct days Meta actually returned. This is the number to show. */
  days_with_data: number;
  /** Absent metric => absent key. Never a zero. */
  totals: Record<string, number>;
  series: Record<string, FacebookDailyPoint[]>;
  /** Metrics we asked for and could not get. Reported, never silently dropped. */
  unavailable_metrics: string[];
}

export function useFacebookPageInsights(
  pageId: string | undefined,
  days = 30,
  options: { enabled?: boolean } = {},
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['facebook-insights', user?.id, pageId, days],
    enabled: !!user?.id && !!pageId && options.enabled !== false,
    // Insights move once a day at most; refetching on every mount spends Meta's
    // rate limit to show the same numbers.
    staleTime: 15 * 60 * 1000,
    // A dead token or a missing Page task will not fix itself on retry. Both
    // need the user to act, and retrying only delays the message.
    retry: false,
    queryFn: async (): Promise<FacebookPageInsights> => {
      const { data, error } = await supabase.functions.invoke<FacebookPageInsights>(
        'facebook-insights',
        { body: { page_id: pageId, days } },
      );

      if (error) {
        // Read the CODE before the message: the server has already written
        // `needs_reconnect` to the row, so the connection query must refetch or
        // the card keeps saying "Connected" while hiding the Reconnect button
        // behind an error the user cannot act on.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['facebook-connections', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not read Facebook insights'));
      }
      if (!data) throw new Error('Could not read Facebook insights');
      return data;
    },
  });
}
