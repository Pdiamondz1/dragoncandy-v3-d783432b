import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AuthShell } from '@/components/auth/AuthShell';
import { LandingButton } from '@/components/landing/LandingButton';

export default function RestoreAccountPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'restoring' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const orgId = searchParams.get('org');

  const handleRestore = async () => {
    if (!user || !orgId) return;
    setStatus('restoring');

    try {
      const { error } = await supabase.rpc('restore_org', { p_org_id: orgId });
      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ org_id: orgId })
        .eq('id', user.id);

      setStatus('success');
      setTimeout(() => navigate('/dashboard/business', { replace: true }), 2000);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to restore organization.');
    }
  };

  if (!isAuthenticated) {
    return (
      <AuthShell className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)]">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="font-medium mb-4">Sign in to restore your account</p>
            <LandingButton
              onClick={() => navigate(`/auth?redirect=/restore-account?org=${orgId}`)}
              variant="pink"
            >
              Sign In
            </LandingButton>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell className="flex items-center justify-center p-6">
      <Card className="w-full max-w-sm rounded-2xl border-2 border-landing-line bg-white shadow-[0_14px_30px_rgba(36,19,50,0.08)]">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === 'idle' && (
            <>
              <RefreshCw className="h-12 w-12 text-landing-mint mb-4" />
              <p className="font-medium text-lg">Restore your organization?</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your organization was scheduled for deletion. Click below to restore it and regain full access.
              </p>
              <LandingButton
                onClick={handleRestore}
                variant="pink"
                className="mt-6"
              >
                Restore Organization
              </LandingButton>
            </>
          )}
          {status === 'restoring' && (
            <>
              <RefreshCw className="h-8 w-8 animate-spin text-landing-mint mb-4" />
              <p className="font-medium">Restoring...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
              <p className="font-medium text-lg">Welcome back!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-600 mb-4" />
              <p className="font-medium text-lg">Restore failed</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              <LandingButton
                onClick={() => navigate('/auth')}
                variant="ghost"
                className="mt-4"
              >
                Back to login
              </LandingButton>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
