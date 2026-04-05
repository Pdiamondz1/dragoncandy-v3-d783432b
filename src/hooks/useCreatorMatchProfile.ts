import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

export interface CreatorMatchProfile {
  skills: CreatorSkill[];
  city: string | null;
  country: string | null;
  averageRating: number | null;
  maxProjects: number | null;
  activeCollabCount: number;
}

export const useCreatorMatchProfile = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-match-profile', user?.id],
    queryFn: async (): Promise<CreatorMatchProfile | null> => {
      if (!user?.id) return null;

      const { data: profile, error: profileError } = await supabase
        .from('creator_profiles')
        .select('skills, city, country, average_rating, max_projects_per_month')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) return null;

      const { count, error: collabError } = await supabase
        .from('campaign_collaborations')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', user.id)
        .eq('status', 'active');

      if (collabError) throw collabError;

      return {
        skills: (profile.skills ?? []) as CreatorSkill[],
        city: profile.city,
        country: profile.country,
        averageRating: profile.average_rating,
        maxProjects: profile.max_projects_per_month,
        activeCollabCount: count ?? 0,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
};
