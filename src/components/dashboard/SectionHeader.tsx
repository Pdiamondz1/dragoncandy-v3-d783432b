import React from 'react';

interface SectionHeaderProps {
  title: string;
  /** Right-aligned slot (view-all link, tour button) */
  action?: React.ReactNode;
}

/** The calm dashboards' section header: pink tick + quiet title. */
export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="h-3.5 w-1 rounded-full bg-dc-pink" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}
