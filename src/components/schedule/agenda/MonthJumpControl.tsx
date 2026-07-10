// src/components/schedule/agenda/MonthJumpControl.tsx  (STUB — completed in Task 4)
export interface MonthJumpControlProps {
  anchorDate: Date;
  onSelect: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
}

export function MonthJumpControl({ anchorDate }: MonthJumpControlProps) {
  return (
    <span className="font-bold text-dc-teal text-base">
      {anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
    </span>
  );
}
