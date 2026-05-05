import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface VerifiedRouteProps {
  children: React.ReactNode;
}

export const VerifiedRoute: React.FC<VerifiedRouteProps> = ({ children }) => {
  const { isAuthenticated, loading, profile } = useAuth();
  const emailNotVerified = !loading && isAuthenticated && profile?.email_verified !== true;

  useEffect(() => {
    if (emailNotVerified) {
      toast.error('Please verify your email to continue. Check your inbox for the verification link.');
    }
  }, [emailNotVerified]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (emailNotVerified) {
    return <Navigate to="/auth?mode=login" replace />;
  }

  return <>{children}</>;
};

