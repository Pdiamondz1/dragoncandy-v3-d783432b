import React from 'react';
import { format } from 'date-fns';

interface PaymentSummaryProps {
  completedAt: string | null;
  budgetMin: number | undefined;
  budgetMax: number | undefined;
}

function formatAmount(min: number | undefined, max: number | undefined): string {
  if (min && max && min !== max) return `$${min}–$${max}`;
  if (min && max && min === max) return `$${min}`;
  if (min) return `$${min}`;
  if (max) return `$${max}`;
  return 'N/A';
}

export const PaymentSummary: React.FC<PaymentSummaryProps> = ({
  completedAt,
  budgetMin,
  budgetMax,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      <h3 className="font-bold text-gray-900 text-sm">Payment</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Amount paid</span>
          <span className="text-sm font-semibold text-gray-900">
            {formatAmount(budgetMin, budgetMax)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Paid on</span>
          <span className="text-sm font-semibold text-gray-900">
            {completedAt
              ? format(new Date(completedAt), 'MMM d, yyyy')
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};
