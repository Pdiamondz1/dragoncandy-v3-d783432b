import React from 'react';
import { useDelegatedPermissions } from '@/hooks/outstand/useDelegatedPermissions';
import { useProfileNames } from '@/hooks/outstand/useProfileNames';
import { Button } from '@/components/ui/button';
import { ShieldCheck, X, Loader2 } from 'lucide-react';

export const DelegatedPostingPermissions: React.FC = () => {
  const { myGranted, myReceived, isLoading, revokePermission } = useDelegatedPermissions();

  const activeGranted = myGranted.filter((p) => p.status === 'active');
  const activeReceived = myReceived.filter((p) => p.status === 'active');
  const allUserIds = [
    ...activeGranted.map((p) => p.grantee_id),
    ...activeReceived.map((p) => p.grantor_id),
  ];
  const { data: profileNames } = useProfileNames(allUserIds);

  if (isLoading) {
    return <Loader2 className="h-5 w-5 animate-spin text-dc-teal mx-auto" />;
  }

  if (activeGranted.length === 0 && activeReceived.length === 0) {
    return (
      <div className="text-center py-4">
        <ShieldCheck className="h-6 w-6 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-400">No active posting permissions.</p>
        <p className="text-[10px] text-gray-300 mt-0.5">Permissions are created when you approve content on a campaign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeGranted.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">You've granted access to</p>
          <div className="space-y-2">
            {activeGranted.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-dc-teal/[0.04] rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{profileNames?.[p.grantee_id] ?? p.grantee_id.slice(0, 8)}</p>
                  <div className="flex gap-1 mt-1">
                    {p.platforms.map((pl) => (
                      <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revokePermission(p.id)} className="text-red-400 hover:text-red-600">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeReceived.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">You can post on behalf of</p>
          <div className="space-y-2">
            {activeReceived.map((p) => (
              <div key={p.id} className="flex items-center bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{profileNames?.[p.grantor_id] ?? p.grantor_id.slice(0, 8)}</p>
                  <div className="flex gap-1 mt-1">
                    {p.platforms.map((pl) => (
                      <span key={pl} className="text-[10px] bg-dc-teal/10 text-dc-teal px-1.5 py-0.5 rounded-full capitalize">{pl}</span>
                    ))}
                  </div>
                </div>
                <ShieldCheck className="h-4 w-4 text-dc-teal" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
