import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CreatorPackage } from '@/types/packages';

export interface PublicCreator {
  user_id: string;
  creator_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  average_rating: number | null;
  total_reviews: number | null;
}

/**
 * Public read for a shareable package link: resolve the creator by public slug (fallback user_id, public
 * profiles only), then their published package by slug via the public_creator_packages view. Both reads are
 * anon-safe — the view + creator_profiles RLS gate to published/public rows, so a private or draft listing
 * simply resolves to notFound.
 */
export const usePublicPackage = (creatorSlug?: string, packageSlug?: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ['public-package', creatorSlug, packageSlug],
    enabled: !!creatorSlug && !!packageSlug,
    queryFn: async () => {
      const cols = 'user_id, creator_name, avatar_url, bio, average_rating, total_reviews';
      let creatorRes = await supabase
        .from('creator_profiles')
        .select(cols)
        .eq('profile_slug', creatorSlug!)
        .eq('profile_visibility', 'public')
        .maybeSingle();
      if (!creatorRes.data) {
        creatorRes = await supabase
          .from('creator_profiles')
          .select(cols)
          .eq('user_id', creatorSlug!)
          .eq('profile_visibility', 'public')
          .maybeSingle();
      }
      const creator = (creatorRes.data as PublicCreator | null) ?? null;
      if (!creator) return { creator: null, pkg: null };

      const { data: pkg } = await supabase
        .from('public_creator_packages')
        .select('*')
        .eq('creator_id', creator.user_id)
        .eq('slug', packageSlug!)
        .maybeSingle();
      return { creator, pkg: (pkg as CreatorPackage | null) ?? null };
    },
  });

  return {
    creator: data?.creator ?? null,
    pkg: data?.pkg ?? null,
    isLoading,
    notFound: !isLoading && !!data && (!data.creator || !data.pkg),
  };
};
