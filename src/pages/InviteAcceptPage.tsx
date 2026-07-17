import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SEO } from '@/components/SEO';

export default function InviteAcceptPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const orgId = searchParams.get('org');
  const invitedUserId = searchParams.get('user');
  const role = searchParams.get('role');
  const invitedBy = searchParams.get('invited_by');

  useEffect(() => {
    const acceptInvite = async () => {
      if (!isAuthenticated || !user) return;
      if (!orgId) {
        setStatus('error');
        setErrorMessage('Invalid invite link.');
        return;
      }

      try {
        // For existing users: update their org_members row
        if (invitedUserId) {
          const { error } = await supabase
            .from('org_members')
            .update({
              invitation_status: 'active',
              joined_at: new Date().toISOString(),
            })
            .eq('org_id', orgId)
            .eq('user_id', user.id)
            .eq('invitation_status', 'invited');

          if (error) throw error;
        } else if (role) {
          // For new users (signed up via magic link): create membership
          const { error } = await supabase
            .from('org_members')
            .upsert({
              org_id: orgId,
              user_id: user.id,
              role: role,
              invited_by: invitedBy,
              invitation_status: 'active',
              joined_at: new Date().toISOString(),
            }, { onConflict: 'org_id,user_id' });

          if (error) throw error;
        }

        // Update profile org reference
        await supabase
          .from('profiles')
          .update({ org_id: orgId })
          .eq('id', user.id);

        setStatus('success');
        setTimeout(() => {
          navigate('/dashboard/business', { replace: true });
        }, 2000);
      } catch (err: unknown) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Failed to accept invitation.');
      }
    };

    acceptInvite();
  }, [isAuthenticated, user, orgId, invitedUserId, role, invitedBy, navigate]);

  if (!isAuthenticated) {
    return (
      <div className="dark dc-surface flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
            <p className="font-medium">Sign in to accept your invitation</p>
            <Button
              onClick={() => navigate(`/auth?redirect=/invite/accept?${searchParams.toString()}`)}
              className="mt-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
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
      <SEO
        title="Accept Your DragonCandy Invite"
        description="Accept your invitation to join DragonCandy."
        path="/invite/accept"
        noindex
      />
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center py-12 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="font-medium">Accepting invitation...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="font-medium text-lg">Welcome to the team!</p>
              <p className="text-sm text-muted-foreground mt-1">Redirecting to your dashboard...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="font-medium text-lg">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
              <Button
                onClick={() => navigate('/dashboard/business')}
                className="mt-4 rounded-full bg-teal-500 hover:bg-teal-600 text-white"
              >
                Go to Dashboard
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
