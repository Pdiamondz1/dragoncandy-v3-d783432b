import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OAuthCallback } from '@outstand-so/ui';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  DragonCandyOutstandProvider,
  useOutstandConfig,
  OUTSTAND_PROXY_BASE_URL,
} from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types/user';
import { toast } from 'sonner';

const PENDING_NETWORK_KEY = 'outstand_pending_network';

const BackToSettings: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      size="sm"
      className="mt-4 rounded-full border-teal-300 text-teal-700 hover:bg-teal-50"
      onClick={() => navigate(to, { replace: true })}
    >
      <ArrowLeft className="h-4 w-4 mr-1" />
      Back to Settings
    </Button>
  );
};

const OneStepCallback: React.FC<{ accountId: string; username: string | null; backPath: string }> = ({
  accountId,
  username,
  backPath,
}) => {
  const navigate = useNavigate();
  const { apiKey } = useOutstandConfig();
  const [status, setStatus] = useState<'pending' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const network = sessionStorage.getItem(PENDING_NETWORK_KEY) ?? '';
    sessionStorage.removeItem(PENDING_NETWORK_KEY);
    const orgUnitId = sessionStorage.getItem('outstand_pending_org_unit_id') ?? '';
    sessionStorage.removeItem('outstand_pending_org_unit_id');

    if (!network) {
      setStatus('error');
      setError('Network missing — please retry from the Accounts tab.');
      return;
    }

    fetch(`${OUTSTAND_PROXY_BASE_URL}/__internal/record-connection`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ account_id: accountId, network, username, org_unit_id: orgUnitId || undefined }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const detail = body?.detail ? ` (${body.detail})` : '';
          throw new Error((body?.error || `Request failed (${res.status})`) + detail);
        }
        toast.success(`${network.charAt(0).toUpperCase() + network.slice(1)} connected.`);
        navigate(backPath, { replace: true });
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : 'Connection failed';
        setStatus('error');
        setError(message);
        toast.error(`Connection failed: ${message}`);
      });
  }, [accountId, username, apiKey, navigate, backPath]);

  if (status === 'error') {
    return (
      <>
        <p className="text-sm text-red-600">
          Could not record connection: {error}
        </p>
        <BackToSettings to={backPath} />
      </>
    );
  }
  return <p className="text-sm text-gray-600">Recording your connection…</p>;
};

const Inner: React.FC = () => {
  const navigate = useNavigate();
  const { apiKey, baseUrl } = useOutstandConfig();
  const { accountsTab } = useOutstandPaths();
  const params = new URLSearchParams(window.location.search);
  const session = params.get('session');
  const success = params.get('success');
  const accountId = params.get('account_id');
  const username = params.get('username');
  const errorParam = params.get('error');

  if (errorParam) {
    return (
      <>
        <p className="text-sm text-red-600">Connection failed: {errorParam}</p>
        <BackToSettings to={accountsTab} />
      </>
    );
  }

  if (session) {
    return (
      <OAuthCallback
        apiKey={apiKey}
        baseUrl={baseUrl}
        onSuccess={(accounts) => {
          sessionStorage.removeItem(PENDING_NETWORK_KEY);
          const count = accounts?.length ?? 0;
          toast.success(count === 1 ? 'Account connected.' : `${count} accounts connected.`);
          navigate(accountsTab, { replace: true });
        }}
        onError={(error) => {
          console.error('OAuth callback error:', error);
          toast.error(`Connection failed: ${error.message}`);
          navigate(accountsTab, { replace: true });
        }}
      />
    );
  }

  if (success === 'true' && accountId) {
    return <OneStepCallback accountId={accountId} username={username} backPath={accountsTab} />;
  }

  return (
    <>
      <p className="text-sm text-red-600">
        Unexpected callback parameters. Please retry from the Accounts tab.
      </p>
      <BackToSettings to={accountsTab} />
    </>
  );
};

const OutstandOAuthCallbackPage: React.FC = () => {
  const { profile } = useAuth();
  const role: UserRole = profile?.role ?? 'business_client';
  return (
    <DashboardLayout userRole={role}>
      <DragonCandyOutstandProvider>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 border-2 border-dc-teal">
            <h1 className="text-base font-bold text-gray-900 mb-3">
              Finishing up your connection…
            </h1>
            <Inner />
          </div>
        </div>
      </DragonCandyOutstandProvider>
    </DashboardLayout>
  );
};

export default OutstandOAuthCallbackPage;
