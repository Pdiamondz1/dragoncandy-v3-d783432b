import { formatDateDivider } from './donnyTime';

interface DonnyDateDividerProps {
  /** ISO timestamp of the first message in the day group. */
  iso?: string | null;
}

/**
 * Centered day separator between message groups. Brand-teal so it reads on both
 * the light consumer Donny panel and the dark internal "ops-deck" page.
 */
export function DonnyDateDivider({ iso }: DonnyDateDividerProps) {
  return (
    <div className="flex justify-center my-1">
      <span className="text-[11px] font-medium text-dc-teal bg-dc-teal/12 rounded-full px-2.5 py-0.5">
        {formatDateDivider(iso)}
      </span>
    </div>
  );
}
