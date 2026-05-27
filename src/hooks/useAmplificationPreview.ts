import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface ConnectedPlatform {
  platform: string;
  ownerName: string;
  ownerType: 'creator' | 'business';
}

export function useAmplificationPreview(creatorId?: string, orgId?: string) {
  return useQuery({
    queryKey: ['amplification-preview', creatorId, orgId],
    queryFn: async (): Promise<ConnectedPlatform[]> => {
      const platforms: ConnectedPlatform[] = [];

      if (creatorId) {
        const { data: creatorAccounts } = await supabase
          .from('business_outstand_accounts')
          .select('platform, platform_handle')
          .eq('user_id', creatorId)
          .eq('status', 'active');

        if (creatorAccounts) {
          for (const acct of creatorAccounts) {
            platforms.push({
              platform: acct.platform,
              ownerName: acct.platform_handle ?? 'Creator',
              ownerType: 'creator',
            });
          }
        }
      }

      if (orgId) {
        const { data: orgAccounts } = await supabase
          .from('business_outstand_accounts')
          .select('platform, platform_handle')
          .eq('business_id', orgId)
          .eq('status', 'active');

        if (orgAccounts) {
          for (const acct of orgAccounts) {
            platforms.push({
              platform: acct.platform,
              ownerName: acct.platform_handle ?? 'Business',
              ownerType: 'business',
            });
          }
        }
      }

      return platforms;
    },
    enabled: !!(creatorId || orgId),
    staleTime: 5 * 60 * 1000,
  });
}
