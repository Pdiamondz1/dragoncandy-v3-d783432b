export type CampaignPhase = 'pre_hire' | 'active_delivery' | 'completed' | 'cancelled';

export type ProjectStep = 'hired' | 'submitted' | 'review' | 'payment' | 'review_left';

export const PROJECT_STEPS: { key: ProjectStep; label: string }[] = [
  { key: 'hired', label: 'Creator hired & escrow held' },
  { key: 'submitted', label: 'Content submitted by creator' },
  { key: 'review', label: 'Review & approve content' },
  { key: 'payment', label: 'Release payment' },
  { key: 'review_left', label: 'Leave review' },
];

export function phaseToDisplayLabel(phase: CampaignPhase): string {
  switch (phase) {
    case 'pre_hire': return 'published';
    case 'active_delivery': return 'active';
    case 'completed': return 'completed';
    case 'cancelled': return 'cancelled';
  }
}

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
  if (collaboration.content_status === 'auto_approved') return 'payment';
  if (collaboration.content_status === 'rejected') return 'payment';
  if (collaboration.content_status === 'revision_requested') return 'submitted';
  return 'hired';
}

export function getStepIndex(step: ProjectStep): number {
  return PROJECT_STEPS.findIndex(s => s.key === step);
}

export function needsBusinessAction(step: ProjectStep): boolean {
  return step === 'review' || step === 'payment' || step === 'review_left';
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':     return 'bg-teal-50 text-teal-700';
    case 'published': return 'bg-yellow-100 text-yellow-800';
    case 'active':    return 'bg-teal-100 text-teal-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default:          return 'bg-teal-50 text-teal-700';
  }
}

export function formatBudget(campaign: {
  pricing_type?: string | null;
  fixed_price?: number | null;
  delivery_fee?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
}): string {
  const base = campaign.fixed_price || campaign.budget_max || campaign.budget_min;
  if (!base) return 'Budget TBD';
  return `$${base.toLocaleString()}`;
}
