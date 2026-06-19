import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransactionReadiness, type ReadinessRole } from '@/hooks/useTransactionReadiness';
import { useReadinessGateEnabled } from '@/hooks/useReadinessGateEnabled';
import { ReadinessChecklistCard } from '@/components/ReadinessChecklistCard';

interface ReadinessGateProps {
  role: ReadinessRole;
  require: { stripe?: boolean; social?: boolean };
  mode: 'hard' | 'soft';
  inline?: boolean;
  orgUnitId?: string | null;
  children: ReactNode;
  softHint?: ReactNode;
}

export function ReadinessGate({ role, require, mode, orgUnitId = null, children, softHint }: ReadinessGateProps) {
  const enabled = useReadinessGateEnabled();
  const navigate = useNavigate();
  const r = useTransactionReadiness(role, {
    requireStripe: require.stripe ?? false,
    requireSocial: require.social ?? false,
    orgUnitId,
    enabled,
  });

  if (!enabled) return <>{children}</>;

  const goToSetup = () => navigate(`/dashboard/${role === 'creator' ? 'creator' : 'business'}/settings?section=payments`);

  if (mode === 'soft') {
    return <>{children}{r.shouldBlock && (softHint ?? null)}</>;
  }

  if (r.shouldBlock && (r.status === 'no_account' || r.status === 'verification_pending' || r.status === 'reconnect_needed')) {
    return <ReadinessChecklistCard status={r.status} role={role} onFinishSetup={goToSetup} />;
  }
  return <>{children}</>;
}
