import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SyncStatus =
  | 'synced'
  | 'pending'
  | 'failed'
  | 'tier_unavailable'
  | 'not_connected';

interface SyncStatusBadgeProps {
  status: SyncStatus;
  className?: string;
}

const config: Record<
  SyncStatus,
  {
    label: string;
    tooltip: string;
    dot: string;
    ring: string;
    text: string;
    bg: string;
    border: string;
    pulse: boolean;
  }
> = {
  synced: {
    label: 'Synced',
    tooltip: 'Discount is live on Toast POS',
    dot: 'bg-teal-500',
    ring: '',
    text: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    pulse: false,
  },
  pending: {
    label: 'Syncing',
    tooltip: 'Pushing discount to Toast…',
    dot: 'bg-amber-400',
    ring: 'ring-2 ring-amber-200 ring-offset-1',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    pulse: true,
  },
  failed: {
    label: 'Sync Failed',
    tooltip: 'Could not push to Toast — codes still work via DragonCandy',
    dot: 'bg-red-500',
    ring: '',
    text: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    pulse: false,
  },
  tier_unavailable: {
    label: 'Read-Only',
    tooltip: 'Partner tier required for two-way sync. Codes are DragonCandy-only.',
    dot: 'bg-gray-400',
    ring: '',
    text: 'text-gray-500',
    bg: 'bg-gray-50',
    border: 'border-dashed border-gray-300',
    pulse: false,
  },
  not_connected: {
    label: 'No Toast',
    tooltip: 'Connect Toast in Settings to enable sync',
    dot: 'bg-gray-300',
    ring: '',
    text: 'text-gray-400',
    bg: 'bg-transparent',
    border: 'border-dashed border-gray-200',
    pulse: false,
  },
};

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  status,
  className = '',
}) => {
  const c = config[status];

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
              'text-[11px] font-medium leading-none tracking-wide select-none',
              'border transition-colors duration-150',
              c.bg,
              c.border,
              c.text,
              className,
            ].join(' ')}
          >
            {/* Status dot */}
            <span className="relative flex h-1.5 w-1.5">
              {c.pulse && (
                <span
                  className={`absolute inset-0 rounded-full ${c.dot} animate-ping opacity-60`}
                />
              )}
              <span
                className={`relative inline-block h-1.5 w-1.5 rounded-full ${c.dot} ${c.ring}`}
              />
            </span>
            {c.label}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[200px] text-xs leading-snug"
        >
          {c.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
