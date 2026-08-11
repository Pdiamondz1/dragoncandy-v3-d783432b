import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      <div className="min-h-screen flex items-center justify-center bg-dc-dark">
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  // The most common way to land here is being signed in with the wrong
  // account (e.g. a consumer account on the internal host) — without this
  // button there is no way off the card on internal.dragoncandy.io.
  const switchAccount = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      queryClient.clear();
    } finally {
      navigate('/auth', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dc-dark p-4">
      <div className="max-w-md w-full rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-6 text-center backdrop-blur-md">
        <h1 className="text-xl font-bold text-white mb-2">Internal access only</h1>
        <p className="text-white/60 mb-2">
          This area is for the DragonCandy team and its stakeholders. If you believe you
          should have access, ask a founder to grant it to your account.
        </p>
        {user?.email && (
          <p className="text-xs text-white/50 mb-6">
            You are signed in as <span className="font-semibold text-white">{user.email}</span>
            {' '}— founder access may be on a different account.
          </p>
        )}
        <button
          type="button"
          onClick={switchAccount}
          disabled={signingOut}
          className="inline-block w-full rounded-full bg-dc-teal px-6 py-3 font-bold text-dc-dark hover:bg-dc-teal-dark transition-colors disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign in with a different account'}
        </button>
        <a
          href="https://dragoncandy.com"
          className="mt-3 inline-block w-full rounded-full border border-dc-teal/30 px-6 py-3 font-semibold text-dc-pink hover:bg-white/[0.06] transition-colors"
        >
          Go to dragoncandy.com
        </a>
      </div>
    </div>
  );
}
