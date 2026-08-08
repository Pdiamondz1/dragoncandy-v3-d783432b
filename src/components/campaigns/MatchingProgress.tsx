import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { MATCHING_STEPS, STEP_MS } from './matchingSteps';

/** One placeholder shaped like a real `CreatorMatchCard`, so results don't shift the layout in. */
const MatchCardSkeleton: React.FC = () => (
  <Card className="h-full border dark:border-border">
    <CardContent className="p-6 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-10 shrink-0" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-9 w-full rounded-full" />
    </CardContent>
  </Card>
);

/** Placeholder grid, in the same layout as the real results. */
export const MatchCardsSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => (
  <div className="grid gap-4 md:grid-cols-2" data-testid="match-cards-skeleton">
    {Array.from({ length: count }, (_, i) => (
      <MatchCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Progress UI for an in-flight `match-creators` run.
 *
 * Matching now starts on its own when a campaign has no matches, so this is the
 * FIRST thing an owner sees on a brand-new campaign — it has to read as work in
 * progress, not as a stalled screen. Steps advance on a timer independent of the
 * request (the same approach as `landing/BriefGeneratorPreview`), because the
 * edge function reports no intermediate progress.
 */
export const MatchingProgress: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timers = MATCHING_STEPS.slice(1).map((_, i) =>
      setTimeout(() => setStepIndex(i + 1), (i + 1) * STEP_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-6" role="status" aria-live="polite">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-dc-teal animate-pulse" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">
              Donny is finding your best creators
            </p>
          </div>
          <ol className="space-y-3">
            {MATCHING_STEPS.map((step, i) => (
              <li
                key={step}
                data-testid="matching-step"
                data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'pending'}
                className={`flex items-center gap-2 transition-opacity duration-300 ${
                  i <= stepIndex ? 'opacity-100' : 'opacity-30'
                }`}
              >
                {i < stepIndex ? (
                  <CheckCircle2 className="h-4 w-4 text-dc-teal shrink-0" aria-hidden="true" />
                ) : i === stepIndex ? (
                  <Loader2 className="h-4 w-4 text-dc-teal animate-spin shrink-0" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-dc-teal/25 shrink-0" aria-hidden="true" />
                )}
                <span className="text-sm text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <MatchCardsSkeleton />
    </div>
  );
};
