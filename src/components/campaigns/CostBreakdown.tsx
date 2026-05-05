import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CostBreakdownProps {
  deliverableCount: number;
  budgetTotal: number;
  baseCostPerDeliverable: number;
  premiumAmount: number;
  deliveryType: string;
}

export const CostBreakdown: React.FC<CostBreakdownProps> = ({
  deliverableCount,
  budgetTotal,
  baseCostPerDeliverable,
  premiumAmount,
  deliveryType,
}) => {
  return (
    <Card className="rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg">Cost Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-gray-100">
          {/* Base cost per deliverable */}
          <div className="py-2 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              Base cost per deliverable ({deliverableCount} × ${baseCostPerDeliverable.toFixed(2)})
            </span>
            <span className="text-sm text-gray-800">
              ${(deliverableCount * baseCostPerDeliverable).toFixed(2)}
            </span>
          </div>

          {/* DragonDash premium — only shown if > 0 */}
          {premiumAmount > 0 && (
            <div className="py-2 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                DragonDash premium{deliveryType ? ` (${deliveryType})` : ''}
              </span>
              <span className="text-sm text-gray-800">+${premiumAmount.toFixed(2)}</span>
            </div>
          )}

          {/* Total */}
          <div className="py-2 flex justify-between items-center">
            <span className="text-sm font-bold text-gray-800">Total</span>
            <span className="text-sm font-bold text-gray-800">${budgetTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-4 text-xs text-gray-500 italic">
          Donny will match you with creators in your area
        </p>
      </CardContent>
    </Card>
  );
};

