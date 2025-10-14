import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
          setStatus('error');
          setErrorMessage(data?.message || error?.message || 'Invalid or expired verification link');
          return;
        }

        setStatus('success');
        toast.success('Email verified successfully!');

        // Redirect to login after 2 seconds
        setTimeout(() => {
          navigate('/auth?mode=login');
        }, 2000);

      } catch (error: any) {
        console.error('Error verifying email:', error);
        setStatus('error');
        setErrorMessage('An error occurred during verification. Please try again.');
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Email Verification</CardTitle>
          <CardDescription>
            {status === 'verifying' && 'Verifying your email address...'}
            {status === 'success' && 'Your email has been verified!'}
            {status === 'error' && 'Verification failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {status === 'verifying' && (
            <Loader2 className="h-16 w-16 text-primary animate-spin" />
          )}
          
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <p className="text-center text-muted-foreground">
                Your email has been verified successfully. Redirecting you to login...
              </p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <p className="text-center text-muted-foreground">{errorMessage}</p>
              <Button onClick={() => navigate('/auth')} className="mt-4">
                Go to Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VerifyEmail;
