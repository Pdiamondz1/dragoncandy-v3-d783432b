
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { toast } from 'sonner';
import dragonCandyLogo from "@/assets/dragon-candy-logo.png";

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
        .select('role, email_verified')
        .eq('id', user.id)
        .single();

      // Check email verification first
      if (profile && profile.email_verified !== true) {
        console.log('Email not verified, signing out');
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
    <div className="min-h-screen bg-[#A8A8A0] flex flex-col max-w-md mx-auto">
      {/* Top nav */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <img src={dragonCandyLogo} alt="DragonCandy" className="h-14" />
        <button className="p-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <h1 className="text-2xl font-bold uppercase text-white tracking-wide mb-8 text-center">
          Welcome to Dragon Candy
        </h1>

        <div className="w-full space-y-4 mb-4">
          <AuthForm mode={mode} onError={setError} />
        </div>

        {error && (
          <div className="text-sm text-red-100 bg-red-500/30 px-4 py-2 rounded-full mt-2 text-center">
            {error}
          </div>
        )}

        {mode === "login" && (
          <div className="mt-4 text-sm text-center">
            <Link to="/auth/forgot" className="text-white underline">Forgot your password?</Link>
          </div>
        )}

        {/* Mode toggle text */}
        <p className="text-white text-sm font-bold tracking-widest uppercase mt-6 mb-3">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}
        </p>

        {/* Toggle button */}
        <button
          onClick={() => handleModeChange(mode === "login" ? "signup" : "login")}
          className="w-full rounded-full bg-teal-400 text-white font-bold py-3 text-base hover:bg-teal-500 transition-colors"
        >
          {mode === "login" ? "Sign Up" : "Login"}
        </button>

        {/* Social icons */}
        <div className="flex gap-6 mt-8">
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-6 h-6"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          </div>
          <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-black" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#1877F2] flex items-center justify-center shadow cursor-pointer">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
