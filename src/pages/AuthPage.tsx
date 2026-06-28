import { useCallback, useEffect, useState } from "react";
import { SEO } from "@/components/SEO";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { RoleSelection } from "@/components/auth/RoleSelection";
import { toast } from 'sonner';
import dragonCandyLogo from '@/assets/Transparent_DragonCandy_logo.webp';

type SignupStep = "role-selection" | "signup-form";

const ALLOWED_REDIRECT_ORIGINS = new Set([
  'https://dragoncandy.io',
  'https://www.dragoncandy.io',
  'https://dragoncandy-v3.lovable.app',
  'https://dragoncandy-preview.lovable.app',
]);

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  // Pre-select role from the landing "Join as a Business/Creator" CTAs (?role=).
  // Map the URL value to the profile enum; ignore on login or unknown values.
  const initialRole = ((): "business_client" | "content_creator" | "brand" | null => {
    if (initialMode === 'login') return null;
    const map = { business: 'business_client', creator: 'content_creator', brand: 'brand' } as const;
    const r = searchParams.get('role');
    return r && r in map ? map[r as keyof typeof map] : null;
  })();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [signupStep, setSignupStep] = useState<SignupStep>(initialRole ? "signup-form" : "role-selection");
  const [selectedRole, setSelectedRole] = useState<"business_client" | "content_creator" | "brand" | null>(initialRole);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [_needsVerification, setNeedsVerification] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, migrateCampaignData } = useAuth();

  const returnTo = (location.state as { from?: { pathname: string; search: string } })?.from;

  // Update mode when URL params change
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'login' || urlMode === 'signup') {
      setMode(urlMode);
    }
  }, [searchParams]);

  // Cooldown timer for resend verification button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleOAuthReturn = useCallback(async (returnTo: string) => {
    try {
      const returnUrl = new URL(returnTo, window.location.origin);
      if (!ALLOWED_REDIRECT_ORIGINS.has(returnUrl.origin)) {
        navigate('/', { replace: true });
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      returnUrl.searchParams.set('access_token', session.access_token);
      window.location.href = returnUrl.toString();
    } catch (err) {
      console.error('OAuth return redirect failed:', err);
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const checkProfileCompletion = useCallback(async () => {
    if (!user) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email_verified')
        .eq('id', user.id)
        .single();

      // Check email verification first — defer signOut so user can resend
      if (profile && profile.email_verified !== true) {
        setNeedsVerification(true);
        setError('verify_email');
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

        if (returnTo && returnTo.pathname !== '/auth') {
          navigate(returnTo.pathname + (returnTo.search || ''), { replace: true });
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
        if (returnTo && returnTo.pathname !== '/auth') {
          navigate(returnTo.pathname + (returnTo.search || ''), { replace: true });
          return;
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
        if (returnTo && returnTo.pathname !== '/auth') {
          navigate(returnTo.pathname + (returnTo.search || ''), { replace: true });
          return;
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
  }, [user, navigate, migrateCampaignData, returnTo]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        try {
          const url = new URL(returnTo, window.location.origin);
          if (ALLOWED_REDIRECT_ORIGINS.has(url.origin)) {
            handleOAuthReturn(returnTo);
            return;
          }
        } catch { /* invalid URL — fall through to normal flow */ }
      }
      checkProfileCompletion();
    }
  }, [isAuthenticated, checkProfileCompletion, handleOAuthReturn, searchParams]);

  const handleResendVerification = async () => {
    if (!user || resendCooldown > 0) return;
    setResendCooldown(60);
    try {
      await supabase.functions.invoke('send-verification-email', {
        body: {
          email: user.email,
          name: user.user_metadata?.full_name || '',
          userId: user.id,
        },
      });
      toast.success('Verification email sent! Check your inbox.');
    } catch {
      toast.error('Could not send email. Please try again.');
    }
  };

  const handleDismissVerification = async () => {
    setNeedsVerification(false);
    setError(null);
    await supabase.auth.signOut();
  };

  const handleModeChange = (newMode: "login" | "signup") => {
    setMode(newMode);
    setError(null);
    // Reset signup step when switching modes
    setSignupStep("role-selection");
    setSelectedRole(null);
    navigate(`/auth?mode=${newMode}`, { replace: true, state: location.state });
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
      <SEO
        title="Sign In or Sign Up - DragonCandy"
        description="Log in to DragonCandy or create a brand, restaurant, or creator account in under a minute."
        path="/auth"
      />
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

          {error === 'verify_email' ? (
            <div className="bg-red-50 px-4 py-3 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto text-center space-y-2">
              <p className="text-sm text-red-600">
                Please verify your email before continuing. Check your inbox for the verification link.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                className="text-sm font-semibold text-dc-teal hover:text-dc-teal-dark disabled:text-gray-400 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </button>
              <button
                onClick={handleDismissVerification}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          ) : null}

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

          {error === 'verify_email' ? (
            <div className="bg-red-50 px-4 py-3 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto text-center space-y-2">
              <p className="text-sm text-red-600">
                Please verify your email before continuing. Check your inbox for the verification link.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                className="text-sm font-semibold text-dc-teal hover:text-dc-teal-dark disabled:text-gray-400 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </button>
              <button
                onClick={handleDismissVerification}
                className="block mx-auto text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          ) : null}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="signup" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
