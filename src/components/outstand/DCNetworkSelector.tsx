import type { SocialAccount } from '@outstand-so/ui';
import { cn } from '@/lib/utils';
import { SocialAccountAvatar } from './SocialAccountAvatar';
import { NETWORK_LABELS } from './socialNetworks';

interface DCNetworkSelectorProps {
  accounts: SocialAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export function DCNetworkSelector({ accounts, selectedIds, onChange, className }: DCNetworkSelectorProps) {
  const toggleAccount = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => onChange(accounts.map((a) => a.id));
  const deselectAll = () => onChange([]);

  if (accounts.length === 0) {
    return (
      <div className={cn('border border-dashed rounded-lg p-8 text-center', className)}>
        <p className="text-sm font-medium text-gray-500">No accounts connected</p>
        <p className="text-xs text-gray-400 mt-1">Connect your social media accounts to start posting</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex gap-2 text-sm">
        <button type="button" onClick={selectAll} className="text-dc-teal hover:underline">
          Select all
        </button>
        <span className="text-gray-400">&middot;</span>
        <button type="button" onClick={deselectAll} className="text-dc-teal hover:underline">
          Deselect all
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {accounts.map((account) => {
          const isSelected = selectedIds.includes(account.id);

          return (
            <button
              key={account.id}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`${account.nickname} on ${NETWORK_LABELS[account.network] ?? account.network}`}
              onClick={() => toggleAccount(account.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-all',
                isSelected
                  ? 'border-dc-teal bg-dc-teal/5'
                  : 'border-gray-200 hover:border-gray-400',
              )}
            >
              <SocialAccountAvatar
                network={account.network}
                profilePictureUrl={account.profile_picture_url}
                name={account.nickname}
              />

              <div className="flex-1 text-left min-w-0">
                <p className="font-medium truncate text-sm">{account.nickname}</p>
                <p className="text-xs text-gray-500 truncate">@{account.username}</p>
              </div>

              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0',
                  isSelected ? 'border-dc-teal bg-dc-teal' : 'border-gray-300',
                )}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
