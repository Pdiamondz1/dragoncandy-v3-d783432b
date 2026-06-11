import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useInternalAccess, type InternalTier } from '@/hooks/internal/useInternalAccess';
import { Spinner } from '@/components/ui/spinner';

interface InternalRouteProps {
  /** 'stakeholder' admits admins too; 'admin' is founders-only. */
  tier?: InternalTier;
  children: React.ReactNode;
}

/**
 * Guard for /internal/* (AIOS). Renders an inline AccessDenied card on failure
 * instead of <Navigate to="/" /> — on internal.dragoncandy.io the host redirect
 * would bounce "/" straight back here and loop.
 */
export const InternalRoute = ({ tier = 'stakeholder', children }: InternalRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isStakeholder, isLoading } = useInternalAccess();

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dc-card">
        <Spinner className="h-10 w-10 border-teal-400" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const allowed = tier === 'admin' ? isAdmin : isAdmin || isStakeholder;
  if (!allowed) return <InternalAccessDenied />;

  return <>{children}</>;
};

function InternalAccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dc-card p-4">
      <div className="max-w-md w-full rounded-2xl border-2 border-teal-400 bg-dc-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold text-dc-text mb-2">Internal access only</h1>
        <p className="text-dc-text-muted mb-6">
          This area is for the DragonCandy team and its stakeholders. If you believe you
          should have access, ask a founder to grant it to your account.
        </p>
        <a
          href="https://dragoncandy.io"
          className="inline-block w-full rounded-full bg-dc-teal px-6 py-3 font-semibold text-white hover:bg-dc-teal-dark transition-colors"
        >
          Go to dragoncandy.io
        </a>
      </div>
    </div>
  );
}
