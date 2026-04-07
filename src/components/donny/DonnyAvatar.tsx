import { cn } from '@/lib/utils';
import type { DonnyAvatarState } from '@/types/donny';
import donnyIcon from '@/assets/Donny_icon.png';

interface DonnyAvatarProps {
  state?: DonnyAvatarState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-sm',
  md: 'w-10 h-10 text-xl',
  lg: 'w-14 h-14 text-3xl',
};

const stateStyles: Record<DonnyAvatarState, string> = {
  idle: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[breathe_3s_ease-in-out_infinite]',
  thinking: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[pulse_1s_ease-in-out_infinite]',
  celebrating: 'bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] animate-[bounce_0.5s_ease-in-out_3]',
  error: 'bg-gradient-to-br from-[#F9A8D4] to-[#EC4899] animate-[shake_0.3s_ease-in-out_2]',
  action_needed: 'bg-gradient-to-br from-[#FACC15] to-[#F59E0B] animate-[pulse_1.5s_ease-in-out_infinite]',
};

export function DonnyAvatar({ state = 'idle', size = 'md', className }: DonnyAvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0',
        sizeClasses[size],
        stateStyles[state],
        className
      )}
    >
      <img src={donnyIcon} alt="Donny" className="w-full h-full object-cover rounded-full" />
    </div>
  );
}
