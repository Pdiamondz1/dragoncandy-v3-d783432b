import { useAuth } from '@/hooks/useAuth';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useLocationReadiness = (accountType: string = 'restaurant') => {
  const { user, activeOrgUnit } = useAuth();

  const { data: socialAccounts = [] } = useLocationSocialAccounts(
    user?.id,
    activeOrgUnit?.id ?? null
  );

  const needsFallback = !!user && !!activeOrgUnit && !activeOrgUnit.stripe_account_id;

  const { data: fallbackProfile } = useQuery({
    queryKey: ['bp-stripe-fallback', user?.id, accountType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('user_id', user!.id)
        .eq('account_type', accountType)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: needsFallback,
  });

  const hasSocial = socialAccounts.length > 0;
  const hasStripe =
    (!!activeOrgUnit?.stripe_account_id && !!activeOrgUnit?.stripe_onboarding_complete) ||
    (needsFallback && !!fallbackProfile?.stripe_account_id && !!fallbackProfile?.stripe_onboarding_complete);

  return {
    isReady: hasSocial && hasStripe,
    missingSocial: !hasSocial,
    missingStripe: !hasStripe,
    locationName: activeOrgUnit?.name ?? null,
    hasActiveLocation: !!activeOrgUnit,
  };
};
