import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface BrandRouteProps {
  children: React.ReactNode;
}

export const BrandRoute = ({ children }: BrandRouteProps) => {
  const { user, loading: authLoading } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['brand_profile_check', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('business_profiles')
        .select('account_type')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (profile?.account_type !== 'brand') {
    // Redirect to correct dashboard based on account type
    if (profile?.account_type === 'restaurant') {
      return <Navigate to="/dashboard/business" replace />;
    }
    // If no profile found, redirect to onboarding
    return <Navigate to="/profile/onboarding" replace />;
  }

  return <>{children}</>;
};
