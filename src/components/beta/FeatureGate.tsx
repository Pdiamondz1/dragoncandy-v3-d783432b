
import React from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback = null,
  loading = null
}) => {
  const { isFeatureEnabled, loading: flagsLoading } = useFeatureFlags();

  if (flagsLoading && loading) {
    return <>{loading}</>;
  }

  if (isFeatureEnabled(feature)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
