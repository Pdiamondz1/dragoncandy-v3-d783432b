import { useState } from 'react';
import type { SocialAccount, SocialNetwork } from '@outstand-so/ui';
import { cn } from '@/lib/utils';

interface DCNetworkSelectorProps {
  accounts: SocialAccount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

const NETWORK_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
  facebook: '#1877F2',
  x: '#1f2937',
  youtube: '#dc2626',
  linkedin: '#0A66C2',
  threads: '#000000',
  bluesky: '#0085FF',
  pinterest: '#E60023',
};

const NETWORK_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  bluesky: 'Bluesky',
  pinterest: 'Pinterest',
};

function PlatformIcon({ network }: { network: SocialNetwork }) {
  const label = NETWORK_LABELS[network] ?? network;
  return (
    <span className="text-[10px] font-bold leading-none text-white select-none">
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function DCNetworkSelector({ accounts, selectedIds, onChange, className }: DCNetworkSelectorProps) {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

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
          const networkColor = NETWORK_COLORS[account.network] ?? '#6b7280';
          const showFallback = imgErrors[account.id] || !account.profile_picture_url;

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
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: networkColor }}
              >
                {showFallback ? (
                  <PlatformIcon network={account.network} />
                ) : (
                  <img
                    src={account.profile_picture_url}
                    alt={account.nickname}
                    className="w-full h-full rounded-full object-cover"
                    onError={() => setImgErrors((prev) => ({ ...prev, [account.id]: true }))}
                  />
                )}
              </div>

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
