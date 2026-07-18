import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { useRushSurchargeLog } from '@/hooks/outstand/useRushSurchargeLog';
import { RushConfirmDialog } from './RushConfirmDialog';

interface DragonDashRushButtonProps {
  platformCount: number;
  campaignId?: string;
  onRushComplete: () => void;
  disabled?: boolean;
  tierLocked?: boolean;
}

function formatSurcharge(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export const DragonDashRushButton: React.FC<DragonDashRushButtonProps> = ({
  platformCount, campaignId, onRushComplete, disabled = false, tierLocked = false,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const { logRush, isLogging, calculateSurcharge } = useRushSurchargeLog(campaignId);

  if (platformCount < 3) return null;

  const surchargeAmount = calculateSurcharge(platformCount);
  const surchargeDisplay = formatSurcharge(surchargeAmount);

  if (tierLocked) {
    return (
      <div className="bg-dc-teal/[0.04] rounded-2xl p-3.5 text-center opacity-60 cursor-not-allowed">
        <div className="flex items-center justify-center gap-2">
          <Zap className="h-4 w-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-400">Upgrade to unlock Rush Posting</span>
        </div>
      </div>
    );
  }

  const handleConfirm = () => {
    logRush(
      { platformCount, campaignId },
      {
        onSuccess: () => {
          setShowConfirm(false);
          onRushComplete();
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setShowConfirm(true)}
        className="w-full bg-gradient-to-br from-[#4DD9C0] to-[#00E5CC] rounded-2xl p-3.5 text-left relative overflow-hidden hover:shadow-lg transition-shadow disabled:opacity-50"
      >
        <div className="absolute top-0 right-0 bg-yellow-400 px-2.5 py-0.5 rounded-bl-xl">
          <span className="text-[9px] font-extrabold text-gray-900 tracking-wider">DRAGONDASH</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-white">Rush Post — All Platforms</p>
            <p className="text-[11px] text-white/80 mt-0.5">{platformCount} platforms simultaneously</p>
          </div>
          <div className="bg-yellow-400 px-2.5 py-1 rounded-lg">
            <span className="text-xs font-extrabold text-gray-900">{surchargeDisplay}</span>
          </div>
        </div>
      </button>

      <RushConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        platformCount={platformCount}
        surchargeDisplay={surchargeDisplay}
        onConfirm={handleConfirm}
        isLoading={isLogging}
      />
    </>
  );
};
