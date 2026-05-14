import { Input } from '@/components/ui/input';
import { sanitizeNumericInput } from '@/lib/inputUtils';

interface BudgetSliderProps {
  min: number;
  max: number;
  onChangeMin: (val: number) => void;
  onChangeMax: (val: number) => void;
}

export function BudgetSlider({ max, onChangeMin, onChangeMax }: BudgetSliderProps) {
  const handleChange = (val: number) => {
    onChangeMin(val);
    onChangeMax(val);
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Proposed Budget</label>
      <div className="flex items-center gap-1 mt-2">
        <span className="text-sm text-gray-500">$</span>
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={max || ''}
          onChange={(e) => {
            const clean = sanitizeNumericInput(e.target.value);
            handleChange(Number(clean) || 0);
          }}
          placeholder="e.g. 500"
          className="w-32 text-sm"
        />
      </div>
      <p className="text-[11px] text-gray-400 mt-1">Creators can counter-offer during negotiation</p>
    </div>
  );
}
