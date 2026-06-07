import { useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { WebOnly } from '@/components/platform/WebOnly';
import {
  TIER_FEATURES,
  TIER_PRICES,
  tierMeetsRequirement,
  type TierName,
} from '@/lib/pricing/tier-features';
import { SEAT_LIMITS } from '@/types/org';

interface TierCard {
  tier: TierName;
  name: string;
  tagline: string;
  popular?: boolean;
}

const TIERS: TierCard[] = [
  { tier: 'free', name: 'Free', tagline: 'Try DragonCandy risk-free' },
  { tier: 'starter', name: 'Starter', tagline: 'Launch your first campaign' },
  { tier: 'growth', name: 'Growth', tagline: 'Scale content across locations', popular: true },
  { tier: 'pro', name: 'Pro', tagline: 'Full platform power for teams' },
];

interface TierComparisonGridProps {
  highlightTier?: TierName | null;
  onSelectTier?: (tier: TierName) => void;
}

export function TierComparisonGrid({ highlightTier, onSelectTier }: TierComparisonGridProps) {
  const [annual, setAnnual] = useState(true);

  const formatPrice = (tier: TierName) => {
    const price = TIER_PRICES[tier];
    if (price.monthly === 0) return '$0';
    return annual ? `$${price.annual}` : `$${price.monthly}`;
  };

  const seatNote = (tier: TierName) => {
    const limits = SEAT_LIMITS[tier];
    if (!limits) return null;
    const included = limits.included;
    const extra = limits.maxAdditional;
    if (extra === 0) return `${included} seat`;
    if (extra === null) return `${included} seats included, unlimited add-ons`;
    return `${included} seat${included > 1 ? 's' : ''} included, up to ${extra} add-ons at $${limits.additionalPriceMonthly}/mo each`;
  };

  const ctaLabel = (tier: TierName) => {
    if (tier === 'free') return 'Get Started';
    return 'Choose Plan';
  };

  const isHighlighted = (tier: TierName) => highlightTier === tier;

  return (
    <div className="w-full">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={`text-sm font-medium ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>
          Monthly
        </span>
        <Switch
          checked={annual}
          onCheckedChange={setAnnual}
          aria-label="Toggle annual billing"
          className="data-[state=checked]:bg-teal-500"
        />
        <span className={`text-sm font-medium ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
          Annual
        </span>
        {annual && (
          <span className="ml-1 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
            Save 20%
          </span>
        )}
      </div>

      {/* Tier cards - horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible md:pb-0">
        {TIERS.map(({ tier, name, tagline, popular }) => (
          <div
            key={tier}
            className={`
              relative flex min-w-[260px] flex-col rounded-2xl bg-white p-6 shadow-md snap-center
              md:min-w-0
              ${popular ? 'border-2 border-teal-400' : 'border border-gray-200'}
              ${isHighlighted(tier) ? 'ring-4 ring-teal-400/50 scale-[1.02]' : ''}
              transition-all duration-200
            `}
          >
            {/* Popular badge */}
            {popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-500 px-4 py-1 text-xs font-bold text-white whitespace-nowrap">
                Most Popular
              </span>
            )}

            {/* Header */}
            <h3 className="mt-2 text-lg font-bold text-gray-900">{name}</h3>
            <p className="text-sm text-gray-500">{tagline}</p>

            {/* Price */}
            <div className="mt-4">
              <span className="text-4xl font-extrabold text-gray-900">{formatPrice(tier)}</span>
              {TIER_PRICES[tier].monthly > 0 && (
                <span className="text-sm text-gray-500">/mo</span>
              )}
            </div>
            {annual && TIER_PRICES[tier].monthly > 0 && (
              <p className="mt-1 text-xs text-gray-400">billed annually</p>
            )}

            {/* Seat info */}
            {(() => { const note = seatNote(tier); return note ? <p className="mt-3 text-xs text-gray-500">{note}</p> : null; })()}

            {/* CTA */}
            <WebOnly>
              <Button
                onClick={() => onSelectTier?.(tier)}
                className={`mt-6 w-full rounded-full font-semibold ${
                  tier === 'free' && !isHighlighted(tier)
                    ? 'bg-white border border-gray-300 text-gray-800 hover:bg-gray-50'
                    : 'bg-teal-500 hover:bg-teal-600 text-white'
                }`}
              >
                {ctaLabel(tier)}
              </Button>
            </WebOnly>

            {/* Feature list */}
            <ul className="mt-6 flex flex-col gap-3">
              {TIER_FEATURES.map((feature) => {
                const included = tierMeetsRequirement(tier, feature.requiredTier);
                return (
                  <li key={feature.key} className="flex items-start gap-2 text-sm">
                    {included ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
                    ) : (
                      <Minus className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
                    )}
                    <span className={included ? 'text-gray-700' : 'text-gray-400'}>
                      {feature.label}
                      {included && feature.rateLimit && tier === feature.requiredTier && (
                        <span className="ml-1 text-xs text-gray-400">
                          ({feature.rateLimit.limit}/{feature.rateLimit.periodDays}d)
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
