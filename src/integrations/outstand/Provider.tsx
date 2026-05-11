import React from 'react';
import { OutstandProvider } from '@outstand-so/ui';
import { useAuth } from '@/hooks/useAuth';
import { SUPABASE_URL } from '@/integrations/supabase/client';

export const OUTSTAND_PROXY_BASE_URL = `${SUPABASE_URL}/functions/v1/outstand-proxy`;

interface DragonCandyOutstandProviderProps {
  children: React.ReactNode;
}

export function useOutstandConfig() {
  const { session, activeOrgUnit } = useAuth();
  const baseUrl = activeOrgUnit?.id
    ? `${OUTSTAND_PROXY_BASE_URL}?org_unit_id=${activeOrgUnit.id}`
    : OUTSTAND_PROXY_BASE_URL;
  return {
    apiKey: session?.access_token ?? '',
    baseUrl,
  };
}

export const DragonCandyOutstandProvider: React.FC<DragonCandyOutstandProviderProps> = ({ children }) => {
  const { apiKey, baseUrl } = useOutstandConfig();

  return (
    <OutstandProvider apiKey={apiKey} baseUrl={baseUrl}>
      {children}
    </OutstandProvider>
  );
};
