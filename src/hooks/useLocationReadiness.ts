import { useAuth } from '@/hooks/useAuth';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useLocationReadiness = () => {
  const { user, activeOrgUnit } = useAuth();

  const { data: socialAccounts = [] } = useLocationSocialAccounts(
    user?.id,
    activeOrgUnit?.id ?? null
  );

  const { data: orgUnit } = useQuery({
    queryKey: ['org-unit-stripe', activeOrgUnit?.id],
    queryFn: async () => {
      if (!activeOrgUnit) return null;
      const { data, error } = await supabase
        .from('org_units')
        .select('stripe_account_id, stripe_onboarding_complete')
        .eq('id', activeOrgUnit.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!activeOrgUnit,
  });

  const hasSocial = socialAccounts.length > 0;
  const hasStripe =
    !!orgUnit?.stripe_account_id && !!orgUnit?.stripe_onboarding_complete;

  return {
    isReady: hasSocial && hasStripe,
    missingSocial: !hasSocial,
    missingStripe: !hasStripe,
    locationName: activeOrgUnit?.name ?? null,
    hasActiveLocation: !!activeOrgUnit,
  };
};
