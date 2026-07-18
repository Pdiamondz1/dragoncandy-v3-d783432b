import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Zap, Rocket, Clock, Calendar } from 'lucide-react';

interface TimelinePickerProps {
  deadline: string;
  onChange: (deadline: string) => void;
}

const URGENCY_OPTIONS = [
  { key: 'weekend', label: 'This Weekend', days: 4, icon: Zap, suggestion: 'DragonDash or Express' },
  { key: 'next_week', label: 'Next Week', days: 7, icon: Rocket, suggestion: 'Express' },
  { key: 'two_weeks', label: 'Within 2 Weeks', days: 14, icon: Clock, suggestion: 'Standard' },
  { key: 'flexible', label: 'Flexible', days: 21, icon: Calendar, suggestion: 'Standard' },
] as const;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function getSelectedUrgency(deadline: string): string | null {
  if (!deadline) return null;
  const diffMs = new Date(deadline).getTime() - Date.now();
  const diffDays = Math.ceil(diffMs / 86400000);
  if (diffDays <= 5) return 'weekend';
  if (diffDays <= 8) return 'next_week';
  if (diffDays <= 15) return 'two_weeks';
  if (diffDays <= 22) return 'flexible';
  return null;
}

export function TimelinePicker({ deadline, onChange }: TimelinePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const selectedKey = getSelectedUrgency(deadline);

  const handleUrgency = (days: number) => {
    onChange(addDays(days));
    setShowCustom(false);
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        When do you need this posted?
      </label>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {URGENCY_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleUrgency(opt.days)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors border',
                selectedKey === opt.key
                  ? 'bg-teal-50 border-dc-teal text-dc-teal-dark'
                  : 'bg-white border-dc-teal/20 text-gray-600 hover:border-dc-teal/40'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-[10px] text-gray-400">{opt.suggestion}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom date toggle */}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className="text-xs text-dc-teal hover:underline"
        >
          {showCustom ? 'Hide custom date' : 'Pick a specific date'}
        </button>
        {showCustom && (
          <Input
            type="date"
            value={deadline}
            min={today}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1.5 text-sm w-48"
          />
        )}
      </div>

      {deadline && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          Deadline: {new Date(deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      )}
    </div>
  );
}
