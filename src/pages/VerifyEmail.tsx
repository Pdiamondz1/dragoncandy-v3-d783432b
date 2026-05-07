import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SEO } from '@/components/SEO';

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
          const redirect = encodeURIComponent(window.location.origin);
          window.location.replace(`https://zocahiffooqdybdhguqv.supabase.co/functions/v1/verify-email?token=${token}&redirect=${redirect}`);
          return;
        }

        setStatus('success');
        toast.success('Email verified successfully!');

        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/auth?mode=login');
        }, 2000);

      } catch (error: unknown) {
        console.error('VerifyEmail: unexpected error, redirecting to GET endpoint', error);
        const redirect = encodeURIComponent(window.location.origin);
        window.location.replace(`https://zocahiffooqdybdhguqv.supabase.co/functions/v1/verify-email?token=${token}&redirect=${redirect}`);
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
      <SEO
        title="Verify Your Email"
        description="Verifying your DragonCandy email address."
        path="/verify-email"
        noindex
      />
      {/* Template C header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
        <div className="flex-1 text-center">
          <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Email Verification</h1>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md border-2 border-dc-teal rounded-2xl p-6 text-center space-y-4" aria-live="polite">
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500">
            {status === 'verifying' && 'Verifying your email address…'}
            {status === 'success' && 'Your email has been verified!'}
            {status === 'error' && 'Verification failed'}
          </p>

          {status === 'verifying' && (
            <Loader2 className="h-16 w-16 text-dc-teal animate-spin mx-auto" aria-hidden="true" />
          )}

          {status === 'success' && (
            <>
              <CheckCircle2 className="h-16 w-16 text-dc-teal mx-auto" aria-hidden="true" />
              <p className="text-sm text-gray-500">
                Your email has been verified successfully. Redirecting you to login…
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="h-16 w-16 text-dc-pink-accent mx-auto" aria-hidden="true" />
              <p className="text-sm text-gray-500">{errorMessage}</p>
              <button
                onClick={() => navigate('/auth')}
                className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 hover:bg-dc-teal-btn-hover transition-colors"
              >
                Go to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
