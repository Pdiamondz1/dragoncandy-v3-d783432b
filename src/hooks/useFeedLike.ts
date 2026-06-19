import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { sanitizeUrlForAnalytics } from '@/lib/analyticsUrl';

interface LikeableItem {
  id: string;
  url: string;
  creatorId: string;
}

export function useFeedLike(item: LikeableItem | null) {
  const [liked, setLiked] = useState(false);
  const { activeOrgUnit } = useAuth();

  useEffect(() => {
    const checkIfLiked = async () => {
      if (!item) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .eq('event_data->>content_id', item.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && typeof data.event_data === 'object' && data.event_data !== null) {
        const eventData = data.event_data as { action?: string };
        setLiked(eventData.action === 'like');
      } else {
        setLiked(false);
      }
    };

    checkIfLiked();
  }, [item?.id, item]);

  const toggleLike = async () => {
    if (!item) return;
    const newLikedState = !liked;
    setLiked(newLikedState);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('analytics_events').insert({
        event_type: 'dragon_feed_like',
        user_id: user.id,
        org_unit_id: activeOrgUnit?.id ?? null,
        page_url: sanitizeUrlForAnalytics(window.location.href),
        user_agent: navigator.userAgent,
        event_data: {
          content_id: item.id,
          creator_id: item.creatorId,
          action: newLikedState ? 'like' : 'unlike'
        }
      });

      // Send email notification for likes (not unlikes)
      if (newLikedState) {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'content_liked',
            data: {
              recipientUserId: item.creatorId,
              likerName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Someone',
              contentUrl: item.url,
            }
          }
        }).catch(err => console.error('Failed to send like notification email:', err));
      }
    } catch (error) {
      console.error('Failed to track like:', error);
    }
  };

  return { liked, toggleLike };
}
