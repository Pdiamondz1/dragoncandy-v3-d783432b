import { Input } from '@/components/ui/input';
import { sanitizeNumericInput } from '@/lib/inputUtils';

interface BudgetSliderProps {
  min: number;
  max: number;
  onChangeMin: (val: number) => void;
  onChangeMax: (val: number) => void;
}

export function BudgetSlider({ min, max, onChangeMin, onChangeMax }: BudgetSliderProps) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Range</label>
      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">$</span>
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={min || ''} onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); onChangeMin(Number(clean) || 0); }} className="w-24 text-sm" />
        </div>
        <span className="text-gray-400">—</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-gray-500">$</span>
          <Input type="text" inputMode="numeric" pattern="[0-9]*" value={max || ''} onChange={(e) => { const clean = sanitizeNumericInput(e.target.value); onChangeMax(Number(clean) || 0); }} className="w-24 text-sm" />
        </div>
      </div>
    </div>
  );
}
