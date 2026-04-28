import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Package, Rocket, Sparkles } from 'lucide-react';

// Re-export from canonical location for backward compatibility
export type { DeliveryTier as DeliveryType } from '@/types/campaignMedia';
import type { DeliveryTier } from '@/types/campaignMedia';

interface DeliveryOption {
  type: DeliveryTier;
  icon: React.ReactNode;
  label: string;
  timeframe: string;
  description: string;
  fee: string;
  feeAmount: number;
  forcesFixedPrice: boolean;
}

const deliveryOptions: DeliveryOption[] = [
  {
    type: 'standard',
    icon: <Package className="h-6 w-6" />,
    label: 'Standard Delivery',
    timeframe: '5–7 days',
    description: 'Best for full production campaigns with flexible timelines',
    fee: 'No extra fee',
    feeAmount: 0,
    forcesFixedPrice: false,
  },
  {
    type: 'express',
    icon: <Rocket className="h-6 w-6" />,
    label: 'Express Delivery',
    timeframe: '24–48 hours',
    description: 'Quick turnaround for time-sensitive content',
    fee: '+ $25 rush fee',
    feeAmount: 25,
    forcesFixedPrice: false,
  },
  {
    type: 'dragondash',
    icon: <Sparkles className="h-6 w-6" />,
    label: 'DragonDash Delivery',
    timeframe: '1–3 hours',
    description: 'Ultra-fast delivery for urgent needs. Fixed price only.',
    fee: '+ $75 premium fee',
    feeAmount: 75,
    forcesFixedPrice: true,
  },
];

interface DeliveryTypeSelectorProps {
  value: DeliveryTier;
  onChange: (type: DeliveryTier) => void;
  onFeeChange?: (fee: number) => void;
}

const DeliveryTypeSelector: React.FC<DeliveryTypeSelectorProps> = ({
  value,
  onChange,
  onFeeChange,
}) => {
  const handleSelect = (option: DeliveryOption) => {
    onChange(option.type);
    onFeeChange?.(option.feeAmount);
  };

  return (
    <div className="space-y-3">
      <label className="text-base font-semibold text-foreground">
        Delivery Speed
      </label>
      <p className="text-sm text-muted-foreground">
        Choose how quickly you need the content delivered
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {deliveryOptions.map((option) => (
          <Card
            key={option.type}
            onClick={() => handleSelect(option)}
            className={cn(
              "relative cursor-pointer p-4 transition-colors hover:shadow-md",
              value === option.type
                ? "ring-2 ring-primary border-primary bg-primary/5"
                : "hover:border-primary/50"
            )}
          >
            {/* Badge for DragonDash */}
            {option.type === 'dragondash' && (
              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                Premium
              </div>
            )}

            <div className="flex flex-col items-center text-center space-y-3">
              {/* Icon */}
              <div className={cn(
                "p-3 rounded-full",
                option.type === 'standard' && "bg-green-100 text-green-600",
                option.type === 'express' && "bg-yellow-100 text-yellow-600",
                option.type === 'dragondash' && "bg-gradient-to-r from-orange-100 to-pink-100 text-orange-600"
              )}>
                {option.icon}
              </div>

              {/* Label */}
              <div>
                <h4 className="font-semibold text-foreground">{option.label}</h4>
                <p className="text-sm font-medium text-primary">{option.timeframe}</p>
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground">
                {option.description}
              </p>

              {/* Fee */}
              <div className={cn(
                "text-sm font-medium px-3 py-1 rounded-full",
                option.feeAmount === 0
                  ? "bg-green-100 text-green-700"
                  : "bg-orange-100 text-orange-700"
              )}>
                {option.fee}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DeliveryTypeSelector;
export { deliveryOptions };
