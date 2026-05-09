import React from 'react';
import { ConnectAccountButtonGroup, AccountsList, type SocialNetwork } from '@outstand-so/ui';
import { useOutstandConfig } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { toast } from 'sonner';
import { BrandGuidelinesEditor } from './BrandGuidelinesEditor';
import { DelegatedPostingPermissions } from './DelegatedPostingPermissions';
import { useAuth } from '@/hooks/useAuth';

const SUPPORTED_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'tiktok', 'x', 'youtube'];

export const AccountsTab: React.FC = () => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { oauthCallback } = useOutstandPaths();
  const redirectUri = `${window.location.origin}${oauthCallback}`;
  const { profile } = useAuth();
  const isBrand = profile?.role === 'brand';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
        <h2 className="text-base font-bold text-gray-900">Connect a network</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Connect your social accounts so you can publish, schedule, and respond to comments from one place.
        </p>
        <ConnectAccountButtonGroup
          networks={SUPPORTED_NETWORKS}
          redirectUri={redirectUri}
          apiKey={apiKey}
          baseUrl={baseUrl}
          layout="grid"
          variant="outline"
          onSuccess={(network, authUrl) => {
            // Outstand's one-step redirect (?success=true&account_id=...) doesn't
            // echo back the network, so stash it for the callback page to read.
            sessionStorage.setItem('outstand_pending_network', network);
            window.location.href = authUrl;
          }}
          onError={(network, error) => {
            console.error('Outstand connect error:', network, error);
            toast.error(`Could not start ${network} connection: ${error.message}`);
          }}
        />
      </div>

      <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
        <h2 className="text-base font-bold text-gray-900">Connected accounts</h2>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Disconnect any account you no longer want to publish to.
        </p>
        <AccountsList
          apiKey={apiKey}
          baseUrl={baseUrl}
          onAccountDisconnect={() => {
            toast.success('Account disconnected.');
          }}
        />
      </div>

      {isBrand && (
        <div className="bg-white rounded-2xl p-4 border-2 border-dc-teal">
          <h2 className="text-base font-bold text-gray-900 mb-3">Brand Guidelines</h2>
          <p className="text-xs text-gray-500 mb-4">
            These guidelines are auto-applied when amplifying sponsored content.
          </p>
          <BrandGuidelinesEditor />
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-gray-200">
        <h2 className="text-base font-bold text-gray-900 mb-3">Posting Permissions</h2>
        <p className="text-xs text-gray-500 mb-4">Manage who can post on behalf of your accounts.</p>
        <DelegatedPostingPermissions />
      </div>
    </div>
  );
};
