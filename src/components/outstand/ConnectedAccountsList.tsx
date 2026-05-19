import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';
import { useAccounts, ConnectAccountButtonGroup, type SocialNetwork } from '@outstand-so/ui';
import { DragonCandyOutstandProvider, useOutstandConfig, OUTSTAND_PROXY_BASE_URL } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PLATFORMS: { network: SocialNetwork; label: string; color: string }[] = [
  { network: 'instagram', label: 'Instagram', color: 'bg-[#E1306C]' },
  { network: 'tiktok', label: 'TikTok', color: 'bg-black' },
  { network: 'facebook', label: 'Facebook', color: 'bg-[#1877F2]' },
  { network: 'x', label: 'X (Twitter)', color: 'bg-gray-800' },
  { network: 'youtube', label: 'YouTube', color: 'bg-red-600' },
];

interface ConnectedAccountsListProps {
  role: 'business' | 'creator';
}

const ConnectedAccountsListInner: React.FC<ConnectedAccountsListProps> = ({ role: _role }) => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { base, oauthCallback } = useOutstandPaths();
  const { accounts, isLoading } = useAccounts({ apiKey, baseUrl, limit: 100 });
  const redirectUri = `${window.location.origin}${oauthCallback}`;
  const queryClient = useQueryClient();

  const [dialogState, setDialogState] = useState<{
    open: boolean;
    type: 'disconnect' | 'switch';
    network: SocialNetwork;
    handle: string;
    accountId: string;
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const switchConnectRef = useRef<{ network: SocialNetwork } | null>(null);

  const connectedNetworks = new Set(accounts.map((a) => a.network));

  const getAccount = (network: string) => accounts.find((a) => a.network === network);
  const getAccountHandle = (network: string): string | undefined => {
    const account = getAccount(network);
    if (!account) return undefined;
    return account.username ?? account.nickname ?? undefined;
  };

  const disconnectAccount = async (outstandAccountId: string) => {
    const res = await fetch(`${OUTSTAND_PROXY_BASE_URL}/social-accounts/${outstandAccountId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error('Disconnect failed');

    await supabase
      .from('business_outstand_accounts')
      .update({ status: 'revoked' })
      .eq('outstand_social_account_id', outstandAccountId);

    queryClient.invalidateQueries({ queryKey: ['location-social-accounts'] });
    queryClient.invalidateQueries({ queryKey: ['unassigned-social-accounts'] });
  };

  const handleConfirmDisconnect = async () => {
    if (!dialogState) return;
    setActionPending(true);
    try {
      await disconnectAccount(dialogState.accountId);
      toast.success(`${PLATFORMS.find((p) => p.network === dialogState.network)?.label ?? 'Account'} disconnected.`);
    } catch {
      toast.error('Failed to disconnect account.');
    } finally {
      setActionPending(false);
      setDialogState(null);
    }
  };

  const handleConfirmSwitch = async () => {
    if (!dialogState) return;
    setActionPending(true);
    try {
      await disconnectAccount(dialogState.accountId);
      switchConnectRef.current = { network: dialogState.network };
      setDialogState(null);
    } catch {
      toast.error('Failed to disconnect. Switch canceled.');
      setDialogState(null);
    } finally {
      setActionPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] font-semibold uppercase text-gray-400 tracking-wide">
        Connected Accounts
      </div>
      <div className="space-y-2">
        {PLATFORMS.map(({ network, label, color }) => {
          const isConnected = connectedNetworks.has(network);
          const handle = getAccountHandle(network);
          const account = getAccount(network);
          const isSwitchTarget = switchConnectRef.current?.network === network;

          if (isSwitchTarget && !isConnected) {
            switchConnectRef.current = null;
          }

          return (
            <div
              key={network}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${
                isConnected ? 'border-teal-200 bg-teal-50/50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 ${isConnected ? color : 'bg-gray-200'} rounded-lg flex items-center justify-center text-white text-[10px] font-bold`}
                >
                  {label.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div
                    className={`text-[11px] font-semibold ${isConnected ? 'text-gray-900' : 'text-gray-400'}`}
                  >
                    {isConnected && handle ? handle : label}
                  </div>
                  <div className={`text-[9px] ${isConnected ? 'text-emerald-600' : 'text-gray-300'}`}>
                    {isConnected ? 'Connected' : 'Not connected'}
                  </div>
                </div>
              </div>
              {isConnected && account ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      setDialogState({
                        open: true,
                        type: 'switch',
                        network,
                        handle: handle ?? label,
                        accountId: account.id,
                      })
                    }
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Switch account"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      setDialogState({
                        open: true,
                        type: 'disconnect',
                        network,
                        handle: handle ?? label,
                        accountId: account.id,
                      })
                    }
                    className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                    title="Disconnect"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : isSwitchTarget ? (
                <ConnectAccountButtonGroup
                  networks={[network]}
                  redirectUri={redirectUri}
                  apiKey={apiKey}
                  baseUrl={baseUrl}
                  variant="outline"
                  layout="vertical"
                  onSuccess={(_network, authUrl) => {
                    switchConnectRef.current = null;
                    sessionStorage.setItem('outstand_pending_network', network);
                    window.location.href = authUrl;
                  }}
                  onError={(_network, error) => {
                    switchConnectRef.current = null;
                    toast.error(`Could not connect ${label}: ${error.message}`);
                  }}
                />
              ) : !isConnected ? (
                <ConnectAccountButtonGroup
                  networks={[network]}
                  redirectUri={redirectUri}
                  apiKey={apiKey}
                  baseUrl={baseUrl}
                  variant="outline"
                  layout="vertical"
                  onSuccess={(_network, authUrl) => {
                    sessionStorage.setItem('outstand_pending_network', network);
                    window.location.href = authUrl;
                  }}
                  onError={(_network, error) => {
                    toast.error(`Could not connect ${label}: ${error.message}`);
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <Link
        to={base}
        className="flex items-center justify-center gap-1.5 bg-dc-teal text-white text-xs font-bold py-3 rounded-full w-full hover:bg-teal-500 transition-colors"
      >
        ◆ Open Social Media Manager →
      </Link>

      {/* Disconnect confirmation */}
      <AlertDialog
        open={dialogState?.type === 'disconnect'}
        onOpenChange={(open) => { if (!open) setDialogState(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {dialogState?.handle}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink your {PLATFORMS.find((p) => p.network === dialogState?.network)?.label} account. Scheduled posts to this account will be canceled. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDisconnect}
              className="rounded-full bg-red-600 hover:bg-red-700"
              disabled={actionPending}
            >
              {actionPending ? 'Disconnecting...' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Switch confirmation */}
      <AlertDialog
        open={dialogState?.type === 'switch'}
        onOpenChange={(open) => { if (!open) setDialogState(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Switch {PLATFORMS.find((p) => p.network === dialogState?.network)?.label} account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Currently connected: <strong>{dialogState?.handle}</strong>. This will disconnect the current account and redirect you to connect a new one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full" disabled={actionPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSwitch}
              className="rounded-full bg-teal-600 hover:bg-teal-700"
              disabled={actionPending}
            >
              {actionPending ? 'Switching...' : 'Switch Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const ConnectedAccountsList: React.FC<ConnectedAccountsListProps> = (props) => (
  <DragonCandyOutstandProvider>
    <ConnectedAccountsListInner {...props} />
  </DragonCandyOutstandProvider>
);
