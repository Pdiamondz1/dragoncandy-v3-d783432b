import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { codeFromInvokeError, messageFromInvokeError } from '@/lib/invokeError';

/**
 * Codes that mean the SERVER has just changed the connection's status to
 * `needs_reconnect`. Seeing one here means our cached connection list is stale
 * by exactly one field — the field that decides whether the user is offered the
 * Reconnect button, i.e. the only way out of the error they are looking at.
 */
const RECONNECT_CODES = new Set(['needs_reconnect', 'missing_scope']);

/**
 * Read-only YouTube channel performance.
 *
 * Every figure arrives with the N behind it — `days_with_data` and
 * `video_count` — because YouTube processes analytics a day or two in arrears,
 * so a 28-day request routinely returns fewer days. A caller that divides by
 * `days_requested` instead is quietly wrong. See [[Honest Analytics]].
 */

export interface YouTubeDailyPoint {
  date: string;
  views: number;
  minutes_watched: number;
  avg_view_duration_seconds: number;
  subscribers_gained: number;
  subscribers_lost: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface YouTubeTopVideo {
  video_id: string;
  /** null when the title lookup failed — show the id, don't call it a title. */
  title: string | null;
  views: number;
  minutes_watched: number;
  likes: number;
  comments: number;
}

export interface YouTubeAnalytics {
  channel: { channel_id: string; channel_title: string | null };
  range: { start_date: string; end_date: string; days_requested: number };
  totals: {
    views: number;
    minutes_watched: number;
    avg_view_duration_seconds: number;
    subscribers_gained: number;
    subscribers_lost: number;
    net_subscribers: number;
    likes: number;
    comments: number;
    shares: number;
  };
  daily: YouTubeDailyPoint[];
  days_with_data: number;
  top_videos: YouTubeTopVideo[];
  video_count: number;
}

export function useYouTubeAnalytics(
  channelId: string | undefined,
  days = 28,
  options: { enabled?: boolean } = {},
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['youtube-analytics', user?.id, channelId, days],
    enabled: !!user?.id && !!channelId && options.enabled !== false,
    // Analytics move once a day at most, so re-fetching on every mount spends
    // the user's Google quota to show them the same numbers.
    staleTime: 15 * 60 * 1000,
    // A missing scope or a dead refresh token will not fix itself on a retry;
    // both need the user to reconnect, and retrying just delays the message.
    retry: false,
    queryFn: async (): Promise<YouTubeAnalytics> => {
      const { data, error } = await supabase.functions.invoke<YouTubeAnalytics>(
        'youtube-analytics',
        { body: { channel_id: channelId, days } },
      );

      if (error) {
        // Read the code before the message: the server has already written
        // `needs_reconnect` to the row, so the connection query must be
        // refetched or the card keeps saying "Connected" and keeps the
        // Reconnect button hidden behind an error the user cannot act on.
        const code = await codeFromInvokeError(error, '');
        if (RECONNECT_CODES.has(code)) {
          void queryClient.invalidateQueries({ queryKey: ['youtube-connections', user?.id] });
        }
        throw new Error(await messageFromInvokeError(error, 'Could not read YouTube analytics'));
      }
      if (!data) throw new Error('Could not read YouTube analytics');
      return data;
    },
  });
}
