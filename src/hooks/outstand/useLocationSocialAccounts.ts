import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LocationSocialAccount {
  id: string;
  platform: string;
  platform_handle: string | null;
  org_unit_id: string | null;
  org_unit_name: string | null;
  status: string;
  outstand_social_account_id: string;
}

export function useLocationSocialAccounts(userId: string | undefined, orgUnitId?: string | null) {
  return useQuery({
    queryKey: ['location-social-accounts', userId, orgUnitId ?? 'all'],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from('business_outstand_accounts')
        .select('id, platform, platform_handle, org_unit_id, status, outstand_social_account_id, org_units(name)')
        .eq('user_id', userId)
        .eq('status', 'active');

      if (orgUnitId) {
        query = query.eq('org_unit_id', orgUnitId);
      }

      const { data, error } = await query.order('connected_at', { ascending: false });

      if (error) {
        console.error('Error fetching location social accounts:', error);
        throw error;
      }

      return (data ?? []).map((row: any) => ({
        id: row.id,
        platform: row.platform,
        platform_handle: row.platform_handle,
        org_unit_id: row.org_unit_id,
        org_unit_name: row.org_units?.name ?? null,
        status: row.status,
        outstand_social_account_id: row.outstand_social_account_id,
      })) as LocationSocialAccount[];
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUnassignedSocialAccounts(userId: string | undefined) {
  return useQuery({
    queryKey: ['unassigned-social-accounts', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('business_outstand_accounts')
        .select('id, platform, platform_handle, org_unit_id, outstand_social_account_id, org_units(name, deleted_at)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('connected_at', { ascending: false });

      if (error) {
        console.error('Error fetching unassigned social accounts:', error);
        throw error;
      }

      return (data ?? [])
        .filter((row: any) => !row.org_unit_id || row.org_units?.deleted_at != null)
        .map((row: any) => ({
          id: row.id,
          platform: row.platform,
          platform_handle: row.platform_handle,
          org_unit_id: row.org_unit_id,
          org_unit_name: row.org_units?.name ?? null,
          status: row.status,
          outstand_social_account_id: row.outstand_social_account_id,
        })) as LocationSocialAccount[];
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
