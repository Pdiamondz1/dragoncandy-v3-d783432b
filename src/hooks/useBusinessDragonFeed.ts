import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FeedMediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
  campaignTitle?: string;
  submittedAt?: Date;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

const getSignedUrl = async (path: string, bucket: string = 'profile-assets'): Promise<string | null> => {
  const cached = signedUrlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600);
    
  if (error || !data?.signedUrl) return null;
  
  signedUrlCache.set(path, { url: data.signedUrl, expiresAt: now + 55 * 60 * 1000 });
  return data.signedUrl;
};

export const useBusinessDragonFeed = () => {
  const [feedItems, setFeedItems] = useState<FeedMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFeedData = async () => {
      try {
        setLoading(true);

        // Fetch creator portfolio media
        const { data: creators, error: fetchError } = await supabase
          .from('creator_profiles')
          .select('id, user_id, creator_name, portfolio_urls, profile_slug')
          .eq('is_completed', true)
          .eq('allow_portfolio_in_feed', true)
          .not('portfolio_urls', 'is', null)
          .limit(30);

        if (fetchError) throw fetchError;

        if (!creators || creators.length === 0) {
          setFeedItems([]);
          return;
        }

        // Process portfolio URLs
        const mediaPromises = creators.flatMap((creator) => {
          const urls = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
          return urls
            .filter((url: unknown) => typeof url === 'string' && url.length > 0)
            .map(async (url: string) => {
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : await getSignedUrl(url);
              if (!finalUrl) return null;
              
              const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
              return {
                id: `${creator.id}-${url}`,
                url: finalUrl,
                type: isVideo ? 'video' : 'image',
                creatorName: creator.creator_name || 'Creator',
                creatorSlug: creator.profile_slug || '',
                creatorId: creator.user_id || creator.id,
              } as FeedMediaItem;
            });
        });

        const settled = await Promise.allSettled(mediaPromises);
        const mediaItems: FeedMediaItem[] = settled
          .filter((r): r is PromiseFulfilledResult<FeedMediaItem | null> => r.status === 'fulfilled')
          .map(r => r.value)
          .filter((v): v is FeedMediaItem => !!v);

        // Shuffle and set feed items
        const shuffled = mediaItems.sort(() => Math.random() - 0.5);
        setFeedItems(shuffled);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        setLoading(false);
      }
    };

    fetchFeedData();

    // Set up real-time subscription for new content
    const channel = supabase
      .channel('dragon-feed-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'creator_profiles',
          filter: 'allow_portfolio_in_feed=eq.true'
        },
        () => {
          // Refetch when creator portfolios are updated
          fetchFeedData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { feedItems, loading, error };
};
