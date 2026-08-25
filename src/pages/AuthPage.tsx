import { useCallback, useEffect, useRef, useState } from "react";
import { SEO } from "@/components/SEO";
import { wizardResumeStep } from "@/lib/onboardingProgress";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthModeToggle } from "@/components/auth/AuthModeToggle";
import { RoleSelection } from "@/components/auth/RoleSelection";
import { toast } from 'sonner';
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { AuthShell } from "@/components/auth/AuthShell";
import { Eyebrow } from "@/components/landing/Eyebrow";
import { ALLOWED_REDIRECT_ORIGINS } from "@/lib/allowedOrigins";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";
import { applyPendingRole, syncOauthVerification, readReturnPath } from "@/lib/socialAuth";
import { HEADER_LOGO_CLASS, PUBLIC_LOGO_INTRINSIC } from "@/lib/brandLogo";

type SignupStep = "role-selection" | "signup-form";

const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get('mode') === 'login' ? 'login' : 'signup';
  // Pre-select role from the landing "Join as a Business/Creator" CTAs (?role=).
  // Map the URL value to the profile enum; ignore on login or unknown values.
  const initialRole = ((): "business_client" | "content_creator" | "brand" | null => {
    if (initialMode === 'login') return null;
    const map: Record<string, "business_client" | "content_creator" | "brand"> = {
      business: 'business_client',
      creator: 'content_creator',
    };
    if (BRAND_ROLE_ENABLED) map.brand = 'brand'; // brand signup stays behind the flag
    const r = searchParams.get('role');
    // own-property check only — reject inherited names like ?role=constructor
    return r && Object.prototype.hasOwnProperty.call(map, r) ? map[r] : null;
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

  const routerReturnTo = (location.state as { from?: { pathname: string; search: string } })?.from;
  // A full-page OAuth round trip destroys `location.state`, so the destination a
  // route guard recorded comes back in the URL instead. Router state wins when both
  // exist: it is the one this navigation actually carried.
  const returnTo = routerReturnTo ?? (() => {
    const path = readReturnPath(location.search);
    if (!path) return undefined;
    const [pathname, search] = path.split(/(?=\?)/);
    return { pathname, search: search ?? '' };
  })();

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
      // Apply the role a social signup chose, BEFORE reading the profile below —
      // `claim_initial_role` may change it, and reading first would route the user
      // by the trigger's default (`content_creator`) for exactly one visit, landing
      // a restaurant on the creator dashboard. Resolves to null and does nothing
      // for every password login, which stash nothing.
      //
      // The verification sync runs alongside it and for a different account: the
      // trigger fires on INSERT, so it misses a password account that never
      // verified and whose owner has now signed in with Google. Both are no-ops
      // for an ordinary password login.
      await Promise.all([syncOauthVerification(), applyPendingRole()]);

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

        // `is_completed` is NOT "onboarding finished". `saveCore` sets it when the user
        // leaves the last COLLECT slide — before phone, address, payments or ready — so
        // that someone who quits inside Stripe still has a working dashboard. Reading it
        // as "done" is what sent a half-onboarded user straight to their dashboard with
        // required work outstanding and nothing on screen saying so.
        //
        // `/profile/setup` DIRECTLY, not `/profile/business`: those are
        // `<Navigate>` redirect routes, and bouncing through one is the hop the blank-page
        // race ran through. `replace` so Back does not return to /auth.
        const resumeAt = await wizardResumeStep(user.id, 'business_client');
        if (!businessProfile?.is_completed || resumeAt) {
          // Carry the slide, so a returning user lands on the thing they still have to
          // do rather than walking back through slides they already completed.
          navigate(resumeAt ? `/profile/setup?step=${resumeAt}` : '/profile/setup', { replace: true });
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

        // `is_completed` is NOT "onboarding finished". `saveCore` sets it when the user
        // leaves the last COLLECT slide — before phone, address, payments or ready — so
        // that someone who quits inside Stripe still has a working dashboard. Reading it
        // as "done" is what sent a half-onboarded user straight to their dashboard with
        // required work outstanding and nothing on screen saying so.
        //
        // `/profile/setup` DIRECTLY, not `/profile/content`: those are
        // `<Navigate>` redirect routes, and bouncing through one is the hop the blank-page
        // race ran through. `replace` so Back does not return to /auth.
        const resumeAt = await wizardResumeStep(user.id, 'content_creator');
        if (!creatorProfile?.is_completed || resumeAt) {
          // Carry the slide, so a returning user lands on the thing they still have to
          // do rather than walking back through slides they already completed.
          navigate(resumeAt ? `/profile/setup?step=${resumeAt}` : '/profile/setup', { replace: true });
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
        // `/dashboard/creator`, not `/campaigns`. The readiness checklist renders in
        // `CreatorDonnyHome`/`FirstRunDashboard` — i.e. the dashboard HOME — and the
        // campaigns page has no checklist at all. Landing there is why a half-onboarded
        // user saw a campaign list with required work outstanding and nothing on screen
        // saying so. Founder-reported 2026-08-24.
        navigate('/dashboard/creator', { replace: true });
        return;
      }

      if (profile.role === 'brand') {
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .single();

        // `is_completed` is NOT "onboarding finished". `saveCore` sets it when the user
        // leaves the last COLLECT slide — before phone, address, payments or ready — so
        // that someone who quits inside Stripe still has a working dashboard. Reading it
        // as "done" is what sent a half-onboarded user straight to their dashboard with
        // required work outstanding and nothing on screen saying so.
        //
        // `/profile/setup` DIRECTLY, not `/profile/brand`: those are
        // `<Navigate>` redirect routes, and bouncing through one is the hop the blank-page
        // race ran through. `replace` so Back does not return to /auth.
        const resumeAt = await wizardResumeStep(user.id, 'brand');
        if (!brandProfile?.is_completed || resumeAt) {
          // Carry the slide, so a returning user lands on the thing they still have to
          // do rather than walking back through slides they already completed.
          navigate(resumeAt ? `/profile/setup?step=${resumeAt}` : '/profile/setup', { replace: true });
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

  /**
   * Runs ONCE per authenticated session.
   *
   * Without the latch this effect fires repeatedly: its deps include `searchParams` and two
   * `useCallback`s whose own identities change as auth state resolves. Each firing starts a
   * fresh redirect, and two of them racing through the wizard hop left the browser parked on
   * a route rendering `null` — a blank page after login, reproduced on production with a
   * cold cache as two chains 135 ms apart. Founder-reported 2026-08-24.
   *
   * A ref, not state: the guard has to be visible to a second call arriving in the SAME
   * tick, before React has re-rendered. Reset when the session goes away so a sign-out then
   * sign-in still redirects.
   */
  const redirected = useRef(false);
  useEffect(() => {
    if (!isAuthenticated) { redirected.current = false; return; }
    if (redirected.current) return;
    redirected.current = true;
    {
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
    <AuthShell>
      {/* min-h-[100dvh], not min-h-screen: on iOS Safari 100vh is the URL-bar-COLLAPSED height,
          so this stands ~60-90px taller than the visible area and hands the sign-in screen that
          much dead scroll inside `main` — the same defect AppShell and DashboardLayout already
          fixed one container up. This is the page the landing's only CTA leads to. */}
      <div className="relative z-10 flex flex-1 flex-col min-h-[100dvh]">
      <SEO
        title="Sign In or Sign Up - DragonCandy"
        description="Log in to DragonCandy or create a brand, restaurant, or creator account in under a minute."
        path="/auth"
      />
      {/* Top nav — logo left, hamburger right */}
      <div className="flex items-center px-5 pt-6 pb-2">
        <Link to="/">
          {/* Was `w-[100px] md:w-[120px] lg:w-[140px] h-auto`, which rendered 116 / 140 / 163px
              TALL — the asset is taller than it is wide, so a width class multiplies the height
              instead of capping it. Same size as the landing header now, from one constant. */}
          <img
            src="/logo.webp"
            alt="DragonCandy"
            width={PUBLIC_LOGO_INTRINSIC.width}
            height={PUBLIC_LOGO_INTRINSIC.height}
            className={HEADER_LOGO_CLASS}
          />
        </Link>
      </div>

      {/* Render based on mode and signup step */}
      {mode === "login" && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="text-center mb-6">
            <Eyebrow className="text-landing-pink justify-center mb-2">Welcome back</Eyebrow>
            <h1 className="font-display text-2xl text-landing-ink">
              Welcome to DragonCandy
            </h1>
          </div>

          <AuthForm mode="login" onError={setError} />

          {/* Role is null on login: the account already has one, and `claim_initial_role`
              refuses anything but a fresh account anyway. */}
          <SocialAuthButtons
            mode="login"
            role={null}
            returnPath={returnTo ? returnTo.pathname + (returnTo.search || '') : null}
            onError={setError}
          />

          {error === 'verify_email' ? (
            <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto text-center space-y-2">
              <p className="text-sm text-red-600">
                Please verify your email before continuing. Check your inbox for the verification link.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                className="text-sm font-semibold text-landing-pink hover:text-landing-pink disabled:text-landing-ink-soft/40 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </button>
              <button
                onClick={handleDismissVerification}
                className="block mx-auto text-xs text-landing-ink-soft hover:text-landing-ink transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
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
          <div className="text-center mb-3">
            <Eyebrow className="text-landing-pink justify-center mb-2">Join DragonCandy</Eyebrow>
            <h1 className="font-display text-2xl text-landing-ink">
              Create Account
            </h1>
          </div>

          <AuthForm
            mode="signup"
            onError={setError}
            preSelectedRole={selectedRole}
            onChangeRole={handleChangeRole}
          />

          <SocialAuthButtons
            mode="signup"
            role={selectedRole}
            returnPath={returnTo ? returnTo.pathname + (returnTo.search || '') : null}
            onError={setError}
          />

          {error === 'verify_email' ? (
            <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto text-center space-y-2">
              <p className="text-sm text-red-600">
                Please verify your email before continuing. Check your inbox for the verification link.
              </p>
              <button
                onClick={handleResendVerification}
                disabled={resendCooldown > 0}
                className="text-sm font-semibold text-landing-pink hover:text-landing-pink disabled:text-landing-ink-soft/40 transition-colors"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend verification email'}
              </button>
              <button
                onClick={handleDismissVerification}
                className="block mx-auto text-xs text-landing-ink-soft hover:text-landing-ink transition-colors"
              >
                Back to login
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-xl mt-3 max-w-sm md:max-w-md mx-auto">
              {error}
            </div>
          ) : null}

          <div className="max-w-sm md:max-w-md mx-auto w-full">
            <AuthModeToggle mode="signup" onModeChange={handleModeChange} loading={false} />
          </div>
        </div>
      )}
      </div>
    </AuthShell>
  );
};

export default AuthPage;
