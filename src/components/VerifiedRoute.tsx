import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';

interface VerifiedRouteProps {
  children: React.ReactNode;
}

/**
 * Guards /profile/setup (onboarding). Blocks ONLY a genuinely unverified email.
 *
 * A signed-in user with no `profiles` row is not unverified — they are
 * un-provisioned, and onboarding is exactly where they need to be, so they are
 * let through (OnboardingWizard creates the row). Collapsing the two states into
 * `profile?.email_verified !== true` bounced such a user off the one page that
 * could fix them, in a loop, under a "verify your email" notice they could never
 * act on — they had verified months earlier.
 *
 * Internal-only AIOS accounts (`account_scope='internal'`, which handle_new_user
 * deliberately gives no consumer profile) belong at /internal, not in this flow.
 */
export const VerifiedRoute: React.FC<VerifiedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, profile, user } = useAuth();

  const settled = !loading && isAuthenticated;
  const isInternalOnly =
    settled && !profile && user?.user_metadata?.account_scope === 'internal';
  // Resolve on whether the app-level flag is KNOWN, not on whether a profile
  // object exists: AuthContext fabricates a profile from user metadata when the
  // row is missing (createProfileFromMetadata), and that object carries no
  // email_verified — so a `profile ? … : …` test would read the fabricated
  // undefined as "unverified" and re-create the very loop this fixes. `??`
  // falls back to auth truth only when the flag is absent, so a real stored
  // `false` still blocks.
  const emailNotVerified =
    settled && (profile?.email_verified ?? !!user?.email_confirmed_at) !== true;

  useEffect(() => {
    if (emailNotVerified) {
      toast.error('Please verify your email to continue. You can resend the verification email from the login page.');
    }
  }, [emailNotVerified]);

  useEffect(() => {
    if (isInternalOnly) {
      toast.message('This is a DragonCandy team account — taking you to the internal dashboard.');
    }
  }, [isInternalOnly]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-32 w-32 border-pink-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (isInternalOnly) {
    return <Navigate to="/internal" replace />;
  }

  if (emailNotVerified) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  return <>{children}</>;
};
