// The sample-size bar for any comparative claim about social performance.
//
// Canonical home. It used to exist twice — src/lib/postPerformance.ts and
// content-strategy-recommend/brief.ts — because edge functions cannot import
// from src/. The two EDGE copies converge here. The frontend keeps its own copy
// (src/ cannot reach supabase/functions/_shared/) and carries a pointer comment.
//
// Pure and dependency-free on purpose: Vitest imports it directly.
export const MIN_POSTS_FOR_SIGNAL = 3;

export interface SignalVerdict {
  /** True when there are enough measured posts to make a comparative claim. */
  hasSignal: boolean;
  /** The count actually used, floored at 0. Always stated to the user. */
  n: number;
  /** Model-facing instruction when hasSignal is false; null when it is true. */
  caveat: string | null;
}

export function assessSignal(n: number): SignalVerdict {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (count >= MIN_POSTS_FOR_SIGNAL) {
    return { hasSignal: true, n: count, caveat: null };
  }
  const noun = count === 1 ? 'post' : 'posts';
  return {
    hasSignal: false,
    n: count,
    caveat:
      `Based on ${count} measured ${noun} — too few to name a trend, a best anything, ` +
      `or a rate. Report only the raw figures that exist.`,
  };
}
