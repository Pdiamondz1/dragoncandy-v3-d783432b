import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  
  console.log('🧠 Smart Feed Logic:', {
    originalItems: mediaItems.length,
    duplicationFactor,
    distributedItems: distributedItems.length,
    finalFeedLength: limitedFeed.length
  });

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
        console.log('🎥 DragonFeed: Starting portfolio media fetch...');
        
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

        console.log('📊 DragonFeed: Found creators:', creators?.length || 0, creators);

        if (!creators || creators.length === 0) {
          console.log('⚠️ DragonFeed: No eligible creators found');
          setPortfolioMedia([]);
          return;
        }

        // Process portfolio URLs and create media items
        const mediaItems: PortfolioMedia[] = [];
        
        for (const creator of creators) {
          console.log('👤 DragonFeed: Processing creator:', creator.creator_name, creator.portfolio_urls);
          
          if (creator.portfolio_urls && Array.isArray(creator.portfolio_urls)) {
            for (const url of creator.portfolio_urls) {
              if (url && typeof url === 'string') {
                console.log('🔗 DragonFeed: Processing URL:', url);
                
                // Check if it's a storage path or external URL
                let finalUrl = url;
                
                if (!url.startsWith('http')) {
                  console.log('🗄️ DragonFeed: Creating signed URL for:', url);
                  
                  // Convert storage path to signed URL using profile-assets bucket
                  const { data: signedUrl, error: urlError } = await supabase.storage
                    .from('profile-assets')
                    .createSignedUrl(url, 3600);
                  
                  if (urlError) {
                    console.error('❌ DragonFeed: Signed URL error for', url, ':', urlError);
                    continue; // Skip this URL if signing fails
                  }
                  
                  if (signedUrl?.signedUrl) {
                    finalUrl = signedUrl.signedUrl;
                    console.log('✅ DragonFeed: Generated signed URL:', finalUrl);
                  } else {
                    console.error('❌ DragonFeed: No signed URL returned for:', url);
                    continue; // Skip this URL if no signed URL
                  }
                } else {
                  console.log('🌐 DragonFeed: Using external URL:', url);
                }

                // Determine media type based on URL
                const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
                
                // Validate URL before adding to feed
                try {
                  const response = await fetch(finalUrl, { method: 'HEAD' });
                  const contentLength = response.headers.get('content-length');
                  
                  if (!response.ok || (contentLength && parseInt(contentLength) === 0)) {
                    console.warn('⚠️ DragonFeed: Skipping empty/corrupted file:', finalUrl);
                    continue; // Skip empty/corrupted files
                  }
                } catch (fetchError) {
                  console.warn('⚠️ DragonFeed: Failed to validate file, skipping:', finalUrl, fetchError);
                  continue; // Skip files that can't be validated
                }
                
                const mediaItem: PortfolioMedia = {
                  id: `${creator.id}-${url}`,
                  url: finalUrl,
                  type: isVideo ? 'video' : 'image',
                  creatorName: creator.creator_name || 'Creator'
                };
                
                console.log('📸 DragonFeed: Adding validated media item:', mediaItem);
                mediaItems.push(mediaItem);
              }
            }
          }
        }

        console.log('🎬 DragonFeed: Total media items before processing:', mediaItems.length);

        // Smart content distribution algorithm
        const processedMedia = createSmartFeed(mediaItems);
        setPortfolioMedia(processedMedia);
        
        console.log('🎯 DragonFeed: Final portfolio media set:', processedMedia.length, 'items');
        
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