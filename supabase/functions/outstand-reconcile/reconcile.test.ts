import { describe, it, expect } from 'vitest';
import {
  computeAccountsToError,
  decideReconcile,
  type ActiveAccountRow,
} from './reconcile';

const row = (id: string, account: string, platform = 'instagram'): ActiveAccountRow => ({
  id,
  user_id: `u-${id}`,
  platform,
  outstand_social_account_id: account,
});

describe('computeAccountsToError', () => {
  it('flags rows whose account id is absent from the live set', () => {
    const rows = [row('1', 'LIVE'), row('2', 'DEAD'), row('3', 'ALSO_DEAD')];
    const result = computeAccountsToError(rows, new Set(['LIVE']));
    expect(result.map((r) => r.id)).toEqual(['2', '3']);
  });

  it('keeps every row when all accounts are still live', () => {
    const rows = [row('1', 'A'), row('2', 'B')];
    expect(computeAccountsToError(rows, ['A', 'B'])).toEqual([]);
  });

  it('returns empty for no active rows', () => {
    expect(computeAccountsToError([], ['A'])).toEqual([]);
  });
});

describe('decideReconcile', () => {
  it('requires confirmation when the live list is empty but active rows exist', () => {
    const rows = [row('1', 'DEAD'), row('2', 'ALSO_DEAD')];
    const decision = decideReconcile({
      activeRows: rows,
      liveIds: [],
      liveCount: 0,
      confirmEmpty: false,
    });
    expect(decision.needsEmptyConfirmation).toBe(true);
    expect(decision.toError).toEqual([]); // no writes until confirmed
  });

  it('proceeds with an empty live list once confirm_empty is set', () => {
    const rows = [row('1', 'DEAD'), row('2', 'ALSO_DEAD')];
    const decision = decideReconcile({
      activeRows: rows,
      liveIds: [],
      liveCount: 0,
      confirmEmpty: true,
    });
    expect(decision.needsEmptyConfirmation).toBe(false);
    expect(decision.toError.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('does not require confirmation when some accounts are live', () => {
    const rows = [row('1', 'LIVE'), row('2', 'DEAD')];
    const decision = decideReconcile({
      activeRows: rows,
      liveIds: ['LIVE'],
      liveCount: 1,
      confirmEmpty: false,
    });
    expect(decision.needsEmptyConfirmation).toBe(false);
    expect(decision.toError.map((r) => r.id)).toEqual(['2']);
  });

  it('does not require confirmation when there are no active rows to begin with', () => {
    const decision = decideReconcile({
      activeRows: [],
      liveIds: [],
      liveCount: 0,
      confirmEmpty: false,
    });
    expect(decision.needsEmptyConfirmation).toBe(false);
    expect(decision.toError).toEqual([]);
  });

  it('is idempotent: re-running against the same (now-confirmed) state finds nothing new', () => {
    // After the first run flips rows to 'error', they are no longer 'active',
    // so the second run sees an empty active set → nothing to do.
    const decision = decideReconcile({
      activeRows: [],
      liveIds: [],
      liveCount: 0,
      confirmEmpty: true,
    });
    expect(decision.toError).toEqual([]);
  });
});
