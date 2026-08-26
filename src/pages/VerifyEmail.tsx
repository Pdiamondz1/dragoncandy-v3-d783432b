import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEO } from '@/components/SEO';
import { AuthShell } from '@/components/auth/AuthShell';
import { LandingButton } from '@/components/landing/LandingButton';
import { publicOrigin } from '@/lib/publicOrigin';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setErrorMessage('Invalid verification link');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('verify-email', {
          body: { token },
        });

        if (error || !data?.success) {
          console.warn('VerifyEmail: invoke failed, redirecting to GET function endpoint', { error, data });
          const redirect = encodeURIComponent(publicOrigin());
          window.location.replace(`${import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co'}/functions/v1/verify-email?token=${token}&redirect=${redirect}`);
          return;
        }

        /**
         * Refresh the context BEFORE navigating. `verify-email` writes
         * `profiles.email_verified` in the database, but `AuthContext.profile` still holds
         * the row as it was loaded — `{ email_verified: false }`. Two readers of one fact,
         * one fresh and one stale: `AuthPage.checkProfileCompletion` re-reads the DB, sees
         * true, and sends the user to their dashboard, where `ProtectedRoute` reads the
         * stale context, sees false, and sends them back to `/auth`. That is a redirect
         * loop that only a hard reload breaks. Raised by the Codex second review.
         *
         * Awaited, not fired and forgotten: navigating first would race the very update the
         * destination is about to be judged on. Failure is non-fatal — verification really
         * did succeed, and the next auth event reloads the profile anyway — so it must not
         * turn a successful verification into an error screen.
         */
        try {
          await refreshProfile();
        } catch (refreshError) {
          console.warn('VerifyEmail: profile refresh failed after verification', refreshError);
        }

        setStatus('success');
        toast.success('Email verified successfully!');

        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/auth?mode=login');
        }, 2000);

      } catch (error: unknown) {
        console.error('VerifyEmail: unexpected error, redirecting to GET endpoint', error);
        const redirect = encodeURIComponent(publicOrigin());
        window.location.replace(`${import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co'}/functions/v1/verify-email?token=${token}&redirect=${redirect}`);
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <AuthShell>
      <div className="flex flex-col min-h-screen">
        <SEO
          title="Verify Your Email"
          description="Verifying your DragonCandy email address."
          path="/verify-email"
          noindex
        />
        {/* Template C header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-landing-line px-4 py-3 flex items-center">
          <div className="flex-1 text-center">
            <h1 className="font-sans text-base font-bold text-landing-ink uppercase tracking-wide">Email Verification</h1>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)] p-8 text-center space-y-4" aria-live="polite">
            <p className="font-sans text-xs font-semibold uppercase tracking-wider text-landing-ink-soft">
              {status === 'verifying' && 'Verifying your email address…'}
              {status === 'success' && 'Your email has been verified!'}
              {status === 'error' && 'Verification failed'}
            </p>

            {status === 'verifying' && (
              <Loader2 className="h-16 w-16 text-landing-mint animate-spin mx-auto" aria-hidden="true" />
            )}

            {status === 'success' && (
              <>
                <CheckCircle2 className="h-16 w-16 text-landing-mint mx-auto" aria-hidden="true" />
                <p className="text-sm text-landing-ink-soft">
                  Your email has been verified successfully. Redirecting you to login…
                </p>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle className="h-16 w-16 text-red-600 mx-auto" aria-hidden="true" />
                <p className="text-sm text-landing-ink-soft">{errorMessage}</p>
                <LandingButton
                  onClick={() => navigate('/auth')}
                  variant="pink"
                  className="w-full"
                >
                  Go to Login
                </LandingButton>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthShell>
  );
};

export default VerifyEmail;
