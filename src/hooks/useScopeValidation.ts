import { useMemo } from 'react';
import type { DeliveryTier } from '@/types/campaignMedia';
import { computeScopeValidation } from '@/lib/scopeValidation';
export type { ScopeValidationResult } from '@/lib/scopeValidation';

interface DeliverableInput {
  content_type: string;
  max_duration_seconds?: number;
}

export function useScopeValidation(
  deliverables: DeliverableInput[],
  deliveryTier: DeliveryTier,
  contentSource?: string,
) {
  return useMemo(
    () => computeScopeValidation(deliverables, deliveryTier, contentSource),
    [deliverables, deliveryTier, contentSource],
  );
}
