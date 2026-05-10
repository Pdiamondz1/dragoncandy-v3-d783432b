interface EarningsSummaryProps {
  totalEarned: number;
  inEscrow: number;
  available: number;
  onboardingComplete: boolean;
  onSetupPayouts?: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export function EarningsSummary({
  totalEarned,
  inEscrow,
  available,
  onboardingComplete,
  onSetupPayouts,
}: EarningsSummaryProps) {
  return (
    <div className="bg-gradient-to-r from-[#F9A8D4] to-[#F9C8E0] rounded-b-3xl p-5">
      <div className="flex gap-2">
        <div className="bg-white/85 rounded-2xl p-3 flex-1 text-center">
          <p className="text-2xl font-extrabold text-gray-900">{formatCurrency(totalEarned)}</p>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide">Earned</p>
        </div>
        <div className="bg-white/85 rounded-2xl p-3 flex-1 text-center">
          <p className="text-2xl font-extrabold text-[#B8860B]">{formatCurrency(inEscrow)}</p>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide">In Escrow</p>
        </div>
        <div className="bg-white/85 rounded-2xl p-3 flex-1 text-center">
          <p className="text-2xl font-extrabold text-[#4DD9C0]">{formatCurrency(available)}</p>
          <p className="text-[10px] text-gray-600 uppercase tracking-wide">Available</p>
        </div>
      </div>

      {!onboardingComplete && (
        <div className="bg-white/70 rounded-xl p-3 flex items-center gap-3 mt-3">
          <span className="text-lg">💳</span>
          <p className="text-xs text-gray-700 flex-1">Set up payouts to withdraw earnings</p>
          <button onClick={onSetupPayouts} className="text-xs font-bold text-pink-600">
            Set Up →
          </button>
        </div>
      )}
    </div>
  );
}
