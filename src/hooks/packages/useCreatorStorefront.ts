import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface StorefrontMeta {
  slug: string | null;
  isPublic: boolean;
}

/**
 * The creator's public storefront identity, used to build their shareable package link and to warn them when
 * their profile isn't public yet (a published package of a private creator is invisible — the RLS gate that
 * public_creator_packages enforces). Mirrors how PublicCreatorProfile resolves the slug: prefer profile_slug,
 * fall back to user_id.
 */
export const useCreatorStorefront = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['creator-storefront-meta', user?.id],
    queryFn: async (): Promise<StorefrontMeta> => {
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('profile_slug, user_id, profile_visibility')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        slug: (data?.profile_slug as string | null) ?? (data?.user_id as string | null) ?? null,
        isPublic: (data?.profile_visibility as string | null) === 'public',
      };
    },
    enabled: !!user,
  });

  return { slug: data?.slug ?? null, isPublic: data?.isPublic ?? false, isLoading };
};
