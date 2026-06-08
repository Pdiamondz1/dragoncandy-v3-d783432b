import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Reads public.feature_flags by name. Fail-safe: returns false (off) on any error
 *  or missing row, so an unreadable flag never blocks anyone. v1 honors is_enabled
 *  only; rollout_percentage/target_roles/environment exist for ops use later. */
export function useFeatureFlag(name: string): boolean {
  const { data } = useQuery({
    queryKey: ['feature-flag', name],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('is_enabled')
        .eq('name', name)
        .maybeSingle();
      if (error) return false;
      return !!data?.is_enabled;
    },
    staleTime: 5 * 60_000,
  });
  return data ?? false;
}
