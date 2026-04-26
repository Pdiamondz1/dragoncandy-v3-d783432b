interface CampaignQuickStatsProps {
  budgetMin?: number;
  budgetMax?: number;
  deadline?: string;
  creatorCount?: number;
}

export function CampaignQuickStats({ budgetMin, budgetMax, deadline, creatorCount }: CampaignQuickStatsProps) {
  const formatBudget = () => {
    if (!budgetMin && !budgetMax) return 'TBD';
    return `$${budgetMin ?? 0}–${budgetMax ?? 0}`;
  };

  const formatDeadline = () => {
    if (!deadline) return 'TBD';
    return new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex justify-between bg-teal-50 border border-teal-100 rounded-xl p-3 mb-4">
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{formatBudget()}</p>
        <span className="text-[10px] text-gray-500 uppercase">Budget</span>
      </div>
      <div className="w-px bg-pink-300" />
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{formatDeadline()}</p>
        <span className="text-[10px] text-gray-500 uppercase">Deadline</span>
      </div>
      <div className="w-px bg-pink-300" />
      <div className="text-center flex-1">
        <p className="text-base font-bold text-gray-900">{creatorCount ?? '—'}</p>
        <span className="text-[10px] text-gray-500 uppercase">Creators</span>
      </div>
    </div>
  );
}
