import { describe, it, expect } from 'vitest';
import {
  decideRefresh,
  isInsightsPermissionMissing,
  MIN_TOKEN_AGE_MS,
  REFRESH_WHEN_REMAINING_MS,
} from './instagram-connection.ts';

/**
 * The refresh window arithmetic, which is the single most consequential piece of
 * logic in this connector and the one that cannot be exercised by hand.
 *
 * Instagram has no refresh token: the 60-day access token IS the credential, and
 * Meta will only extend it while it is **still valid** and **at least 24 hours
 * old**. So the two ways to get this wrong are opposite and both silent —
 * refresh too late and the connection is unrecoverable without the user, refresh
 * too early and Meta rejects every attempt.
 *
 * `decideRefresh` is pure precisely so these states are reachable in a test. A
 * `token_expires_at` sixty days out cannot be waited for.
 */

const NOW = Date.parse('2026-08-23T12:00:00Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const DAY = 24 * 60 * 60 * 1000;

const conn = (expiresIn: number, issuedAgo: number) => ({
  token_expires_at: at(expiresIn),
  token_issued_at: at(-issuedAgo),
});

describe('decideRefresh', () => {
  it('uses a token with plenty of life left', () => {
    expect(decideRefresh(conn(45 * DAY, 15 * DAY), NOW)).toEqual({ action: 'use' });
  });

  it('refreshes once inside the remaining-life threshold', () => {
    expect(decideRefresh(conn(10 * DAY, 50 * DAY), NOW)).toEqual({ action: 'refresh' });
  });

  it('does not refresh a token younger than Meta will allow', () => {
    // A fresh connection whose expiry is somehow near. Meta refuses to refresh
    // under 24 hours old, and the error it returns for "too young" has the same
    // shape as "invalid" — so asking anyway would look like a dead connection.
    expect(decideRefresh(conn(5 * DAY, 2 * 60 * 60 * 1000), NOW)).toEqual({
      action: 'too_young',
    });
  });

  it('treats an expired token as terminal rather than refreshable', () => {
    // THE case this connector exists to avoid. There is no credential left that
    // can mint another one; only the user re-consenting restores it. Reporting
    // `refresh` here would produce an infinite retry against an impossible call.
    expect(decideRefresh(conn(-1, 90 * DAY), NOW)).toEqual({ action: 'expired' });
  });

  it('is exact at the threshold boundaries', () => {
    // Just outside the window: still `use`.
    expect(decideRefresh(conn(REFRESH_WHEN_REMAINING_MS + 1, 30 * DAY), NOW).action).toBe('use');
    // Exactly at it: refresh. The comparison is `>` on remaining life, so the
    // boundary belongs to the refreshing side — losing a connection is worse
    // than spending one API call.
    expect(decideRefresh(conn(REFRESH_WHEN_REMAINING_MS, 30 * DAY), NOW).action).toBe('refresh');
    // Exactly at the age floor: old enough.
    expect(decideRefresh(conn(5 * DAY, MIN_TOKEN_AGE_MS), NOW).action).toBe('refresh');
    expect(decideRefresh(conn(5 * DAY, MIN_TOKEN_AGE_MS - 1), NOW).action).toBe('too_young');
  });

  it('expiry exactly now counts as expired, not as refreshable', () => {
    expect(decideRefresh(conn(0, 90 * DAY), NOW).action).toBe('expired');
  });

  it('refreshes when the expiry is unknown', () => {
    // Being wrong this way spends one API call. Being wrong the other way loses
    // the connection, so an unknown expiry must not resolve to `use`.
    expect(
      decideRefresh({ token_expires_at: null, token_issued_at: at(-30 * DAY) }, NOW).action,
    ).toBe('refresh');
    expect(
      decideRefresh({ token_expires_at: 'not a date', token_issued_at: at(-30 * DAY) }, NOW)
        .action,
    ).toBe('refresh');
  });

  it('assumes a token with an unknown issue date is old enough', () => {
    // A token whose issue date we lost is far more likely to be old than to be
    // minutes old, and the cost of being wrong is one rejected call.
    expect(
      decideRefresh({ token_expires_at: at(5 * DAY), token_issued_at: null }, NOW).action,
    ).toBe('refresh');
  });

  it('never reports refresh for an expired token even with an unknown issue date', () => {
    expect(
      decideRefresh({ token_expires_at: at(-DAY), token_issued_at: null }, NOW).action,
    ).toBe('expired');
  });
});

describe('isInsightsPermissionMissing', () => {
  it('is false for an empty list — absent knowledge is not a denial', () => {
    // The asymmetry is deliberate. An empty array means we never recorded what
    // was granted, not that nothing was. Failing closed here would break a
    // working connection on the strength of a gap in our own bookkeeping.
    expect(isInsightsPermissionMissing([])).toBe(false);
  });

  it('is true only when we positively know the permission is absent', () => {
    expect(isInsightsPermissionMissing(['instagram_business_basic'])).toBe(true);
  });

  it('is false when the permission is present', () => {
    expect(
      isInsightsPermissionMissing([
        'instagram_business_basic',
        'instagram_business_manage_insights',
      ]),
    ).toBe(false);
  });
});
