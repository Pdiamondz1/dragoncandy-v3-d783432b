import React from 'react';

interface DeltaBadgeProps {
  delta: number | null;
  showLabel?: boolean;
}

export const DeltaBadge: React.FC<DeltaBadgeProps> = ({ delta, showLabel = false }) => {
  if (delta === null) return <span className="text-[11px] text-gray-300">—</span>;
  const isUp = delta >= 0;
  return (
    <span className={`text-[11px] font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
      {showLabel && <span className="text-gray-300 font-normal ml-1">vs prior</span>}
    </span>
  );
};
