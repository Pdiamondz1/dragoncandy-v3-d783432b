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

/**
 * The sample exists but cannot be attributed to the account being reported on.
 *
 * `content_performance` records a platform, never an account id, so when a
 * caller holds two connected accounts on the SAME platform their measured posts
 * are indistinguishable at this grain. Borrowing the sibling's sample would let
 * one account's numbers vouch for another's — the same defect as counting
 * unverified rows, one level up: a bar cleared by evidence that is not about
 * the thing being claimed.
 *
 * Never claims a signal, whatever the count.
 */
export function unattributableSignal(n: number): SignalVerdict {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const noun = count === 1 ? 'post' : 'posts';
  return {
    hasSignal: false,
    n: count,
    caveat:
      `${count} measured ${noun} exist on this platform, but more than one connected ` +
      `account shares it, so none of them can be attributed to this one. Report only ` +
      `the raw figures that exist; do not name a trend, a best anything, or a rate.`,
  };
}
