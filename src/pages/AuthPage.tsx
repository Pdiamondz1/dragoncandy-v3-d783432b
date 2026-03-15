
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthHeader } from "@/components/auth/AuthHeader";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { toast } from 'sonner';
import dragonCandyLogo from '@/assets/dragon-candy-logo.png';

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
      checkProfileCompletion();
    }
  }, [isAuthenticated]);

  const checkProfileCompletion = async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email_verified')
        .eq('id', user.id)
        .single();

      // Check email verification first
      if (profile && profile.email_verified !== true) {
        await supabase.auth.signOut();
        setError('Please verify your email before continuing. Check your inbox for the verification link.');
        return;
      }

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
    } catch (error: unknown) {
      console.error('Error checking profile completion:', error);
      navigate('/', { replace: true });
    }
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    setError(null);
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-dc-gray px-4 py-8">
      {/* Top nav — logo + hamburger placeholder */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/">
          <img src={dragonCandyLogo} alt="DragonCandy" className="h-8" />
        </Link>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-extrabold text-white uppercase text-center mb-6 tracking-wide">
        Welcome to Dragon Candy
      </h1>

      {/* Card */}
      <div className="w-full max-w-md mx-auto">
        <AuthHeader />

        <AuthForm mode={mode} onError={setError} />

        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-3">
            {error}
          </div>
        )}

        {mode === "login" && (
          <div className="mt-4 text-sm text-center">
            <Link to="/auth/forgot" className="text-white underline underline-offset-2">
              Forgot your password?
            </Link>
          </div>
        )}

        <AuthModeToggle mode={mode} onModeChange={handleModeChange} loading={false} />
      </div>
    </div>
  );
};

export default AuthPage;
