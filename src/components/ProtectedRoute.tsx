
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@/components/ui/spinner';
import { deriveEmailGate } from '@/lib/emailVerificationGate';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, profile, user } = useAuth();
  const location = useLocation();
  const { isInternalOnly, emailNotVerified } = deriveEmailGate({ loading, isAuthenticated, profile, user });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-32 w-32 border-pink-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  /**
   * EMAIL VERIFICATION IS A ROUTE GATE, not a side effect of signing the user out.
   *
   * This guard wraps 79 routes and checked only "is there a session". `VerifiedRoute`,
   * which does check verification, wraps exactly ONE. So the only thing keeping an
   * unverified account out of dashboards, campaigns and messaging was `AuthForm` calling
   * `supabase.auth.signOut()` right after signup — a UX step doing security work, which
   * meant the boundary would disappear the moment anyone stopped signing users out for a
   * better signup flow. That is precisely what the code-based verification work needs to
   * do, so the gate is established here FIRST, on its own, rather than as a rider on a
   * feature.
   *
   * Measured on production before shipping: 45 of 46 accounts are verified, and the single
   * unverified one signed up on 2026-08-11, last signed in the same SECOND, and has zero
   * verification tokens issued — `AuthPage` already refuses it today. This gate locks out
   * nobody who can currently get in.
   *
   * An internal-only account is deliberately let through: it has no consumer profile row by
   * design, so judging it on `email_verified` would bar the team from the app on a column
   * that will never be set. `VerifiedRoute` instead redirects it to `/internal`; that is
   * right for its one consumer-facing page and wrong here, where these 79 routes include
   * the surfaces internal users legitimately reach.
   */
  if (!isInternalOnly && emailNotVerified) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  return <>{children}</>;
};

