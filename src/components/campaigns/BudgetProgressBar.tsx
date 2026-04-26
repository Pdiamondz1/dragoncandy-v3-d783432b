import { DollarSign, Users } from "lucide-react";

interface BudgetProgressBarProps {
  budgetMax: number;
  budgetSpent: number;
  creatorCount: number | null;
  activeCreators: number;
}

export function BudgetProgressBar({
  budgetMax,
  budgetSpent,
  creatorCount,
  activeCreators,
}: BudgetProgressBarProps) {
  const percentSpent = budgetMax > 0 ? Math.min(100, (budgetSpent / budgetMax) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <DollarSign className="h-4 w-4" />
          Budget
        </div>
        <span className="text-sm font-semibold">
          ${budgetSpent.toLocaleString()} of ${budgetMax.toLocaleString()} committed
        </span>
      </div>

      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percentSpent > 90 ? "bg-red-500" : percentSpent > 70 ? "bg-yellow-500" : "bg-teal-500"
          }`}
          style={{ width: `${percentSpent}%` }}
        />
      </div>

      {creatorCount && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Users className="h-4 w-4" />
          <span>{activeCreators} of {creatorCount} creators</span>
        </div>
      )}
    </div>
  );
}
