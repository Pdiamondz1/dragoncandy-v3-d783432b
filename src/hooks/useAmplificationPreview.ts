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
        const { data: creatorAccounts } = await supabase.rpc('get_creator_connected_platforms', { p_creator_id: creatorId });
        for (const acct of (creatorAccounts ?? []) as { platform: string; platform_handle: string | null }[]) {
          platforms.push({
            platform: acct.platform,
            ownerName: acct.platform_handle ?? 'Creator',
            ownerType: 'creator',
          });
        }
      }

      if (orgId) {
        const { data: orgAccounts } = await supabase.rpc('get_org_connected_platforms', { p_org_id: orgId });
        for (const acct of (orgAccounts ?? []) as { platform: string; platform_handle: string | null }[]) {
          platforms.push({
            platform: acct.platform,
            ownerName: acct.platform_handle ?? 'Business',
            ownerType: 'business',
          });
        }
      }

      return platforms;
    },
    enabled: !!(creatorId || orgId),
    staleTime: 5 * 60 * 1000,
  });
}
