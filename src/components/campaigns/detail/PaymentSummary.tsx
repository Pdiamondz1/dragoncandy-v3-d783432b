import React from 'react';
import { format } from 'date-fns';
import { AppCard } from '@/components/app/AppCard';

interface PaymentSummaryProps {
  completedAt: string | null;
  amountPaid: number | null;
}

export const PaymentSummary: React.FC<PaymentSummaryProps> = ({
  completedAt,
  amountPaid,
}) => {
  return (
    <AppCard className="space-y-3">
      <h3 className="font-bold text-gray-900 text-sm">Payment</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Amount paid</span>
          <span className="text-sm font-semibold text-gray-900">
            {amountPaid != null ? `$${amountPaid.toLocaleString()}` : 'N/A'}
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
    </AppCard>
  );
};
