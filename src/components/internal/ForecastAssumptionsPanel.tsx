/**
 * Admin-editable forecast assumptions — one labelled numeric input per tunable value, saved on blur
 * to aios_dashboard_settings via useUpdateForecastAssumption. The /internal/forecast page is
 * admin-gated, so there is no read-only branch. Dark ops-deck styling (mirrors InternalExpenses).
 */
import { toast } from 'sonner';
import {
  FORECAST_KEYS,
  type ForecastAssumptions,
  type ForecastKey,
} from '@/lib/internal/forecastModel';
import { useUpdateForecastAssumption } from '@/hooks/internal/useForecastAssumptions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Field = keyof ForecastAssumptions;

const LABELS: Record<Field, string> = {
  registered_per_dau: 'Registered users per DAU',
  db_kb_per_user: 'DB size per registered user',
  storage_kb_per_user: 'File storage per registered user',
  peak_concurrency_pct: 'Peak concurrency (of DAU)',
  requests_per_dau: 'Media requests per DAU / day',
  ai_cost_per_dau_cents: 'AI serving cost per DAU / mo',
  business_share_pct: 'Businesses (share of users)',
  paying_conversion_pct: 'Paid conversion (of businesses)',
  arpu_usd: 'Revenue per paying business',
};

const UNITS: Record<Field, string> = {
  registered_per_dau: '×',
  db_kb_per_user: 'KB',
  storage_kb_per_user: 'KB',
  peak_concurrency_pct: '%',
  requests_per_dau: '×',
  ai_cost_per_dau_cents: '¢',
  business_share_pct: '%',
  paying_conversion_pct: '%',
  arpu_usd: '$',
};

interface AssumptionFieldProps {
  fieldKey: ForecastKey;
  field: Field;
  value: number;
  hint?: string;
  onSave: (key: ForecastKey, value: number) => void;
}

function AssumptionField({ fieldKey, field, value, hint, onSave }: AssumptionFieldProps) {
  const unit = UNITS[field];

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.currentTarget.value);
    if (Number.isFinite(parsed) && parsed !== value) {
      onSave(fieldKey, parsed);
    }
  };

  return (
    <div>
      <Label htmlFor={fieldKey} className="text-xs font-medium text-white/70">
        {LABELS[field]}
      </Label>
      <div className="relative mt-1.5">
        <Input
          id={fieldKey}
          key={value}
          inputMode="decimal"
          defaultValue={value}
          onBlur={handleBlur}
          className="border-white/15 bg-white/5 pr-11 text-white placeholder:text-white/40"
        />
        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-sm text-white/40">
          {unit}
        </span>
      </div>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

interface ForecastAssumptionsPanelProps {
  assumptions: ForecastAssumptions;
  hints?: Partial<Record<Field, string>>;
}

export function ForecastAssumptionsPanel({ assumptions, hints }: ForecastAssumptionsPanelProps) {
  const updateAssumption = useUpdateForecastAssumption();

  const handleSave = (key: ForecastKey, value: number) => {
    updateAssumption.mutate(
      { key, value },
      {
        onError: (err) => {
          console.error('Failed to save forecast assumption:', err);
          toast.error('Failed to save assumption.');
        },
      }
    );
  };

  return (
    <div className="rounded-2xl border border-dc-teal/25 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FORECAST_KEYS.map((key) => {
          const field = key.replace(/^forecast_/, '') as Field;
          return (
            <AssumptionField
              key={key}
              fieldKey={key}
              field={field}
              value={assumptions[field]}
              hint={hints?.[field]}
              onSave={handleSave}
            />
          );
        })}
      </div>
    </div>
  );
}
