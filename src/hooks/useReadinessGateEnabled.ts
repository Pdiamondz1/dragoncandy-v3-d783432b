import { useFeatureFlag } from '@/hooks/useFeatureFlag';
export function useReadinessGateEnabled(): boolean {
  return useFeatureFlag('READINESS_GATE_ENABLED');
}
