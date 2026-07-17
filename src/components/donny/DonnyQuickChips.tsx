import type { DonnyQuickChip } from '@/types/donny';

interface DonnyQuickChipsProps {
  chips: DonnyQuickChip[];
  onChipTap: (message: string) => void;
  disabled?: boolean;
}

export function DonnyQuickChips({ chips, onChipTap, disabled = false }: DonnyQuickChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap px-3 py-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onChipTap(chip.message)}
          disabled={disabled}
          className="bg-white border border-dc-teal text-dc-teal text-xs font-medium px-3 py-1.5 rounded-full hover:bg-dc-teal-btn hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-dc-teal"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
