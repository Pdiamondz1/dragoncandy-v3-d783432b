import { describe, it, expect } from 'vitest';
import { countInviteDispatch } from './useCampaignMutations';

/** Shorthand for what `supabase.functions.invoke` resolves to. */
const ok = (): PromiseSettledResult<{ error: unknown } | null> => ({
  status: 'fulfilled',
  value: { error: null },
});
const httpFailure = (): PromiseSettledResult<{ error: unknown } | null> => ({
  status: 'fulfilled',
  value: { error: new Error('Edge Function returned a non-2xx status code') },
});
const rejected = (): PromiseSettledResult<{ error: unknown } | null> => ({
  status: 'rejected',
  reason: new Error('network down'),
});

describe('countInviteDispatch', () => {
  it('counts a clean fan-out as all sent', () => {
    expect(countInviteDispatch([ok(), ok(), ok()], 3)).toEqual({ sentCount: 3, failedCount: 0 });
  });

  // The bug this function exists for: invoke resolves on a non-2xx, so a 400 arrives as a
  // FULFILLED promise. Counting fulfilled promises told the business every creator was
  // invited when the edge function had refused all of them.
  it('does NOT count a resolved-but-errored invoke as sent', () => {
    expect(countInviteDispatch([httpFailure(), httpFailure()], 2)).toEqual({
      sentCount: 0,
      failedCount: 2,
    });
  });

  it('splits a partial fan-out', () => {
    expect(countInviteDispatch([ok(), httpFailure(), ok()], 3)).toEqual({
      sentCount: 2,
      failedCount: 1,
    });
  });

  it('attributes a genuinely rejected promise to failed', () => {
    expect(countInviteDispatch([ok(), rejected()], 2)).toEqual({ sentCount: 1, failedCount: 1 });
  });

  // failedCount is derived from the requested total, not from results.length, so a dispatch
  // that never produced a settled result is still reported rather than silently dropped.
  it('counts creators with no result at all as failed', () => {
    expect(countInviteDispatch([ok()], 3)).toEqual({ sentCount: 1, failedCount: 2 });
  });

  it('handles an empty fan-out', () => {
    expect(countInviteDispatch([], 0)).toEqual({ sentCount: 0, failedCount: 0 });
  });

  it('treats a null/undefined value as sent only when there is no error field', () => {
    const nullValue: PromiseSettledResult<{ error: unknown } | null> = {
      status: 'fulfilled',
      value: null,
    };
    expect(countInviteDispatch([nullValue], 1)).toEqual({ sentCount: 1, failedCount: 0 });
  });
});
