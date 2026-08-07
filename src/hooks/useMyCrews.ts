import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** A crew the current creator has actively joined. */
export interface MyCrew {
  group_id: string;
  name: string;
  owner_id: string;
  joined_at: string | null;
  /** Best-effort — null when the owner's business profile isn't public. */
  business_name: string | null;
  logo_url: string | null;
}

/**
 * The creator's own crew roster.
 *
 * Works entirely under existing RLS, no RPC needed:
 *  1. `cgm_self_select` lets a creator read their own membership rows.
 *  2. `cg_member_select` (is_active_group_member) makes the crew row readable
 *     once they're active — the same batch read `useGroupCampaigns` already
 *     relies on for crew names.
 *  3. `business_profiles` is readable for public profiles.
 *
 * Step 3 is deliberately non-throwing: a business with a private profile yields
 * no row, and a missing name degrades the roster line rather than breaking it.
 * Do NOT fall back to `profiles.full_name` — no policy lets a crew member read
 * the crew owner's `profiles` row.
 */
export function useMyCrews() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['my-crews', user?.id],
    queryFn: async (): Promise<MyCrew[]> => {
      const { data: memberships, error } = await supabase
        .from('creator_group_members')
        .select('group_id, responded_at')
        .eq('creator_id', user!.id)
        .eq('status', 'active')
        .order('responded_at', { ascending: false });

      if (error) throw error;
      if (!memberships || memberships.length === 0) return [];

      const groupIds = [...new Set(memberships.map((m) => m.group_id))];

      const { data: groups, error: groupsError } = await supabase
        .from('creator_groups')
        .select('id, name, owner_id')
        .in('id', groupIds);

      if (groupsError) throw groupsError;
      if (!groups || groups.length === 0) return [];

      const ownerIds = [...new Set(groups.map((g) => g.owner_id))];
      const { data: businesses } = await supabase
        .from('business_profiles')
        .select('user_id, business_name, logo_url')
        .in('user_id', ownerIds);

      const businessMap = new Map(
        (businesses ?? []).map((b) => [b.user_id, b]),
      );
      const groupMap = new Map(groups.map((g) => [g.id, g]));

      // Driven off `memberships` so the responded_at ordering is preserved.
      return memberships.flatMap((m) => {
        const group = groupMap.get(m.group_id);
        if (!group) return [];
        const business = businessMap.get(group.owner_id);
        return [{
          group_id: group.id,
          name: group.name,
          owner_id: group.owner_id,
          joined_at: m.responded_at,
          business_name: business?.business_name ?? null,
          logo_url: business?.logo_url ?? null,
        }];
      });
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  return {
    crews: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
