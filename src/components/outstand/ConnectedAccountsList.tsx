import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAccounts, ConnectAccountButtonGroup, type SocialNetwork } from '@outstand-so/ui';
import { DragonCandyOutstandProvider, useOutstandConfig } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { toast } from 'sonner';

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

  const connectedNetworks = new Set(accounts.map((a) => a.network));

  const getAccountHandle = (network: string): string | undefined => {
    const account = accounts.find((a) => a.network === network);
    if (!account) return undefined;
    return account.username ?? account.nickname ?? undefined;
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
              {isConnected ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <ConnectAccountButtonGroup
                  networks={[network]}
                  redirectUri={redirectUri}
                  apiKey={apiKey}
                  baseUrl={baseUrl}
                  variant="outline"
                  layout="list"
                  onSuccess={(_network, authUrl) => {
                    sessionStorage.setItem('outstand_pending_network', network);
                    window.location.href = authUrl;
                  }}
                  onError={(_network, error) => {
                    toast.error(`Could not connect ${label}: ${error.message}`);
                  }}
                />
              )}
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
    </div>
  );
};

export const ConnectedAccountsList: React.FC<ConnectedAccountsListProps> = (props) => (
  <DragonCandyOutstandProvider>
    <ConnectedAccountsListInner {...props} />
  </DragonCandyOutstandProvider>
);
