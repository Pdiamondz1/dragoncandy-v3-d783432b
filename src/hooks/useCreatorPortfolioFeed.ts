import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
}

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
          throw fetchError;
        }

        if (!creators || creators.length === 0) {
          setPortfolioMedia([]);
          return;
        }

        // Process portfolio URLs and create media items
        const mediaItems: PortfolioMedia[] = [];
        
        for (const creator of creators) {
          if (creator.portfolio_urls && Array.isArray(creator.portfolio_urls)) {
            for (const url of creator.portfolio_urls) {
              if (url && typeof url === 'string') {
                // Check if it's a storage path or external URL
                let finalUrl = url;
                
                if (url.startsWith('creator-portfolios/')) {
                  // Convert storage path to signed URL
                  const { data: signedUrl } = await supabase.storage
                    .from('creator-portfolios')
                    .createSignedUrl(url.replace('creator-portfolios/', ''), 3600);
                  
                  if (signedUrl?.signedUrl) {
                    finalUrl = signedUrl.signedUrl;
                  }
                }

                // Determine media type based on URL
                const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
                
                mediaItems.push({
                  id: `${creator.id}-${url}`,
                  url: finalUrl,
                  type: isVideo ? 'video' : 'image',
                  creatorName: creator.creator_name || 'Creator'
                });
              }
            }
          }
        }

        // Shuffle the media items for randomization
        const shuffled = mediaItems.sort(() => Math.random() - 0.5);
        setPortfolioMedia(shuffled);
        
      } catch (err) {
        console.error('Error fetching portfolio media:', err);
        setError(err instanceof Error ? err.message : 'Failed to load portfolio media');
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolioMedia();
  }, []);

  return { portfolioMedia, loading, error };
};