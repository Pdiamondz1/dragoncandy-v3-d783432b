import type { BrandFields } from '@/types/campaignCreator';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BrandFieldsPanelProps {
  fields: BrandFields;
  onChange: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void;
}

const GEO_OPTIONS: { value: BrandFields['geographic_scope']; label: string }[] = [
  { value: 'city', label: 'City' },
  { value: 'region', label: 'Region' },
  { value: 'national', label: 'National' },
];

export function BrandFieldsPanel({ fields, onChange }: BrandFieldsPanelProps) {
  return (
    <div className="border-t border-gray-200 pt-4 mt-4 space-y-4">
      <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider">Brand Settings</p>
      <div>
        <label className="text-xs font-medium text-gray-500">Budget Pool</label>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-sm text-gray-500">$</span>
          <Input type="number" value={fields.budget_pool || ''} onChange={(e) => onChange('budget_pool', Number(e.target.value))} className="text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500">Geographic Scope</label>
        <div className="flex gap-2 mt-2">
          {GEO_OPTIONS.map(({ value, label }) => (
            <button key={value} type="button" onClick={() => onChange('geographic_scope', value)}
              className={cn('rounded-full px-3 py-1 text-sm font-medium transition-colors',
                fields.geographic_scope === value ? 'bg-teal-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
