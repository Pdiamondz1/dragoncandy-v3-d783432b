import React, { useState } from 'react';
import { ConnectAccountButtonGroup, AccountsList, type SocialNetwork } from '@outstand-so/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useOutstandConfig, OUTSTAND_PROXY_BASE_URL } from '@/integrations/outstand/Provider';
import { useOutstandPaths } from '@/hooks/outstand/useOutstandPaths';
import { toast } from 'sonner';
import { BrandGuidelinesEditor } from './BrandGuidelinesEditor';
import { DelegatedPostingPermissions } from './DelegatedPostingPermissions';
import { DELEGATED_POSTING_ENABLED } from '@/lib/featureConfig';
import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';
import { useLocationSocialAccounts, useUnassignedSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { useAssignAccountLocation } from '@/hooks/outstand/useAssignAccountLocation';
import { Globe, MapPin, Unplug } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';

const SUPPORTED_NETWORKS: SocialNetwork[] = ['facebook', 'instagram', 'tiktok', 'x', 'youtube'];

const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  tiktok: 'bg-gray-100 text-gray-700',
  x: 'bg-gray-100 text-gray-700',
  youtube: 'bg-red-100 text-red-700',
};

export const AccountsTab: React.FC = () => {
  const { apiKey, baseUrl } = useOutstandConfig();
  const { oauthCallback } = useOutstandPaths();
  const redirectUri = `${window.location.origin}${oauthCallback}`;
  const { profile, activeOrgUnit, activeOrg } = useAuth();
  const isBrand = profile?.role === 'brand';
  const queryClient = useQueryClient();
  const { data: units = [] } = useOrgUnits(activeOrg?.id);
  const { data: allAccounts = [] } = useLocationSocialAccounts(profile?.id, null);
  const { data: unassigned = [] } = useUnassignedSocialAccounts(profile?.id);
  const assignMutation = useAssignAccountLocation();
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  // One account per platform at a time: anything already connected is "in use".
  const connectedByPlatform = new Map(allAccounts.map((a) => [a.platform, a]));
  const availableNetworks = SUPPORTED_NETWORKS.filter((n) => !connectedByPlatform.has(n));

  const handleSaveAssignments = () => {
    const entries = Object.entries(assignments).filter(([, unitId]) => unitId);
    if (entries.length === 0) return;
    assignMutation.mutate(
      entries.map(([accountId, orgUnitId]) => ({ accountId, orgUnitId })),
      {
        onSuccess: () => {
          toast.success('Accounts assigned to locations.');
          setAssignments({});
        },
        onError: () => toast.error('Failed to assign some accounts.'),
      },
    );
  };

  const handleDisconnect = async (outstandAccountId: string) => {
    try {
      const res = await fetch(`${OUTSTAND_PROXY_BASE_URL}/social-accounts/${outstandAccountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success('Account disconnected.');
      queryClient.invalidateQueries({ queryKey: ['location-social-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-social-accounts'] });
    } catch {
      toast.error('Failed to disconnect account.');
    }
  };

  return (
    <div className="space-y-4">
      {unassigned.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-4 border-2 border-amber-300">
          <h2 className="text-base font-bold text-amber-900">Assign accounts to locations</h2>
          <p className="text-xs text-amber-700 mt-1 mb-4">
            These accounts aren't assigned to a location yet. Pick a location for each so they appear under the right dashboard.
          </p>
          <div className="space-y-3">
            {unassigned.map((acct) => (
              <div key={acct.id} className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_COLORS[acct.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                  {acct.platform}
                </span>
                <span className="text-sm font-medium text-gray-800 truncate flex-1">
                  {acct.platform_handle || acct.outstand_social_account_id}
                </span>
                <Select
                  value={assignments[acct.id] ?? ''}
                  onValueChange={(val) => setAssignments((prev) => ({ ...prev, [acct.id]: val }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button
            className="mt-4"
            size="sm"
            disabled={Object.values(assignments).filter(Boolean).length === 0 || assignMutation.isPending}
            onClick={handleSaveAssignments}
          >
            {assignMutation.isPending ? 'Saving…' : 'Save assignments'}
          </Button>
        </div>
      )}

      {activeOrgUnit ? (
        <>
          <AppCard variant="emphasis">
            <h2 className="text-base font-bold text-gray-900">Connect a network</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Connect your social accounts so you can publish, schedule, and respond to comments from one place.
              One account per platform at a time.
            </p>
            {connectedByPlatform.size > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {SUPPORTED_NETWORKS.filter((n) => connectedByPlatform.has(n)).map((network) => {
                  const acct = connectedByPlatform.get(network)!;
                  return (
                    <span
                      key={network}
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700"
                    >
                      <span className="capitalize">{network}</span>
                      {acct.platform_handle && <span className="text-teal-600">@{acct.platform_handle}</span>}
                      <span className="font-semibold">· Connected</span>
                    </span>
                  );
                })}
              </div>
            )}
            {availableNetworks.length === 0 ? (
              <p className="text-sm font-medium text-dc-teal">
                All networks connected. Disconnect one below to switch accounts.
              </p>
            ) : (
            <ConnectAccountButtonGroup
              networks={availableNetworks}
              redirectUri={redirectUri}
              apiKey={apiKey}
              baseUrl={baseUrl}
              layout="grid"
              variant="outline"
              onSuccess={(network, authUrl) => {
                sessionStorage.setItem('outstand_pending_network', network);
                sessionStorage.setItem('outstand_pending_org_unit_id', activeOrgUnit.id);
                window.location.href = authUrl;
              }}
              onError={(network, error) => {
                console.error('Outstand connect error:', network, error);
                toast.error(`Could not start ${network} connection: ${error.message}`);
              }}
            />
            )}
          </AppCard>

          <AppCard variant="emphasis">
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
          </AppCard>
        </>
      ) : (
        <>
          <div className="bg-dc-teal/[0.04] rounded-2xl p-4 border border-dc-teal/15">
            <div className="flex items-center gap-2 text-gray-500">
              <Globe className="h-4 w-4" />
              <p className="text-sm">Switch to a specific location to connect new accounts.</p>
            </div>
          </div>

          <AppCard variant="emphasis">
            <h2 className="text-base font-bold text-gray-900">All connected accounts</h2>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Accounts across all your locations. Change location or disconnect from here.
            </p>
            {allAccounts.length === 0 ? (
              <p className="text-sm text-gray-400">No connected accounts.</p>
            ) : (
              <div className="space-y-2">
                {allAccounts.map((acct) => (
                  <div key={acct.id} className="flex items-center gap-3 p-3 bg-dc-teal/[0.04] rounded-lg">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLATFORM_COLORS[acct.platform] ?? 'bg-gray-100 text-gray-700'}`}>
                      {acct.platform}
                    </span>
                    <span className="text-sm font-medium text-gray-800 truncate flex-1">
                      {acct.platform_handle || acct.outstand_social_account_id}
                    </span>
                    {acct.org_unit_name && (
                      <AppStatusBadge tone="neutral" className="gap-1">
                        <MapPin className="h-3 w-3" />
                        {acct.org_unit_name}
                      </AppStatusBadge>
                    )}
                    <Select
                      value={acct.org_unit_id ?? ''}
                      onValueChange={(val) => {
                        assignMutation.mutate(
                          [{ accountId: acct.id, orgUnitId: val }],
                          {
                            onSuccess: () => toast.success('Location updated.'),
                            onError: () => toast.error('Failed to update location.'),
                          },
                        );
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Change location" />
                      </SelectTrigger>
                      <SelectContent>
                        {units.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => handleDisconnect(acct.outstand_social_account_id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      title="Disconnect"
                    >
                      <Unplug className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </AppCard>
        </>
      )}

      {isBrand && (
        <AppCard variant="emphasis">
          <h2 className="text-base font-bold text-gray-900 mb-3">Brand Guidelines</h2>
          <p className="text-xs text-gray-500 mb-4">
            These guidelines are auto-applied when amplifying sponsored content.
          </p>
          <BrandGuidelinesEditor />
        </AppCard>
      )}

      {/* Hidden while delegated posting cannot actually publish — see
          DELEGATED_POSTING_ENABLED. Offering a grant that silently never works
          is worse than not offering it. */}
      {DELEGATED_POSTING_ENABLED && (
        <AppCard>
          <h2 className="text-base font-bold text-gray-900 mb-3">Posting Permissions</h2>
          <p className="text-xs text-gray-500 mb-4">Manage who can post on behalf of your accounts.</p>
          <DelegatedPostingPermissions />
        </AppCard>
      )}
    </div>
  );
};
