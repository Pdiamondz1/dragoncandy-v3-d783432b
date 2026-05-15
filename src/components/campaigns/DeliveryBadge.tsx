/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Package, Rocket, Sparkles, Clock } from 'lucide-react';
import type { DeliveryTier } from '@/types/campaignMedia';

type DeliveryType = DeliveryTier;

interface DeliveryBadgeProps {
  deliveryType: DeliveryType;
  size?: 'sm' | 'md' | 'lg';
  showTimeframe?: boolean;
  className?: string;
}

const deliveryConfig = {
  standard: {
    icon: Package,
    label: 'Standard',
    timeframe: '5–7 days',
    bgClass: 'bg-green-100 text-green-700 border-green-200',
    iconClass: 'text-green-600',
  },
  express: {
    icon: Rocket,
    label: 'Express',
    timeframe: '24–48 hrs',
    bgClass: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    iconClass: 'text-yellow-600',
  },
  dragondash: {
    icon: Sparkles,
    label: 'DragonDash',
    timeframe: '1–3 hrs',
    bgClass: 'bg-gradient-to-r from-orange-100 to-pink-100 text-orange-700 border-orange-200',
    iconClass: 'text-orange-600',
  },
};

export const DeliveryBadge: React.FC<DeliveryBadgeProps> = ({
  deliveryType,
  size = 'md',
  showTimeframe = true,
  className,
}) => {
  const config = deliveryConfig[deliveryType] || deliveryConfig.standard;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium inline-flex items-center gap-1.5",
        config.bgClass,
        sizeClasses[size],
        className
      )}
    >
      <Icon className={cn(iconSizes[size], config.iconClass)} />
      <span>{config.label}</span>
      {showTimeframe && (
        <>
          <span className="opacity-50">•</span>
          <Clock className={cn(iconSizes[size], "opacity-70")} />
          <span className="opacity-80">{config.timeframe}</span>
        </>
      )}
    </Badge>
  );
};

export { deliveryConfig };
