import { DonnyAvatar } from './DonnyAvatar';
import { useDonnyDashboard } from '@/hooks/useDonnyDashboard';
import { useState } from 'react';

interface DonnyCardProps {
  onOpenChat: (initialMessage?: string) => void;
}

export function DonnyCard({ onOpenChat }: DonnyCardProps) {
  const { data: suggestion, isLoading } = useDonnyDashboard();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !suggestion || dismissed) return null;

  return (
    <div className="bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <DonnyAvatar size="lg" state="idle" />
        <div className="flex-1">
          <div className="text-sm font-bold text-white">Donny says...</div>
          <div className="text-sm text-white/90 mt-1 leading-relaxed">
            {suggestion.message}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 ml-[68px]">
        <button
          onClick={() => onOpenChat(suggestion.primary_action.message)}
          className="bg-white text-[#4DD9C0] text-sm font-bold px-4 py-1.5 rounded-full hover:bg-white/90 transition-colors"
        >
          {suggestion.primary_action.label}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="bg-white/20 text-white text-sm px-4 py-1.5 rounded-full hover:bg-white/30 transition-colors"
        >
          {suggestion.dismiss_label}
        </button>
      </div>
    </div>
  );
}
