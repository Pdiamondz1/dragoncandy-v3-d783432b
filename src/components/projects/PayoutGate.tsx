import { Button } from '@/components/ui/button';
import { Loader2, Lock } from 'lucide-react';

interface PayoutGateProps {
  payoutAmount: number;
  onSetup: () => void;
  isSettingUp: boolean;
}

export function PayoutGate({ payoutAmount, onSetup, isSettingUp }: PayoutGateProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="rounded-2xl border-2 border-dc-teal bg-white p-6 space-y-4">
      {/* Celebration header */}
      <div className="text-center">
        <p className="text-4xl mb-2">🎉</p>
        <h3 className="text-lg font-bold text-gray-900">Content Approved!</h3>
        <p className="text-sm text-gray-600">Your deliverables have been approved</p>
      </div>

      {/* Payout amount box */}
      <div className="bg-teal-50 rounded-2xl p-4 text-center">
        <p className="text-xs text-teal-700 uppercase tracking-wide mb-1">Your Payout</p>
        <p className="text-3xl font-extrabold text-teal-700">{formatCurrency(payoutAmount)}</p>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
        <span className="text-lg">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Set up payouts to receive this payment</p>
          <p className="text-xs text-amber-700">Your earnings are held safely until your account is connected</p>
        </div>
      </div>

      {/* CTA Button */}
      <Button
        className="w-full rounded-full bg-dc-teal text-white font-bold py-3 hover:bg-teal-500"
        onClick={onSetup}
        disabled={isSettingUp}
      >
        {isSettingUp ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          'Connect Bank Account'
        )}
      </Button>

      {/* Footer */}
      <div className="flex items-center justify-center gap-1 text-xs text-gray-400">
        <Lock className="h-3 w-3" />
        <span>Powered by Stripe • Secure & encrypted</span>
      </div>
    </div>
  );
}
