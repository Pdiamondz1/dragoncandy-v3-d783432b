import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface InspirationItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorId: string;
  contentLabel: string;
  isLiked: boolean;
}

export function useInspirationStrip() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['inspiration-strip', user?.id],
    queryFn: async (): Promise<InspirationItem[]> => {
      if (!user?.id) return [];

      const { data: likeEvents } = await supabase
        .from('analytics_events')
        .select('event_data, created_at')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .order('created_at', { ascending: false });

      if (!likeEvents?.length) return [];

      const contentMap = new Map<string, { creatorId: string; action: string }>();
      for (const event of likeEvents) {
        const d = event.event_data as Record<string, string> | null;
        if (!d?.content_id || !d?.creator_id) continue;
        if (contentMap.has(d.content_id)) continue;
        contentMap.set(d.content_id, { creatorId: d.creator_id, action: d.action ?? 'like' });
      }

      const likedEntries = Array.from(contentMap.entries())
        .filter(([_, v]) => v.action === 'like');

      if (likedEntries.length === 0) return [];

      const creatorIds = [...new Set(likedEntries.map(([_, v]) => v.creatorId))];
      const { data: creators } = await supabase
        .from('creator_profiles')
        .select('id, user_id, creator_name, portfolio_urls, profile_slug')
        .in('user_id', creatorIds);

      const creatorMap = new Map((creators ?? []).map((c) => [c.user_id, c]));

      const items: InspirationItem[] = [];
      for (const [contentId, { creatorId }] of likedEntries) {
        const creator = creatorMap.get(creatorId);
        if (!creator) continue;

        const urlPart = contentId.replace(`${creator.id}-`, '');
        const portfolio = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
        const matchedUrl = portfolio.find((u: string) => u === urlPart);
        if (!matchedUrl) continue;

        const resolvedUrl = matchedUrl.startsWith('http')
          ? matchedUrl
          : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${matchedUrl}`;
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(matchedUrl);

        items.push({
          id: contentId,
          url: resolvedUrl,
          type: isVideo ? 'video' : 'image',
          creatorName: creator.creator_name ?? 'Creator',
          creatorId: creator.user_id,
          contentLabel: isVideo ? 'Video content' : 'Photo content',
          isLiked: true,
        });

        if (items.length >= 8) break;
      }

      return items;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
