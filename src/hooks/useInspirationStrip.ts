import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

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

      // Fetch liked content IDs
      const { data: likeEvents } = await supabase
        .from('analytics_events')
        .select('event_data')
        .eq('user_id', user.id)
        .eq('event_type', 'dragon_feed_like')
        .order('created_at', { ascending: false });

      const likedIds = new Set<string>();
      const seen = new Set<string>();
      for (const event of likeEvents ?? []) {
        const d = event.event_data as Record<string, string> | null;
        if (!d) continue;
        if (seen.has(d.content_id)) continue;
        seen.add(d.content_id);
        if (d.action === 'like') likedIds.add(d.content_id);
      }

      // Fetch creator portfolio content
      const { data: creators } = await supabase
        .from('creator_profiles')
        .select('user_id, creator_name, portfolio_urls')
        .eq('is_completed', true)
        .eq('allow_portfolio_in_feed', true)
        .not('portfolio_urls', 'is', null)
        .limit(20);

      if (!creators?.length) return [];

      const items: InspirationItem[] = [];
      for (const creator of creators) {
        const urls = (creator.portfolio_urls as string[]) ?? [];
        for (const url of urls) {
          const id = `${creator.user_id}-${url}`;
          const isExternal = url.startsWith('http');
          const resolvedUrl = isExternal ? url : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${url}`;
          const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
          const label = isVideo ? 'Video content' : 'Photo content';
          items.push({
            id,
            url: resolvedUrl,
            type: isVideo ? 'video' : 'image',
            creatorName: creator.creator_name ?? 'Creator',
            creatorId: creator.user_id,
            contentLabel: label,
            isLiked: likedIds.has(id),
          });
        }
      }

      // Sort: liked first, then stable order
      items.sort((a, b) => {
        if (a.isLiked && !b.isLiked) return -1;
        if (!a.isLiked && b.isLiked) return 1;
        return 0;
      });

      return items.slice(0, 8);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
