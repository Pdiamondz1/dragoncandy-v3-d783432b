import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FeedMediaItem } from './useBusinessDragonFeed';

export const useBusinessActivity = () => {
  const [likedItems, setLikedItems] = useState<FeedMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLikedContent = async () => {
      try {
        setLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Fetch analytics events for likes
        const { data: likeEvents, error: eventsError } = await supabase
          .from('analytics_events')
          .select('event_data, created_at')
          .eq('user_id', user.id)
          .eq('event_type', 'dragon_feed_like')
          .order('created_at', { ascending: false });

        if (eventsError) throw eventsError;

        // Process events to get unique liked items (latest action wins)
        const likedContentMap = new Map<string, { creatorId: string; action: string; timestamp: Date }>();
        
        likeEvents?.forEach((event: any) => {
          const contentId = event.event_data?.content_id;
          const creatorId = event.event_data?.creator_id;
          const action = event.event_data?.action;
          
          if (contentId && creatorId) {
            const existing = likedContentMap.get(contentId);
            if (!existing || new Date(event.created_at) > existing.timestamp) {
              likedContentMap.set(contentId, {
                creatorId,
                action,
                timestamp: new Date(event.created_at)
              });
            }
          }
        });

        // Filter out unliked items
        const currentlyLiked = Array.from(likedContentMap.entries())
          .filter(([_, value]) => value.action === 'like')
          .map(([contentId, value]) => ({ contentId, ...value }));

        if (currentlyLiked.length === 0) {
          setLikedItems([]);
          return;
        }

        // Get unique creator IDs
        const creatorIds = [...new Set(currentlyLiked.map(item => item.creatorId))];

        // Fetch creator profiles
        const { data: creators, error: creatorsError } = await supabase
          .from('creator_profiles')
          .select('id, user_id, creator_name, portfolio_urls, profile_slug')
          .in('user_id', creatorIds);

        if (creatorsError) throw creatorsError;

        // Reconstruct media items
        const mediaItems: FeedMediaItem[] = [];
        
        for (const liked of currentlyLiked) {
          const creator = creators?.find(c => c.user_id === liked.creatorId);
          if (!creator) continue;

          // Extract URL from content_id (format: "creator-id-url")
          const urlPart = liked.contentId.replace(`${creator.id}-`, '');
          const portfolio = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
          const matchedUrl = portfolio.find((url: string) => url === urlPart);

          if (matchedUrl) {
            // Generate signed URL if needed
            let finalUrl = matchedUrl;
            if (!matchedUrl.startsWith('http')) {
              const { data: signedData } = await supabase.storage
                .from('profile-assets')
                .createSignedUrl(matchedUrl, 3600);
              
              if (signedData?.signedUrl) {
                finalUrl = signedData.signedUrl;
              }
            }

            const isVideo = /\.(mp4|webm|mov|avi)$/i.test(matchedUrl);
            mediaItems.push({
              id: liked.contentId,
              url: finalUrl,
              type: isVideo ? 'video' : 'image',
              creatorName: creator.creator_name || 'Creator',
              creatorSlug: creator.profile_slug || '',
              creatorId: creator.user_id || creator.id,
              submittedAt: liked.timestamp
            });
          }
        }

        setLikedItems(mediaItems);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load liked content');
      } finally {
        setLoading(false);
      }
    };

    fetchLikedContent();
  }, []);

  return { likedItems, loading, error };
};
