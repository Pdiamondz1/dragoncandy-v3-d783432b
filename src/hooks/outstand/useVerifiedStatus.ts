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

      const { data: accounts, error } = await supabase
        .from('business_outstand_accounts')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error || !accounts || accounts.length === 0) {
        return { isVerified: false, connectedCount: 0 };
      }

      return {
        isVerified: true,
        connectedCount: accounts.length,
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
