import { useState, useEffect, useCallback } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useReviewExtension } from "@/hooks/useReviewExtension";
import { cn } from "@/lib/utils";

interface ReviewCountdownTimerProps {
  collaborationId: string;
  submittedAt: string | null;
  reviewExtended: boolean;
  deliveryType: string;
  contentStatus: string | null;
}

const BASE_HOURS: Record<string, number> = {
  standard: 48,
  express: 24,
  dragonrush: 4,
};

const EXTENSION_HOURS: Record<string, number> = {
  standard: 24,
  express: 24,
  dragonrush: 2,
};

function getDeadlineMs(
  submittedAt: string,
  deliveryType: string,
  reviewExtended: boolean
): number {
  const base = BASE_HOURS[deliveryType] ?? BASE_HOURS.standard;
  const ext = reviewExtended
    ? (EXTENSION_HOURS[deliveryType] ?? EXTENSION_HOURS.standard)
    : 0;
  const totalMs = (base + ext) * 60 * 60 * 1000;
  return new Date(submittedAt).getTime() + totalMs;
}

function getTotalWindowMs(
  deliveryType: string,
  reviewExtended: boolean
): number {
  const base = BASE_HOURS[deliveryType] ?? BASE_HOURS.standard;
  const ext = reviewExtended
    ? (EXTENSION_HOURS[deliveryType] ?? EXTENSION_HOURS.standard)
    : 0;
  return (base + ext) * 60 * 60 * 1000;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0h 0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function getColorClasses(pct: number) {
  if (pct > 50) return { container: "border-green-300 bg-green-50", bar: "bg-green-500", text: "text-green-700" };
  if (pct > 25) return { container: "border-yellow-300 bg-yellow-50", bar: "bg-yellow-500", text: "text-yellow-700" };
  return { container: "border-red-300 bg-red-50", bar: "bg-red-500", text: "text-red-700" };
}

export function ReviewCountdownTimer({
  collaborationId,
  submittedAt,
  reviewExtended,
  deliveryType,
  contentStatus,
}: ReviewCountdownTimerProps) {
  const extendMutation = useReviewExtension();

  const calcState = useCallback(() => {
    if (!submittedAt) return { remaining: 0, pct: 0 };
    const deadline = getDeadlineMs(submittedAt, deliveryType, reviewExtended);
    const total = getTotalWindowMs(deliveryType, reviewExtended);
    const remaining = Math.max(0, deadline - Date.now());
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    return { remaining, pct };
  }, [submittedAt, deliveryType, reviewExtended]);

  const [state, setState] = useState(calcState);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setState(calcState());

    const id = setInterval(() => {
      const next = calcState();
      setState(next);
      if (next.remaining <= 0) {
        setExpired(true);
        clearInterval(id);
      }
    }, 1_000);

    return () => clearInterval(id);
  }, [calcState]);

  // Don't render unless content is submitted with a timestamp
  if (contentStatus !== "submitted" || !submittedAt) return null;

  // Brief "processing" message right after expiry, then hide
  if (expired) {
    return (
      <div className="rounded-xl border border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-600">
        <Clock className="mx-auto mb-1 h-5 w-5 animate-spin" />
        Auto-approval processing...
      </div>
    );
  }

  const colors = getColorClasses(state.pct);

  return (
    <div className={cn("rounded-xl border p-4 transition-colors", colors.container)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {state.pct <= 25 ? (
            <AlertTriangle className={cn("h-5 w-5", colors.text)} />
          ) : (
            <Clock className={cn("h-5 w-5", colors.text)} />
          )}
          <span className={cn("text-2xl font-bold font-mono", colors.text)}>
            {formatRemaining(state.remaining)} left to review
          </span>
        </div>
      </div>

      {/* Subtext */}
      <p className="mt-1 text-xs text-gray-500">
        Content will be auto-approved when the timer expires.
      </p>

      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-white/60 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-1000", colors.bar)}
          style={{ width: `${state.pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs opacity-75">
        {Math.round(state.pct)}% review time remaining
      </p>

      {/* Extension button */}
      <div className="mt-3">
        {reviewExtended ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button variant="outline" size="sm" disabled>
                  Need more time?
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Extension already used</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="outline"
            size="sm"
            isLoading={extendMutation.isPending}
            onClick={() => extendMutation.mutate({ collaborationId })}
          >
            Need more time?
          </Button>
        )}
      </div>
    </div>
  );
}
