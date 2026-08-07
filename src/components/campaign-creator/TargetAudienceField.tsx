import { EditableField } from './EditableField';
import { AppChip } from '@/components/app/AppChip';

interface TargetAudienceFieldProps {
  value: string;
  /** Every audience Donny proposed for this idea, primary first. */
  options: string[];
  onChange: (value: string) => void;
}

/**
 * The campaign's thesis: who the content should pull in. Donny pre-fills it from the
 * business he already read, so the default cost is zero keystrokes.
 *
 * The swap chips are simply "every option that isn't the current value" — because the
 * option set never changes, swapping back to a previous pick falls out for free and
 * needs no extra state.
 */
export function TargetAudienceField({ value, options, onChange }: TargetAudienceFieldProps) {
  const swaps = options.filter((option) => option !== value);

  return (
    <div>
      <EditableField
        label="Who should this bring in?"
        value={value}
        originalValue={options[0] ?? ''}
        placeholder="e.g. Date-night couples, 25-40, within 5 miles"
        onChange={onChange}
      />
      {swaps.length > 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-dc-text-muted">Or target</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {swaps.map((option) => (
              <AppChip
                key={option}
                onClick={() => onChange(option)}
                // Full sentences, not one-word filters — override the pill geometry so long
                // audiences wrap instead of blowing out the row.
                className="max-w-full rounded-2xl px-3 py-2 text-left text-xs font-medium leading-snug whitespace-normal"
              >
                {option}
              </AppChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
