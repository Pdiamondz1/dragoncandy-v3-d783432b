import { ChevronDown, X } from 'lucide-react';
import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyAvatarState } from '@/types/donny';

interface DonnyChatHeaderProps {
  avatarState: DonnyAvatarState;
  onCollapse: () => void;
  onClose: () => void;
}

export function DonnyChatHeader({ avatarState, onCollapse, onClose }: DonnyChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-dc-teal to-[#00E5CC]">
      <DonnyAvatar size="md" state={avatarState} />
      <div className="flex-1">
        <div className="font-bold text-sm text-white">Donny</div>
        <div className="text-[10px] text-white/80">Your AI assistant</div>
      </div>
      <button onClick={onCollapse} aria-label="Minimize Donny" className="text-white/70 hover:text-white">
        <ChevronDown className="w-5 h-5" />
      </button>
      <button onClick={onClose} aria-label="Close Donny" className="text-white/70 hover:text-white">
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
