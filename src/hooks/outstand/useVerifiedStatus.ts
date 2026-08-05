import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface VerifiedStatus {
  isVerified: boolean;
  connectedCount: number;
  isLoading: boolean;
}

export function useVerifiedStatus(userId: string | undefined): VerifiedStatus {
  const { data, isLoading } = useQuery({
    queryKey: ['verified-status', userId],
    queryFn: async () => {
      if (!userId) return { isVerified: false, connectedCount: 0 };

      // Reads ANOTHER user's connection state, so it cannot query the table
      // directly — `business_outstand_accounts` is own-row under RLS. It used to
      // work only because of a blanket `USING (true)` SELECT policy, which was
      // removed from prod (leaking every tenant's account ids and metrics) but
      // never removed from migration history. With the policy gone this query
      // matched nothing and the badge silently vanished from every profile.
      //
      // get_public_social_proof is the narrow replacement: gated on the TARGET
      // having published a public profile, and returning only a count and
      // per-platform follower totals.
      const { data: rows, error } = await supabase.rpc('get_public_social_proof', {
        p_user_id: userId,
      });

      if (error || !rows || rows.length === 0) {
        return { isVerified: false, connectedCount: 0 };
      }

      const connectedCount = Number(
        (rows as Array<{ connected_count: number | null }>)[0]?.connected_count ?? 0,
      );
      return {
        isVerified: connectedCount > 0,
        connectedCount,
      };
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isVerified: data?.isVerified ?? false,
    connectedCount: data?.connectedCount ?? 0,
    isLoading,
  };
}
