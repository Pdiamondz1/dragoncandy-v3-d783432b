
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { toast } from 'sonner';

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { user, isAuthenticated, migrateCampaignData } = useAuth();

  // Update mode when URL params change
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'login' || urlMode === 'signup') {
      setMode(urlMode);
    }
  }, [searchParams]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      console.log('User is authenticated, checking profile completion');
      checkProfileCompletion();
    }
  }, [isAuthenticated]);

  const checkProfileCompletion = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const hasAnon = !!localStorage.getItem('anonymous_campaign_data') || !!localStorage.getItem('anonymous_campaign_final');

      if (!profile) {
        navigate('/profile/onboarding');
        return;
      }

      if (profile.role === 'business_client') {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!businessProfile?.is_completed) {
          navigate('/profile/business');
          return;
        }

        if (hasAnon) {
          await migrateCampaignData();
          navigate('/dashboard/business/campaigns', { replace: true });
          return;
        }

        navigate('/', { replace: true });
        return;
      }

      if (profile.role === 'content_creator') {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!creatorProfile?.is_completed) {
          navigate('/profile/creator');
          return;
        }

        if (hasAnon) {
          localStorage.removeItem('anonymous_campaign_data');
          localStorage.removeItem('anonymous_campaign_final');
          toast.message('Campaign creation is for business clients. You can browse paid campaigns.');
        }
        navigate('/dashboard/creator/campaigns', { replace: true });
        return;
      }

      // Fallback
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error checking profile completion:', error);
      navigate('/', { replace: true });
    }
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    setError(null);
    // Update URL to reflect the mode change
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50 py-8 px-2">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl px-8 pt-8 pb-10 border border-pink-200">
        <AuthHeader />

        <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center text-pink-700">
          {mode === "signup" ? "Sign Up for DragonCandy" : "Log In"}
        </h2>

        <AuthForm mode={mode} onError={setError} />

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded mt-2">
            {error}
          </div>
        )}

        {mode === "login" && (
          <div className="mt-4 text-sm text-center">
            <Link to="/auth/forgot" className="underline">Forgot your password?</Link>
          </div>
        )}

        <AuthModeToggle mode={mode} onModeChange={handleModeChange} loading={false} />
      </div>
    </div>
  );
};

export default AuthPage;
