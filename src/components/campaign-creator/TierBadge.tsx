import { useState } from 'react';
import type { DeliveryTier } from '@/types/campaignMedia';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { TIER_LIMITS } from '@/types/campaignMedia';
import { mapDeliveryType } from '@/lib/campaignUtils';
import { cn } from '@/lib/utils';
import { Sparkles, Rocket, Package } from 'lucide-react';

interface TierBadgeProps {
  deliveryType: 'standard' | 'expedited' | 'dragonrush';
  tierReasoning: string;
  onChange: (deliveryType: 'standard' | 'expedited' | 'dragonrush') => void;
}

const TIER_OPTIONS: { dbValue: 'standard' | 'expedited' | 'dragonrush'; tier: DeliveryTier }[] = [
  { dbValue: 'dragonrush', tier: 'dragondash' },
  { dbValue: 'expedited', tier: 'express' },
  { dbValue: 'standard', tier: 'standard' },
];

export function TierBadge({ deliveryType, tierReasoning, onChange }: TierBadgeProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const currentTier = mapDeliveryType(deliveryType);
  const config = currentTier ? TIER_LIMITS[currentTier] : null;

  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Tier</label>
      <div className="mt-2 flex items-center gap-3">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
          deliveryType === 'dragonrush' ? 'bg-teal-100 text-teal-800' :
          deliveryType === 'expedited' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        )}>
          {deliveryType === 'dragonrush' && <Sparkles className="w-3.5 h-3.5 inline" />}
          {deliveryType === 'expedited' && <Rocket className="w-3.5 h-3.5 inline" />}
          {deliveryType === 'standard' && <Package className="w-3.5 h-3.5 inline" />}
          {config?.label || 'Standard'} · {config?.timeframe}
          {config && config.fee > 0 ? ` · +$${config.fee}` : ''}
        </span>
        <WhyExpander expanderKey="delivery_tier" title="What do the tiers mean?" body="DragonDash = same-day. Express = 48 hours. Standard = 5 business days." />
        <button type="button" className="text-xs text-teal-500 hover:text-teal-700"
          onClick={() => setShowDropdown(!showDropdown)}>
          Change
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1 italic">{tierReasoning}</p>
      {showDropdown && (
        <div className="mt-2 space-y-1">
          {TIER_OPTIONS.map(({ dbValue, tier }) => (
            <button key={dbValue} type="button"
              onClick={() => { onChange(dbValue); setShowDropdown(false); }}
              className={cn(
                'w-full text-left rounded-lg px-3 py-2 text-sm',
                deliveryType === dbValue ? 'bg-teal-50 text-teal-800' : 'hover:bg-gray-50'
              )}>
              {tier === 'dragondash' ? <Sparkles className="w-3.5 h-3.5 inline mr-1" /> : tier === 'express' ? <Rocket className="w-3.5 h-3.5 inline mr-1" /> : <Package className="w-3.5 h-3.5 inline mr-1" />}
              {TIER_LIMITS[tier].label} — {TIER_LIMITS[tier].timeframe}
              {TIER_LIMITS[tier].fee > 0 && ` (+$${TIER_LIMITS[tier].fee})`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
