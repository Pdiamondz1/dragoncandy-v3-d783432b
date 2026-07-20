import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { TIER_LIMITS } from '@/types/campaignMedia';
import type { DeliveryTier } from '@/types/campaignMedia';
import { mapDeliveryType, mapDeliveryTierToDb } from '@/lib/campaignUtils';
import { deadlineForTier, tierForDeadline, todayISO } from '@/lib/deliverySchedule';
import { cn } from '@/lib/utils';
import { Sparkles, Rocket, Package } from 'lucide-react';

type DbDeliveryType = 'standard' | 'expedited' | 'dragonrush';

export interface DeliverySchedulePatch {
  deadline: string;
  delivery_type: DbDeliveryType;
  tier_reasoning?: string;
}

interface DeliveryScheduleSelectorProps {
  deadline: string;
  deliveryType: DbDeliveryType;
  tierReasoning: string;
  onChange: (patch: DeliverySchedulePatch) => void;
}

const TIER_ORDER: DeliveryTier[] = ['dragondash', 'express', 'standard'];

const TIER_ICONS: Record<DeliveryTier, typeof Sparkles> = {
  dragondash: Sparkles,
  express: Rocket,
  standard: Package,
};

function formatFee(fee: number): string {
  return fee > 0 ? `+$${fee}` : 'Free';
}

/**
 * The single delivery control: picking a speed sets both the tier and the deadline.
 *
 * These used to be two independent controls (`TimelinePicker` wrote only `deadline`,
 * `TierBadge` wrote only `delivery_type`), which let a campaign promise a weekend
 * turnaround while being priced and timed as Standard. Emitting one patch makes that
 * state unrepresentable — there is no way to set one field without the other.
 */
export function DeliveryScheduleSelector({
  deadline,
  deliveryType,
  tierReasoning,
  onChange,
}: DeliveryScheduleSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);

  // Highlight from `delivery_type`, not the deadline: it is the field that carries the
  // fee and the SLA, so on a pre-existing row where the two disagree we show what was
  // actually bought. Nothing is rewritten on mount — the first interaction heals it.
  const selectedTier = mapDeliveryType(deliveryType) ?? tierForDeadline(deadline);

  const emit = (nextDeadline: string) => {
    const nextTier = tierForDeadline(nextDeadline);
    const nextDeliveryType = mapDeliveryTierToDb(nextTier) as DbDeliveryType;

    onChange({
      deadline: nextDeadline,
      delivery_type: nextDeliveryType,
      // The rationale describes the tier the AI originally chose. Once the user lands on
      // a different one it is actively wrong, so drop it rather than leave stale copy.
      ...(nextDeliveryType !== deliveryType ? { tier_reasoning: '' } : {}),
    });
  };

  const handleCustomDate = (value: string) => {
    // Ignore a cleared input: emitting an empty deadline would silently reset the tier
    // (and the fee) to Standard. The three options always produce a real date.
    if (!value) return;
    emit(value);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          When do you need this?
        </label>
        <WhyExpander
          expanderKey="delivery_tier"
          title="What do the tiers mean?"
          body="DragonDash = same-day. Express = 48 hours. Standard = 5 business days."
        />
      </div>

      <div className="grid grid-cols-1 gap-2 mt-2 lg:grid-cols-3">
        {TIER_ORDER.map((tier) => {
          const config = TIER_LIMITS[tier];
          const Icon = TIER_ICONS[tier];
          const isSelected = selectedTier === tier;

          return (
            <button
              key={tier}
              type="button"
              aria-pressed={isSelected}
              onClick={() => emit(deadlineForTier(tier))}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors border',
                isSelected
                  ? 'bg-teal-50 border-dc-teal text-dc-teal-dark'
                  : 'bg-white border-dc-teal/20 text-gray-600 hover:border-dc-teal/40'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{config.label}</p>
                <p className="text-[10px] text-gray-400">{config.timeframe}</p>
              </div>
              <span
                className={cn(
                  'ml-auto pl-2 text-xs font-medium flex-shrink-0',
                  config.fee > 0 ? 'text-dc-pink-accent' : 'text-gray-400'
                )}
              >
                {formatFee(config.fee)}
              </span>
            </button>
          );
        })}
      </div>

      {tierReasoning && (
        <p className="text-xs text-gray-500 mt-1.5 italic">{tierReasoning}</p>
      )}

      {/* Custom date — the tier follows the date, so the two can never disagree. */}
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
            min={todayISO()}
            onChange={(e) => handleCustomDate(e.target.value)}
            className="mt-1.5 text-sm w-48"
          />
        )}
      </div>

      {deadline && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          Deadline:{' '}
          {new Date(`${deadline}T00:00:00`).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}
