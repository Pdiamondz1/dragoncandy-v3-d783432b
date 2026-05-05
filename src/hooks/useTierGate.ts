import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getFeature, tierMeetsRequirement, type TierName } from '@/lib/pricing/tier-features';

interface TierGateResult {
  allowed: boolean;
  reason: 'tier' | 'rate_limit' | null;
  requiredTier: string;
  currentTier: string;
  openPaywall: () => void;
}

export function useTierGate(featureKey: string): TierGateResult {
  const { activeOrg } = useAuth();
  const [_paywallOpen, setPaywallOpen] = useState(false);

  const currentTier = (activeOrg?.subscription_tier || 'free') as TierName;
  const feature = getFeature(featureKey);

  const { data: rateLimitHit } = useQuery({
    queryKey: ['tier-rate-limit', featureKey, activeOrg?.id],
    queryFn: async () => {
      if (!feature?.rateLimit || !activeOrg?.id) return false;
      if (currentTier !== 'free') return false;

      const since = new Date();
      since.setDate(since.getDate() - feature.rateLimit.periodDays);

      const { count } = await supabase
        .from('campaign_brief_generations' as any)
        .select('*', { count: 'exact', head: true })
        .eq('org_id', activeOrg.id)
        .gte('generated_at', since.toISOString());

      return (count || 0) >= feature.rateLimit.limit;
    },
    enabled: !!feature?.rateLimit && !!activeOrg?.id,
  });

  if (!feature) {
    return { allowed: true, reason: null, requiredTier: 'free', currentTier, openPaywall: () => {} };
  }

  const tierAllowed = tierMeetsRequirement(currentTier, feature.requiredTier);
  const rateLimited = rateLimitHit === true;

  return {
    allowed: tierAllowed && !rateLimited,
    reason: !tierAllowed ? 'tier' : rateLimited ? 'rate_limit' : null,
    requiredTier: feature.requiredTier,
    currentTier,
    openPaywall: () => setPaywallOpen(true),
  };
}
