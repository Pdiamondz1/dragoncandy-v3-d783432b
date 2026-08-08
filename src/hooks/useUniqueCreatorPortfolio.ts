import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sortByUploadedAt } from '@/lib/feedOrdering';

export interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  /**
   * Server-assigned upload time (`storage.objects.created_at`), ISO. Undefined when the path has
   * no matching storage object. NOT parsed from the `${kind}-${Date.now()}` millis in the
   * filename — that value is client-supplied and forgeable into a permanent top-of-feed slot.
   */
  uploadedAt?: string;
  creatorName: string;
  creatorSlug: string;
  creatorId: string;
  // Location bundle (for the zip-radius filter) + avatar (for the IG header / lightbox):
  avatarUrl?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  location?: string;
  // Creator-card fields (for the Instagram-style creator search list):
  skills?: string[];
  averageRating?: number | null;
  totalReviews?: number | null;
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

/**
 * basename → created_at for one creator's storage folder.
 *
 * Portfolio paths are `${userId}/${kind}-${millis}.${ext}` (uploadProfileAsset.ts), i.e. one flat
 * folder per user, so a single list() covers all of that creator's media. `profile_assets_select`
 * grants SELECT on the whole bucket to `public`, so a business user can list a creator's folder.
 * Failure is non-fatal: items just lose their date and sort to the end.
 */
const listUploadTimes = async (userId: string): Promise<Map<string, string>> => {
  const times = new Map<string, string>();
  if (!userId) return times;
  const { data, error } = await supabase.storage
    .from('profile-assets')
    .list(userId, { limit: 100 });
  if (error || !data) {
    if (import.meta.env.DEV) console.warn('UniquePortfolio: could not list', userId, error);
    return times;
  }
  for (const obj of data) {
    if (obj.name && obj.created_at) times.set(obj.name, obj.created_at);
  }
  return times;
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
          .select('id, user_id, creator_name, avatar_url, portfolio_urls, profile_slug, city, postal_code, country, location, skills, average_rating, total_reviews')
          .eq('is_completed', true)
          .eq('allow_portfolio_in_feed', true)
          // Re-assert the visibility rule the RLS policy already enforces for this client query.
          // Project rule: never rely on RLS alone — a future service-role path would bypass it.
          .eq('profile_visibility', 'public')
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
          // Resolve the avatar ONCE per creator (one shared promise → a single signed-URL
          // call), then reuse it across all of that creator's media items.
          const avatarUrlPromise: Promise<string | undefined> = rawAvatar
            ? rawAvatar.startsWith('http')
              ? Promise.resolve(rawAvatar)
              : getSignedUrl(rawAvatar).then((u) => u ?? undefined)
            : Promise.resolve(undefined);
          // Same one-shared-promise-per-creator shape as the avatar: one list() call covers all of
          // this creator's items, instead of one per item.
          const uploadTimesPromise = listUploadTimes(creator.user_id || '');
          return urls
            .filter((url: unknown) => typeof url === 'string' && url.length > 0)
            .map(async (url: string) => {
              const isExternal = url.startsWith('http');
              const finalUrl = isExternal ? url : await getSignedUrl(url);
              if (!finalUrl) return null;
              const avatarUrl = await avatarUrlPromise;
              const isVideo = /\.(mp4|webm|mov|avi)$/i.test(url);
              // An external (http) portfolio entry has no storage object, so it has no date.
              const uploadedAt = isExternal
                ? undefined
                : (await uploadTimesPromise).get(url.split('/').pop() ?? '');
              return {
                id: `${creator.id}-${url}`,
                url: finalUrl,
                type: isVideo ? 'video' : 'image',
                uploadedAt,
                creatorName: creator.creator_name || 'Creator',
                creatorSlug: creator.profile_slug || '',
                creatorId: creator.user_id || creator.id,
                avatarUrl,
                city: creator.city ?? undefined,
                postalCode: creator.postal_code ?? undefined,
                country: creator.country ?? undefined,
                location: creator.location ?? undefined,
                skills: Array.isArray(creator.skills) ? (creator.skills as string[]) : undefined,
                averageRating: creator.average_rating ?? null,
                totalReviews: creator.total_reviews ?? null,
              } as PortfolioMedia;
            });
        });

        const settled = await Promise.allSettled(mediaPromises);
        const mediaItems: PortfolioMedia[] = settled
          .filter((r): r is PromiseFulfilledResult<PortfolioMedia | null> => r.status === 'fulfilled')
          .map(r => r.value)
          .filter((v): v is PortfolioMedia => !!v);

        // Newest first. This replaced `sort(() => Math.random() - 0.5)`, which reordered the feed
        // on every mount — so the same content looked different each visit and nothing could be
        // "new" relative to anything.
        setPortfolioMedia(sortByUploadedAt(mediaItems));

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