import React from 'react';
import { Clock, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DragonDashTimerProps {
  formattedTime: string;
  percentageRemaining: number;
  status: 'not_started' | 'in_progress' | 'expired' | 'completed';
  deliveryType: string;
  className?: string;
}

const DragonDashTimer: React.FC<DragonDashTimerProps> = ({
  formattedTime,
  percentageRemaining,
  status,
  deliveryType,
  className,
}) => {
  const getStatusColor = () => {
    if (status === 'completed') return 'text-green-600 bg-green-50 border-green-200';
    if (status === 'expired') return 'text-red-600 bg-red-50 border-red-200';
    if (percentageRemaining > 50) return 'text-green-600 bg-green-50 border-green-200';
    if (percentageRemaining > 25) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getProgressColor = () => {
    if (status === 'completed') return 'bg-green-500';
    if (status === 'expired') return 'bg-red-500';
    if (percentageRemaining > 50) return 'bg-green-500';
    if (percentageRemaining > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getIcon = () => {
    if (status === 'completed') return <CheckCircle className="h-5 w-5" />;
    if (status === 'expired') return <AlertTriangle className="h-5 w-5" />;
    if (deliveryType === 'dragonrush') return <Zap className="h-5 w-5" />;
    return <Clock className="h-5 w-5" />;
  };

  const getDeliveryLabel = () => {
    switch (deliveryType) {
      case 'dragonrush': return 'DragonRush Priority';
      case 'expedited': return 'Expedited Delivery';
      default: return 'Standard Delivery';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'expired': return 'Time Expired';
      case 'not_started': return 'Not Started';
      default: return formattedTime;
    }
  };

  return (
    <div className={cn(
      "rounded-lg border p-4 transition-all",
      getStatusColor(),
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="font-medium">{getDeliveryLabel()}</span>
        </div>
        <span className="text-2xl font-bold font-mono">
          {getStatusLabel()}
        </span>
      </div>

      {status === 'in_progress' && (
        <div className="mt-3">
          <div className="h-2 bg-white/50 rounded-full overflow-hidden">
            <div 
              className={cn("h-full transition-all duration-1000", getProgressColor())}
              style={{ width: `${percentageRemaining}%` }}
            />
          </div>
          <p className="text-xs mt-1 opacity-75">
            {Math.round(percentageRemaining)}% time remaining
          </p>
        </div>
      )}

      {status === 'expired' && (
        <p className="text-sm mt-2 opacity-90">
          Deadline has passed. Contact the business to discuss next steps.
        </p>
      )}

      {status === 'completed' && (
        <p className="text-sm mt-2 opacity-90">
          Content has been approved and payment released.
        </p>
      )}
    </div>
  );
};

export default DragonDashTimer;
