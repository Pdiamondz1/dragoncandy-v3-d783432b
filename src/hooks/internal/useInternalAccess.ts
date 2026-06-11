import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type InternalTier = 'admin' | 'stakeholder';

/**
 * Resolves the current user's internal-surface access (AIOS).
 * Reads the user's own user_roles rows (self-select RLS policy).
 * Roles compared as strings: 'stakeholder' lands in generated types at PR 2's regen.
 */
export function useInternalAccess() {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['internal_access', user?.id],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) {
        console.error('Failed to load internal access roles:', error);
        return { isAdmin: false, isStakeholder: false };
      }
      const roles = (rows ?? []).map((r) => r.role as string);
      return {
        isAdmin: roles.includes('admin'),
        isStakeholder: roles.includes('stakeholder'),
      };
    },
    enabled: !!user,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
    isStakeholder: data?.isStakeholder ?? false,
    isLoading: authLoading || (!!user && isLoading),
  };
}
