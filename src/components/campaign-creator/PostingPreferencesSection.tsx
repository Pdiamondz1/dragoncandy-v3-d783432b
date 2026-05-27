import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostingPreferences } from '@/types/campaignCreator';

interface PostingPreferencesSectionProps {
  preferences: PostingPreferences;
  onChange: (prefs: PostingPreferences) => void;
  deliverableCount: number;
}

const WINDOW_OPTIONS: { label: string; days: 7 | 14 | 21 | 30 }[] = [
  { label: '1 Week', days: 7 },
  { label: '2 Weeks', days: 14 },
  { label: '3 Weeks', days: 21 },
  { label: '1 Month', days: 30 },
];

const DAY_OPTIONS: { label: string; value: string }[] = [
  { label: 'M', value: 'monday' },
  { label: 'T', value: 'tuesday' },
  { label: 'W', value: 'wednesday' },
  { label: 'T', value: 'thursday' },
  { label: 'F', value: 'friday' },
  { label: 'S', value: 'saturday' },
  { label: 'S', value: 'sunday' },
];

function generatePreviewText(prefs: PostingPreferences, deliverableCount: number): string {
  const windowLabel =
    prefs.spread_window_days === 7
      ? '1 week'
      : prefs.spread_window_days === 14
        ? '2 weeks'
        : prefs.spread_window_days === 21
          ? '3 weeks'
          : '1 month';

  let text = `${deliverableCount} deliverable${deliverableCount !== 1 ? 's' : ''} spread over ${windowLabel}.`;

  if (prefs.preferred_days?.length) {
    const dayNames = prefs.preferred_days.map(
      (d) => d.charAt(0).toUpperCase() + d.slice(1) + 's'
    );
    text += ` Posting on ${dayNames.join(' & ')}.`;
  }

  if (prefs.spread_strategy === 'auto') {
    text = `${deliverableCount} deliverable${deliverableCount !== 1 ? 's' : ''} — Donny will pick the best days and times for each platform.`;
  }

  return text;
}

export function PostingPreferencesSection({
  preferences,
  onChange,
  deliverableCount,
}: PostingPreferencesSectionProps) {
  const isCustom = preferences.spread_strategy === 'custom';

  function handleStrategySelect(strategy: 'auto' | 'custom') {
    onChange({ ...preferences, spread_strategy: strategy });
  }

  function handleWindowSelect(days: 7 | 14 | 21 | 30) {
    onChange({ ...preferences, spread_window_days: days });
  }

  function handleDayToggle(day: string) {
    const current = preferences.preferred_days ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    onChange({ ...preferences, preferred_days: next });
  }

  function handleToggleAutoSchedule() {
    onChange({
      ...preferences,
      auto_schedule_on_approval: !preferences.auto_schedule_on_approval,
    });
  }

  const previewText = generatePreviewText(preferences, deliverableCount);

  return (
    <div className="space-y-4">
      {/* Step 1: Spread strategy */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">
          How do you want to spread your content?
        </p>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleStrategySelect('auto')}
            className={cn(
              'rounded-full px-4 py-2 text-sm border transition-colors',
              !isCustom
                ? 'bg-teal-50 border-dc-teal text-dc-teal-dark font-semibold'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            Let Donny decide
          </button>
          <button
            type="button"
            onClick={() => handleStrategySelect('custom')}
            className={cn(
              'rounded-full px-4 py-2 text-sm border transition-colors',
              isCustom
                ? 'bg-teal-50 border-dc-teal text-dc-teal-dark font-semibold'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            )}
          >
            I'll pick the days
          </button>
        </div>
      </div>

      {/* Step 2: Custom sub-questions (revealed when custom selected) */}
      {isCustom && (
        <div className="border-l-2 border-dc-teal pl-4 space-y-4">
          {/* Window picker */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Over how long?</p>
            <div className="flex gap-2 flex-wrap">
              {WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => handleWindowSelect(opt.days)}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm border transition-colors',
                    preferences.spread_window_days === opt.days
                      ? 'bg-teal-50 border-dc-teal text-dc-teal-dark font-semibold'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day preferences */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Any day preferences?</p>
            <div className="flex gap-2">
              {DAY_OPTIONS.map((day) => {
                const isSelected = (preferences.preferred_days ?? []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-label={day.value}
                    aria-pressed={isSelected}
                    onClick={() => handleDayToggle(day.value)}
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm select-none',
                      isSelected
                        ? 'border-2 border-dc-teal bg-dc-teal/15 text-dc-teal font-bold cursor-pointer'
                        : 'border border-gray-300 text-gray-500 cursor-pointer hover:border-gray-400'
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <p className="text-gray-400 text-[11px] mt-1.5">
              Optional — skip to let Donny optimize
            </p>
          </div>
        </div>
      )}

      {/* Auto-schedule toggle */}
      <div className="flex justify-between items-center pt-3 border-t border-gray-200 mt-3">
        <div>
          <p className="text-sm text-gray-900">Auto-schedule after approval</p>
          <p className="text-[11px] text-gray-400">
            Donny creates the schedule when content is approved
          </p>
        </div>
        <div
          role="switch"
          aria-checked={preferences.auto_schedule_on_approval}
          tabIndex={0}
          onClick={handleToggleAutoSchedule}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleAutoSchedule();
            }
          }}
          className={cn(
            'w-11 h-6 rounded-full relative cursor-pointer transition-colors',
            preferences.auto_schedule_on_approval ? 'bg-dc-teal' : 'bg-gray-200'
          )}
        >
          <span
            className={cn(
              'w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all',
              preferences.auto_schedule_on_approval ? 'right-0.5' : 'left-0.5'
            )}
          />
        </div>
      </div>

      {/* Donny Preview card */}
      <div className="bg-dc-teal/5 border border-dc-teal/20 rounded-xl p-3 mt-3">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-dc-teal" />
          <span className="text-dc-teal font-semibold text-xs">Donny's Preview</span>
        </div>
        <p className="text-xs text-dc-text-muted mt-1">{previewText}</p>
      </div>
    </div>
  );
}
