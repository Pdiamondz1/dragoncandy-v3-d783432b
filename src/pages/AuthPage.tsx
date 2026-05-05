import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { RoleSelection } from "@/components/auth/RoleSelection";
import { toast } from 'sonner';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.webp';

type SignupStep = "role-selection" | "signup-form";

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [signupStep, setSignupStep] = useState<SignupStep>("role-selection");
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | "brand" | null>(null);

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
      // If returnTo is set (e.g. from Donny OAuth flow), redirect back with access token
      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        handleOAuthReturn(returnTo);
        return;
      }
      checkProfileCompletion();
    }
  }, [isAuthenticated]);

  const handleOAuthReturn = async (returnTo: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // Append access_token to the returnTo URL so the authorize endpoint can read it
      const returnUrl = new URL(returnTo);
      returnUrl.searchParams.set('access_token', session.access_token);
      window.location.href = returnUrl.toString();
    } catch (err) {
      console.error('OAuth return redirect failed:', err);
    }
  };

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

      if (profile.role === 'brand') {
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        if (!brandProfile?.is_completed) {
          navigate('/profile/brand');
          return;
        }

        // Brand users don't need campaign data migration (only business_client uses migrateCampaignData).
        // Clean up any anonymous data and route to brand dashboard.
        if (hasAnon) {
          localStorage.removeItem('anonymous_campaign_data');
          localStorage.removeItem('anonymous_campaign_final');
        }
        navigate('/dashboard/brand', { replace: true });
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
    // Reset signup step when switching modes
    setSignupStep("role-selection");
    setSelectedRole(null);
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  const handleSelectRole = (role: "business_client" | "content_creator" | "brand") => {
    setSelectedRole(role);
    setSignupStep("signup-form");
  };

  const handleChangeRole = () => {
    setSignupStep("role-selection");
    setSelectedRole(null);
  };

  const handleBackToLogin = () => {
    handleModeChange("login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A5C5C] via-[#2D7A7A] to-[#9B5A8A] flex flex-col">
      {/* Top nav — logo left, hamburger right */}
      <div className="flex items-center px-5 pt-6 pb-2">
        <Link to="/">
          <img src={dragonCandyLogo} alt="DragonCandy" className="w-[100px] md:w-[120px] lg:w-[140px] h-auto" />
        </Link>
      </div>

      {/* Render based on mode and signup step */}
      {mode === "login" && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-6">
            Welcome to DragonCandy
          </h1>

          <AuthForm mode="login" onError={setError} />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          )}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="login" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}

      {mode === "signup" && signupStep === "role-selection" && (
        <RoleSelection
          onSelectRole={handleSelectRole}
          onBackToLogin={handleBackToLogin}
        />
      )}

      {mode === "signup" && signupStep === "signup-form" && selectedRole && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <h1 className="text-xl font-bold uppercase tracking-wider text-white text-center mb-3">
            Create Account
          </h1>

          <AuthForm
            mode="signup"
            onError={setError}
            preSelectedRole={selectedRole}
            onChangeRole={handleChangeRole}
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          )}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="signup" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
