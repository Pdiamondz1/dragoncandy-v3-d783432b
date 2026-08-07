import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sanitizeUrlForAnalytics } from '@/lib/analyticsUrl';
import { claimViewOncePerDay } from '@/lib/feedViewTracking';

interface ViewableItem {
  id: string;
  creatorId: string;
}

/**
 * Records a Dragon Feed view (an item opened in the lightbox), at most once per user/item/day.
 *
 * Deliberately keyed by the SAME composite `content_id` that `useFeedLike` writes — `${creator.id}-${url}`.
 * Two live surfaces decode that id by string-stripping the creator prefix to recover the media URL
 * (`useBusinessActivity.ts`, `useInspirationStrip.ts`), so any new id scheme would silently break
 * them. Reusing the existing key means views and likes aggregate over one identity.
 *
 * Fire-and-forget: a failed analytics write must never interrupt browsing.
 */
export function useRecordFeedView() {
  const { activeOrgUnit } = useAuth();

  return useCallback(
    async (item: ViewableItem | null | undefined) => {
      if (!item) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!claimViewOncePerDay(window.localStorage, user.id, item.id)) return;

        await supabase.from('analytics_events').insert({
          event_type: 'dragon_feed_view',
          user_id: user.id,
          org_unit_id: activeOrgUnit?.id ?? null,
          page_url: sanitizeUrlForAnalytics(window.location.href),
          user_agent: navigator.userAgent,
          event_data: { content_id: item.id, creator_id: item.creatorId },
        });
      } catch (err) {
        console.warn('Dragon Feed: view not recorded', err);
      }
    },
    [activeOrgUnit],
  );
}
