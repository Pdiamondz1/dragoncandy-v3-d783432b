import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';

interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
}


// Smart content distribution algorithm
const createSmartFeed = (mediaItems: PortfolioMedia[]): PortfolioMedia[] => {
  if (mediaItems.length === 0) return [];

  const MAX_FEED_LENGTH = 25; // Maximum total items in feed
  const MIN_DUPLICATION = 2; // Minimum times each item appears
  const MAX_DUPLICATION = 4; // Maximum times each item appears

  // Calculate optimal duplication based on content availability
  let duplicationFactor = MIN_DUPLICATION;
  
  if (mediaItems.length <= 3) {
    duplicationFactor = MAX_DUPLICATION; // More duplication for very few items
  } else if (mediaItems.length <= 8) {
    duplicationFactor = 3; // Moderate duplication for small collections
  } else {
    duplicationFactor = MIN_DUPLICATION; // Minimal duplication for large collections
  }

  // Create distributed content with smart shuffling
  const distributedItems: PortfolioMedia[] = [];
  
  // Create duplication sets with different IDs to prevent React key conflicts
  for (let round = 0; round < duplicationFactor; round++) {
    const shuffledItems = [...mediaItems].sort(() => Math.random() - 0.5);
    
    shuffledItems.forEach((item, index) => {
      distributedItems.push({
        ...item,
        id: `${item.id}-round${round}-${index}` // Unique ID for each duplicate
      });
    });
  }

  // Final shuffle to distribute duplicates evenly
  const finalShuffled = distributedItems.sort(() => Math.random() - 0.5);
  
  // Limit total feed length
  const limitedFeed = finalShuffled.slice(0, MAX_FEED_LENGTH);
  

  return limitedFeed;
};

export const useCreatorPortfolioFeed = () => {
  const [portfolioMedia, setPortfolioMedia] = useState<PortfolioMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortfolioMedia = async () => {
      try {
        setLoading(true);
        // Fetch creator profiles with portfolio URLs who allow DragonFeed display
        const { data: creators, error: fetchError } = await supabase
          .from('creator_profiles')
          .select('id, creator_name, portfolio_urls')
          .eq('is_completed', true)
          .eq('allow_portfolio_in_feed', true)
          .not('portfolio_urls', 'is', null)
          .limit(50);

        if (fetchError) {
          console.error('❌ DragonFeed: Database fetch error:', fetchError);
          throw fetchError;
        }

        if (!creators || creators.length === 0) {
          setPortfolioMedia([]);
          return;
        }

        // Process portfolio URLs and create media items in parallel
        const mediaPromises = creators.flatMap((creator) => {
          const urls = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
          return urls
            .filter((url: unknown) => typeof url === 'string' && url.length > 0)
            .map(async (url: string) => {
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : `${SUPABASE_URL}/storage/v1/object/public/profile-assets/${url}`;
              const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
              return {
                id: `${creator.id}-${url}`,
                url: finalUrl,
                type: isVideo ? 'video' : 'image',
                creatorName: creator.creator_name || 'Creator',
              } as PortfolioMedia;
            });
        });

        const settled = await Promise.allSettled(mediaPromises);
        const mediaItems: PortfolioMedia[] = settled
          .filter((r): r is PromiseFulfilledResult<PortfolioMedia | null> => r.status === 'fulfilled')
          .map(r => r.value)
          .filter((v): v is PortfolioMedia => !!v);

        // Smart content distribution algorithm
        const processedMedia = createSmartFeed(mediaItems);
        // Progressive load: show a small subset immediately, then full feed next tick
        const initialCount = Math.min(8, processedMedia.length);
        setPortfolioMedia(processedMedia.slice(0, initialCount));
        if (processedMedia.length > initialCount) {
          setTimeout(() => setPortfolioMedia(processedMedia), 0);
        }
        
      } catch (err) {
        console.error('💥 DragonFeed: Critical error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load portfolio media');
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolioMedia();
  }, []);

  return { portfolioMedia, loading, error };
};