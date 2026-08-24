import { describe, it, expect, vi } from 'vitest';
import { withTimeLimit, VERIFY_ADDRESS_WAIT_MS } from './useOrgData';

describe('withTimeLimit', () => {
  it('resolves as soon as the work resolves, without waiting out the limit', async () => {
    const start = Date.now();
    await expect(withTimeLimit(Promise.resolve('done'), 5_000)).resolves.toBe(false);
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  /**
   * The caller branches on this. Reporting "the work finished" for a wait the clock
   * ended would drop the follow-up invalidation, and a verification that succeeded a
   * second late would leave the badge saying "needs confirming" indefinitely.
   */
  it('reports WHICH of the two ended the wait, not merely that it ended', async () => {
    await expect(withTimeLimit(new Promise<void>(() => undefined), 10)).resolves.toBe(true);
    await expect(withTimeLimit(Promise.resolve(), 5_000)).resolves.toBe(false);
  });

  /**
   * The whole reason this wrapper exists. `supabase.functions.invoke` carries no timeout
   * of its own, so a hung verification would hold the save modal open forever.
   */
  it('resolves on the limit when the work never settles', async () => {
    const never = new Promise<void>(() => undefined);
    await expect(withTimeLimit(never, 10)).resolves.toBe(true);
  });

  /**
   * A geocode failure must not read as a failed save. The address is already written by
   * the time this runs.
   */
  it('resolves rather than rejecting when the work rejects', async () => {
    await expect(withTimeLimit(Promise.reject(new Error('geocode down')), 5_000))
      .resolves.toBe(false);
  });

  it('clears its timer so a resolved wait leaves nothing pending', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    await withTimeLimit(Promise.resolve(), 5_000);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  /**
   * A control: the assertion above would pass against a wrapper that ignored `ms`
   * entirely, so pin that the bound is real and is the one the save uses.
   */
  it('waits the limit it is given, and the save uses a bound in seconds not minutes', async () => {
    const start = Date.now();
    await withTimeLimit(new Promise<void>(() => undefined), 120);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
    expect(VERIFY_ADDRESS_WAIT_MS).toBeGreaterThan(1_000);
    expect(VERIFY_ADDRESS_WAIT_MS).toBeLessThanOrEqual(15_000);
  });
});
