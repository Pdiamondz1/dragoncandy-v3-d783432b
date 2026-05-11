export type CampaignPhase = 'pre_hire' | 'active_delivery' | 'completed' | 'cancelled';

export type ProjectStep = 'hired' | 'submitted' | 'review' | 'payment' | 'review_left';

export const PROJECT_STEPS: { key: ProjectStep; label: string }[] = [
  { key: 'hired', label: 'Creator hired & escrow held' },
  { key: 'submitted', label: 'Content submitted by creator' },
  { key: 'review', label: 'Review & approve content' },
  { key: 'payment', label: 'Release payment' },
  { key: 'review_left', label: 'Leave review' },
];

export function deriveCampaignPhase(
  campaignStatus: string,
  collaboration?: { status: string } | null
): CampaignPhase {
  if (campaignStatus === 'cancelled') return 'cancelled';
  if (!collaboration) return 'pre_hire';
  if (collaboration.status === 'completed') return 'completed';
  if (collaboration.status === 'active') return 'active_delivery';
  return 'pre_hire';
}

export function deriveCurrentStep(collaboration: {
  status: string;
  content_status?: string | null;
  business_completion_status?: string | null;
  creator_completion_status?: string | null;
}): ProjectStep {
  if (collaboration.status === 'completed') return 'review_left';
  if (
    collaboration.business_completion_status === 'requested' ||
    collaboration.creator_completion_status === 'requested'
  ) return 'payment';
  if (collaboration.content_status === 'submitted') return 'review';
  if (collaboration.content_status === 'approved') return 'payment';
  return collaboration.content_status ? 'review' : 'hired';
}

export function getStepIndex(step: ProjectStep): number {
  return PROJECT_STEPS.findIndex(s => s.key === step);
}

export function needsBusinessAction(step: ProjectStep): boolean {
  return step === 'review' || step === 'payment' || step === 'review_left';
}
