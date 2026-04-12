import { cn } from '@/lib/utils';
import type { DonnyAvatarState } from '@/types/donny';
import donnyEmblem from '@/assets/donny-emblem.png';

interface DonnyAvatarProps {
  size: 'xs' | 'sm' | 'md' | 'lg';
  state?: DonnyAvatarState;
  badgeCount?: number;
  glow?: boolean;
  className?: string;
}

const sizeClasses = {
  xs: 'w-20 h-20',
  sm: 'w-28 h-28',
  md: 'w-40 h-40',
  lg: 'w-56 h-56',
};

const badgeSizeClasses = {
  xs: 'w-3 h-3 text-[6px] -top-0.5 -right-0.5',
  sm: 'w-3.5 h-3.5 text-[7px] -top-0.5 -right-0.5',
  md: 'w-4 h-4 text-[8px] -top-1 -right-1',
  lg: 'w-5 h-5 text-[9px] -top-1 -right-1',
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
}: DonnyAvatarProps) {
  return (
    <div className={cn('relative inline-flex flex-shrink-0', className)}>
      <div
        className={cn(
          sizeClasses[size],
          stateStyles[state],
          glow && 'shadow-[0_0_12px_rgba(77,217,192,0.5)]'
        )}
      >
        <img
          src={donnyEmblem}
          alt="Donny"
          loading="lazy"
          className="w-full h-full object-contain"
        />
      </div>
      {badgeCount != null && badgeCount > 0 && (
        <span
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-[#EC4899] text-white font-bold border-2 border-white',
            badgeSizeClasses[size]
          )}
        >
          {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
    </div>
  );
}
