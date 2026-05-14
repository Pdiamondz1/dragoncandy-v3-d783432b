import React from 'react';

interface EscrowFeeBreakdownProps {
  baseAmount: number;
  deliveryFee: number;
  deliveryType: string;
  platformRate?: number;
}

const DELIVERY_LABELS: Record<string, string> = {
  standard: 'Standard Delivery',
  expedited: 'Express Delivery',
  dragonrush: 'DragonDash Rush',
};

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const EscrowFeeBreakdown: React.FC<EscrowFeeBreakdownProps> = ({
  baseAmount,
  deliveryFee,
  deliveryType,
  platformRate = 0.1,
}) => {
  const subtotal = baseAmount + deliveryFee;
  const platformFee = Math.round(subtotal * platformRate * 100) / 100;
  const total = subtotal + platformFee;

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-sm space-y-1.5">
      <div className="flex justify-between text-gray-700">
        <span>Campaign Budget</span>
        <span className="font-medium">{formatCurrency(baseAmount)}</span>
      </div>
      {deliveryFee > 0 && (
        <div className="flex justify-between text-gray-700">
          <span>{DELIVERY_LABELS[deliveryType] ?? 'Delivery Fee'}</span>
          <span className="font-medium">{formatCurrency(deliveryFee)}</span>
        </div>
      )}
      <div className="flex justify-between text-gray-500">
        <span>Platform Fee ({Math.round(platformRate * 100)}%)</span>
        <span>{formatCurrency(platformFee)}</span>
      </div>
      <div className="flex justify-between font-bold text-gray-900 border-t border-teal-200 pt-1.5">
        <span>Total</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  );
};
