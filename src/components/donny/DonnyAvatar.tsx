import { cn } from '@/lib/utils';
import type { DonnyAvatarState } from '@/types/donny';
import donnyEmblem from '@/assets/donny-emblem.webp';

interface DonnyAvatarProps {
  // 'xl' is the hero size — added for the Donny-first dashboard, where the
  // emblem sits above the greeting as the page's opening mark rather than
  // beside a message. Purely additive: no existing call site is affected.
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  state?: DonnyAvatarState;
  badgeCount?: number;
  glow?: boolean;
  className?: string;
  'aria-label'?: string;
}

const sizeClasses = {
  xs: 'w-7 h-7',
  sm: 'w-9 h-9',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

const badgeSizeClasses = {
  xs: 'w-3 h-3 text-[6px] -top-0.5 -right-0.5',
  sm: 'w-3.5 h-3.5 text-[7px] -top-0.5 -right-0.5',
  md: 'w-4 h-4 text-[8px] -top-1 -right-1',
  lg: 'w-5 h-5 text-[9px] -top-1 -right-1',
  xl: 'w-6 h-6 text-[10px] -top-1 -right-1',
};

const stateStyles: Record<DonnyAvatarState, string> = {
  idle: '',
  thinking: 'animate-pulse',
  celebrating: 'animate-bounce',
  error: 'animate-pulse',
  action_needed: 'animate-pulse',
};

export function DonnyAvatar({
  size,
  state = 'idle',
  badgeCount,
  glow = false,
  className,
  'aria-label': ariaLabel,
}: DonnyAvatarProps) {
  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)} aria-label={ariaLabel}>
      <div
        className={cn(
          sizeClasses[size],
          'overflow-hidden rounded-full',
          stateStyles[state],
          glow && 'shadow-[0_0_12px_rgba(77,217,192,0.5)]'
        )}
      >
        <img
          src={donnyEmblem}
          alt="Donny"
          loading="lazy"
          className="w-full h-full object-cover scale-[1.35]"
        />
      </div>
      {badgeCount != null && badgeCount > 0 && (
        <span
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-dc-pink-accent-btn text-white font-bold border-2 border-white',
            badgeSizeClasses[size]
          )}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </div>
  );
}
