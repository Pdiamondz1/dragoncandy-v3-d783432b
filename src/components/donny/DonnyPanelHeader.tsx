import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { DonnyAvatar } from './DonnyAvatar';
import type { DonnyAvatarState } from '@/types/donny';

interface DonnyPanelHeaderProps {
  avatarState: DonnyAvatarState;
  /** Tray → chat. When set, renders an expand (⌃) control. */
  onExpand?: () => void;
  /** Chat → tray. When set, renders a minimize (⌄) control. */
  onCollapse?: () => void;
  /** Always rendered — the close (✕) control. */
  onClose: () => void;
  /** Optional unread-nudge badge (tray). */
  unreadCount?: number;
}

/**
 * Shared header for both Donny panel stages (tray + chat). Teal-gradient so the
 * tray → chat transition is visually continuous, and — critically — the tray now
 * carries a real close control so users are never trapped on first open.
 */
export function DonnyPanelHeader({
  avatarState,
  onExpand,
  onCollapse,
  onClose,
  unreadCount = 0,
}: DonnyPanelHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-dc-teal to-dc-teal-dark">
      <DonnyAvatar size="md" state={avatarState} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-white">Donny</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold text-dc-teal bg-white px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/80">Your AI assistant</div>
      </div>
      {onExpand && (
        <button
          onClick={onExpand}
          aria-label="Expand chat"
          className="shrink-0 p-1.5 text-white/70 hover:text-white transition-colors"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
      {onCollapse && (
        <button
          onClick={onCollapse}
          aria-label="Minimize Donny"
          className="shrink-0 p-1.5 text-white/70 hover:text-white transition-colors"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close Donny"
        className="shrink-0 p-1.5 text-white/70 hover:text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
