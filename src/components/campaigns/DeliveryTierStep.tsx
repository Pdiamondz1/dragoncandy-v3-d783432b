import type { DeliveryTier } from '@/types/campaignMedia';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { CheckCircle2, Sparkles, Rocket, Package } from 'lucide-react';

interface DeliveryTierStepProps {
  selectedTier: DeliveryTier | null;
  onSelect: (tier: DeliveryTier) => void;
  onContinue: () => void;
}

const TIER_META: Record<
  DeliveryTier,
  {
    icon: typeof Sparkles;
    timeColor: string;
    iconBg: string;
    iconShadow?: string;
    priceBadge: { bg: string; text: string; label: string };
    description: string;
  }
> = {
  dragondash: {
    icon: Sparkles,
    timeColor: 'text-dc-teal',
    iconBg: 'bg-gradient-to-br from-dc-teal to-dc-teal-dark',
    iconShadow: 'shadow-[0_0_16px_rgba(77,217,192,0.35)]',
    priceBadge: { bg: 'bg-amber-100', text: 'text-amber-700', label: '$$$ Premium' },
    description: 'Best for: 1–2 simple posts, quick photo/reel',
  },
  express: {
    icon: Rocket,
    timeColor: 'text-amber-500',
    iconBg: 'bg-gradient-to-br from-amber-200 to-amber-500',
    priceBadge: { bg: 'bg-sky-100', text: 'text-sky-700', label: '$$ Standard' },
    description: 'Best for: 2–4 deliverables, edited reels',
  },
  standard: {
    icon: Package,
    timeColor: 'text-emerald-500',
    iconBg: 'bg-gradient-to-br from-emerald-200 to-emerald-400',
    priceBadge: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '$ Value' },
    description: 'Best for: 5–10 deliverables, full campaigns',
  },
};

const TIER_ORDER: DeliveryTier[] = ['dragondash', 'express', 'standard'];

export const DeliveryTierStep = ({ selectedTier, onSelect, onContinue }: DeliveryTierStepProps) => {
  return (
    <div className="px-4 py-6">
      {/* Heading */}
      <h2 className="text-2xl font-bold text-gray-900 mb-1">How fast do you need it?</h2>
      <p className="text-sm text-gray-500 mb-6">
        Choose your delivery speed — this determines scope and pricing
      </p>

      {/* Tier Cards */}
      <div className="space-y-4">
        {TIER_ORDER.map((tier) => {
          const limits = TIER_LIMITS[tier];
          const meta = TIER_META[tier];
          const isSelected = selectedTier === tier;

          return (
            <div
              key={tier}
              onClick={() => onSelect(tier)}
              className={[
                'relative rounded-2xl border-2 p-5 cursor-pointer transition-colors',
                isSelected
                  ? 'border-dc-teal bg-dc-teal/5'
                  : 'border-gray-200 bg-white hover:border-dc-teal/50',
              ].join(' ')}
            >
              {/* DragonDash PREMIUM badge */}
              {tier === 'dragondash' && !isSelected && (
                <span className="absolute top-3 right-3 bg-gradient-to-r from-dc-teal to-dc-teal-dark text-white text-[11px] font-bold rounded-full px-2.5 py-0.5">
                  PREMIUM
                </span>
              )}

              {/* Selected checkmark */}
              {isSelected && (
                <span className="absolute top-3 right-3">
                  <CheckCircle2 className="w-5 h-5 text-dc-teal" aria-hidden="true" />
                </span>
              )}

              <div className="flex gap-3.5">
                {/* Icon circle */}
                <div
                  className={[
                    'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                    meta.iconBg,
                    meta.iconShadow ?? '',
                  ].join(' ')}
                >
                  <meta.icon className="w-6 h-6 text-white" />
                </div>

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-extrabold text-gray-900 leading-tight">
                    {limits.label}
                  </p>
                  <p className={['text-sm font-semibold', meta.timeColor].join(' ')}>
                    {limits.timeframe}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{meta.description}</p>

                  {/* Bottom row */}
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className={[
                        'text-[11px] font-bold px-2.5 py-0.5 rounded-full',
                        meta.priceBadge.bg,
                        meta.priceBadge.text,
                      ].join(' ')}
                    >
                      {meta.priceBadge.label}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Max {limits.maxDeliverables} deliverables
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Continue button */}
      <button
        onClick={onContinue}
        disabled={selectedTier === null}
        className="w-full rounded-full bg-dc-teal hover:bg-dc-teal/90 text-white font-semibold py-3 text-base mt-6 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};
