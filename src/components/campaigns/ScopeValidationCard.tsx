import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { ScopeValidationResult } from '@/hooks/useScopeValidation';

interface ScopeValidationCardProps {
  validation: ScopeValidationResult;
}

const STATUS_CONFIG = {
  ok: {
    border: 'border-teal-300',
    Icon: CheckCircle,
    iconColor: 'text-teal-500',
    textColor: 'text-teal-700',
  },
  warn: {
    border: 'border-yellow-400',
    Icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    textColor: 'text-yellow-700',
  },
  block: {
    border: 'border-red-400',
    Icon: XCircle,
    iconColor: 'text-red-500',
    textColor: 'text-red-700',
  },
} as const;

function formatTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

export const ScopeValidationCard: React.FC<ScopeValidationCardProps> = ({
  validation,
}) => {
  const { totalMinutes, status, statusMessage, suggestion, footageSavingsMinutes, breakdown } =
    validation;
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.Icon;

  return (
    <Card className={`mb-6 rounded-2xl border ${config.border}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-600" />
          Estimated Creator Time
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status row */}
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-5 w-5 shrink-0 ${config.iconColor}`} />
          <span className={`text-sm font-medium ${config.textColor}`}>
            {statusMessage}
          </span>
          <span className="text-sm text-gray-500 ml-auto">
            ~{formatTime(totalMinutes)}
          </span>
        </div>

        {/* Breakdown */}
        <div className="space-y-1">
          {breakdown.map((item, i) => (
            <div
              key={i}
              className="flex justify-between items-center text-sm text-gray-500"
            >
              <span>{item.label}</span>
              <span>{item.minutes} min</span>
            </div>
          ))}
        </div>

        {/* Footage savings */}
        {footageSavingsMinutes > 0 && (
          <div className="flex items-center gap-2 text-sm text-teal-700">
            <CheckCircle className="h-4 w-4 shrink-0 text-teal-500" />
            <span>Your footage saves ~{footageSavingsMinutes} min</span>
          </div>
        )}

        {/* Quick-fix suggestion */}
        {suggestion && (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Suggestion: </span>
              {suggestion}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

