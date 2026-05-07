import React from 'react';

interface DonnyPicksBadgeProps {
  score: number;
}

export const DonnyPicksBadge: React.FC<DonnyPicksBadgeProps> = ({ score }) => {
  return (
    <div className="flex items-center gap-1 bg-dc-teal-btn rounded-full px-2.5 py-1 shadow-sm">
      <span className="text-[10px]">🎯</span>
      <span className="text-white text-xs font-bold">{score}% Match</span>
    </div>
  );
};
