/**
 * Copy and timing for the in-flight `match-creators` progress UI.
 *
 * Separate from `MatchingProgress.tsx` so that file exports components only
 * (fast refresh), and so the timing is assertable without rendering.
 */

export const MATCHING_STEPS = [
  'Scanning the creator marketplace…',
  'Scoring platform fit & skills…',
  'Checking budget, location & availability…',
  'Ranking your top matches…',
] as const;

/**
 * How long each step holds before the next lights up. The edge function reports
 * no intermediate progress, so these are paced to a typical run rather than
 * driven by it — and the last step never ticks over to "done", because the run
 * finishing is what unmounts the component.
 */
export const STEP_MS = 2000;
