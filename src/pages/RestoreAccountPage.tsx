import { useDarkHtml } from "@/hooks/useDarkHtml";
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function RestoreAccountPage() {
  useDarkHtml();
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
      <div className="dark dc-surface flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="font-medium mb-4">Sign in to restore your account</p>
            <Button
              onClick={() => navigate(`/auth?redirect=/restore-account?org=${orgId}`)}
              className="rounded-full bg-teal-500 hover:bg-teal-600 text-white"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="dark dc-surface flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === 'idle' && (
            <>
              <RefreshCw className="h-12 w-12 text-teal-500 mb-4" />
              <p className="font-medium text-lg">Restore your organization?</p>
              <p className="text-sm text-muted-foreground mt-2">
                Your organization was scheduled for deletion. Click below to restore it and regain full access.
              </p>
              <Button
                onClick={handleRestore}
                className="mt-6 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                Restore Organization
              </Button>
            </>
          )}
          {status === 'restoring' && (
            <>
              <RefreshCw className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="font-medium">Restoring...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">Welcome back!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="font-medium text-lg">Restore failed</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              <Button
                onClick={() => navigate('/auth')}
                className="mt-4 rounded-full"
                variant="outline"
              >
                Back to login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
