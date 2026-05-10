import { Clock, Zap, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInDays } from 'date-fns';

interface TierTimerProps {
  formattedTime: string;
  percentageRemaining: number;
  status: 'not_started' | 'in_progress' | 'expired' | 'completed';
  deliveryType: string;
  deadline?: string | null;
  className?: string;
}

function getTierConfig(deliveryType: string) {
  switch (deliveryType) {
    case 'dragonrush':
    case 'dragon_rush':
      return {
        gradient: 'from-red-500 to-red-400',
        textSize: 'text-4xl',
        icon: Zap,
        label: 'Time Remaining',
        isStandard: false,
      };
    case 'expedited':
      return {
        gradient: 'from-blue-500 to-blue-400',
        textSize: 'text-3xl',
        icon: Clock,
        label: 'Time Remaining',
        isStandard: false,
      };
    default:
      return {
        gradient: 'from-teal-400 to-teal-300',
        textSize: 'text-3xl',
        icon: Calendar,
        label: 'Due Date',
        isStandard: true,
      };
  }
}

export function TierTimer({
  formattedTime,
  percentageRemaining,
  status,
  deliveryType,
  deadline,
  className,
}: TierTimerProps) {
  const tier = getTierConfig(deliveryType);
  const Icon = tier.icon;
  const isStandard = tier.isStandard;

  const getMainDisplay = () => {
    if (status === 'expired') return 'Time Expired';
    if (status === 'completed') return 'Completed';

    if (isStandard && deadline) {
      return format(new Date(deadline), 'PPP');
    }

    return formattedTime;
  };

  const getSubDisplay = () => {
    if (status === 'expired') return 'Deadline has passed. Contact the business to discuss next steps.';
    if (status === 'completed') return 'Content approved and payment released.';

    if (isStandard && deadline) {
      const daysLeft = differenceInDays(new Date(deadline), new Date());
      if (daysLeft < 0) return 'Overdue';
      if (daysLeft === 0) return 'Due today';
      return `${daysLeft} days remaining`;
    }

    return null;
  };

  const showProgressBar = status === 'in_progress' && !isStandard;
  const subDisplay = getSubDisplay();

  return (
    <div
      className={cn(
        `bg-gradient-to-r ${tier.gradient} p-4 rounded-2xl text-center`,
        className
      )}
    >
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-white/80" />
        <span className="text-xs text-white/80 uppercase tracking-widest">
          {tier.label}
        </span>
      </div>

      <p className={cn('font-extrabold text-white font-mono', tier.textSize)}>
        {getMainDisplay()}
      </p>

      {subDisplay && (
        <p className="text-xs text-white/70 mt-1">{subDisplay}</p>
      )}

      {showProgressBar && (
        <div className="mt-3">
          <div className="h-1.5 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000"
              style={{ width: `${percentageRemaining}%` }}
            />
          </div>
          <p className="text-xs text-white/70 mt-1">
            {Math.round(percentageRemaining)}% time remaining
          </p>
        </div>
      )}
    </div>
  );
}
