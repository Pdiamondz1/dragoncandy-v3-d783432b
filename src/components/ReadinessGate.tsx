import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountReadiness } from '@/hooks/useAccountReadiness';
import { useReadinessGateEnabled } from '@/hooks/useReadinessGateEnabled';
import { ReadinessChecklistCard } from '@/components/ReadinessChecklistCard';
import type { AccountRole } from '@/lib/accountReadiness';
import type { GatedAction } from '@/lib/accountReadiness';

export type ReadinessRole = 'creator' | 'business';

interface ReadinessGateProps {
  role: ReadinessRole;
  /** What the user is trying to do. The keys it demands live in ACTION_REQUIREMENTS. */
  action: GatedAction;
  mode: 'hard' | 'soft';
  children: ReactNode;
  softHint?: ReactNode;
}

const ACCOUNT_ROLE: Record<ReadinessRole, AccountRole> = {
  creator: 'content_creator',
  business: 'business_client',
};

export function ReadinessGate({ role, action, mode, children, softHint }: ReadinessGateProps) {
  const enabled = useReadinessGateEnabled();
  const navigate = useNavigate();
  // liveStripe: the gate is the surface where being wrong costs money, so it
  // pays for the authoritative read rather than trusting the mirrored column.
  const r = useAccountReadiness(ACCOUNT_ROLE[role], { liveStripe: true, enabled });

  if (!enabled) return <>{children}</>;

  const missing = r.missingFor(action);
  const blocked = missing.length > 0;

  if (mode === 'soft') {
    return <>{children}{blocked && (softHint ?? null)}</>;
  }

  if (!blocked) return <>{children}</>;

  const first = missing[0];
  const status = first.state.status === 'pending' ? 'verification_pending' : 'no_account';
  return (
    <ReadinessChecklistCard
      status={status}
      role={role}
      onFinishSetup={() => navigate(first.resolve.route)}
    />
  );
}
