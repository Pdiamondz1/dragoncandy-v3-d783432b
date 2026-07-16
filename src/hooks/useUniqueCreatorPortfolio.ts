import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
  // Location bundle (for the zip-radius filter) + avatar (for the IG header / lightbox):
  avatarUrl?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  location?: string;
}

// Simple signed URL cache (1 hour TTL)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

const getSignedUrl = async (path: string): Promise<string | null> => {
  const cached = signedUrlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.url;
  const { data, error } = await supabase.storage
    .from('profile-assets')
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    if (import.meta.env.DEV) console.error('❌ UniquePortfolio: Signed URL error for', path, error);
    return null;
  }
  const url = data.signedUrl;
  // Refresh a bit earlier than expiry to avoid edge cases
  signedUrlCache.set(path, { url, expiresAt: now + 55 * 60 * 1000 });
  return url;
};

export const useUniqueCreatorPortfolio = () => {
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
          .select('id, user_id, creator_name, avatar_url, portfolio_urls, profile_slug, city, postal_code, country, location')
          .eq('is_completed', true)
          .eq('allow_portfolio_in_feed', true)
          .not('portfolio_urls', 'is', null)
          .limit(50);

        if (fetchError) {
          console.error('❌ UniquePortfolio: Database fetch error:', fetchError);
          throw fetchError;
        }

        if (!creators || creators.length === 0) {
          setPortfolioMedia([]);
          return;
        }

        // Process portfolio URLs and create media items in parallel
        const mediaPromises = creators.flatMap((creator) => {
          const urls = Array.isArray(creator.portfolio_urls) ? creator.portfolio_urls : [];
          const rawAvatar = typeof creator.avatar_url === 'string' ? creator.avatar_url : '';
          return urls
            .filter((url: unknown) => typeof url === 'string' && url.length > 0)
            .map(async (url: string) => {
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : await getSignedUrl(url);
              if (!finalUrl) return null;
              // Avatar: external http URL used directly; storage key signed (cached).
              const avatarUrl = rawAvatar
                ? rawAvatar.startsWith('http')
                  ? rawAvatar
                  : (await getSignedUrl(rawAvatar)) ?? undefined
                : undefined;
              const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
              return {
                id: `${creator.id}-${url}`,
                url: finalUrl,
                type: isVideo ? 'video' : 'image',
                creatorName: creator.creator_name || 'Creator',
                creatorSlug: creator.profile_slug || '',
                creatorId: creator.user_id || creator.id,
                avatarUrl,
                city: creator.city ?? undefined,
                postalCode: creator.postal_code ?? undefined,
                country: creator.country ?? undefined,
                location: creator.location ?? undefined,
              } as PortfolioMedia;
            });
        });

        const settled = await Promise.allSettled(mediaPromises);
        const mediaItems: PortfolioMedia[] = settled
          .filter((r): r is PromiseFulfilledResult<PortfolioMedia | null> => r.status === 'fulfilled')
          .map(r => r.value)
          .filter((v): v is PortfolioMedia => !!v);

        // Return unique items only - no duplication for grid view
        const uniqueMedia = mediaItems.sort(() => Math.random() - 0.5); // Simple shuffle for variety
        setPortfolioMedia(uniqueMedia);
        
        
      } catch (err) {
        console.error('💥 UniquePortfolio: Critical error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load portfolio media');
      } finally {
        setLoading(false);
      }
    };

    fetchPortfolioMedia();
  }, []);

  return { portfolioMedia, loading, error };
};