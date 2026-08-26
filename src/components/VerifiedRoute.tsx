import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { deriveEmailGate } from '@/lib/emailVerificationGate';
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

  // One derivation, shared with `ProtectedRoute` — see `lib/emailVerificationGate.ts`
  // for why the `??` fallback is deliberately weak and must not be copied as a
  // verification signal elsewhere.
  const { isInternalOnly, emailNotVerified } = deriveEmailGate({ loading, isAuthenticated, profile, user });

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
