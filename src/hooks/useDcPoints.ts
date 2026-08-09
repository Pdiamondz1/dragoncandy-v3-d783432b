import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { TierThresholds } from '@/lib/dragonTierGap';

export interface DcStanding {
  role: string;
  balance: number;
  tier: string;
  campaignsCompleted: number;
  avgRating: number | null;
}

export interface DcLedgerEntry {
  id: string;
  eventType: string;
  points: number;
  occurredAt: string;
}

export interface DcCatalog {
  pointValues: Record<string, number>;
  thresholds: TierThresholds;
}

const EMPTY_THRESHOLDS: TierThresholds = { creator: [], business: [] };

/** Balance, tier, and the activity metrics the tier gap needs. Caller-scoped server-side. */
export function useDcStanding() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-standing', user?.id],
    queryFn: async (): Promise<DcStanding | null> => {
      // .rpc must be called ON the client — destructuring it loses `this`.
      const { data, error } = await supabase.rpc('dre_my_standing' as never);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        role: row.role ?? '',
        balance: row.balance ?? 0,
        tier: row.tier ?? 'egg',
        campaignsCompleted: row.campaigns_completed ?? 0,
        avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
      };
    },
    enabled: !!user?.id,
  });
}

/** The caller's own award history. dragon_point_events already has own-row SELECT RLS. */
export function useDcLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-ledger', user?.id],
    queryFn: async (): Promise<DcLedgerEntry[]> => {
      const { data, error } = await supabase
        .from('dragon_point_events')
        .select('id, event_type, points_awarded, occurred_at')
        .eq('user_id', user!.id)
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        eventType: r.event_type,
        points: r.points_awarded,
        occurredAt: r.occurred_at,
      }));
    },
    enabled: !!user?.id,
  });
}

/** The live earn catalog + tier thresholds. dre_config has authenticated SELECT. */
export function useDcCatalog() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['dc-catalog'],
    queryFn: async (): Promise<DcCatalog> => {
      const { data, error } = await supabase
        .from('dre_config')
        .select('config_key, config_value')
        .in('config_key', ['point_values', 'tier_thresholds']);
      if (error) throw error;
      const byKey = Object.fromEntries((data ?? []).map((r) => [r.config_key, r.config_value]));
      return {
        pointValues: (byKey.point_values ?? {}) as Record<string, number>,
        thresholds: (byKey.tier_thresholds ?? EMPTY_THRESHOLDS) as TierThresholds,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // config changes rarely; don't refetch per navigation
  });
}
