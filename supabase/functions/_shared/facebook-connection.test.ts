import { describe, expect, it } from 'vitest';
import {
  canReadInsights,
  canRevoke,
  INSIGHTS_TASK,
  missingInsightsReason,
} from './facebook-connection.ts';
import { INSIGHTS_PERMISSIONS, isTokenDeadError } from './facebook-pages.ts';

/**
 * `canReadInsights` has TWO gates, and an earlier version checked only one.
 *
 * A user who unticks `read_insights` on Meta's consent screen still holds
 * ANALYZE on their Page, so the task check passed, the row stored as `active`,
 * the card said "Connected", and the very first insights read failed. The
 * granted permissions were being read back from Meta at connect time precisely
 * so we would not claim something we do not hold — reading them and then not
 * using them was worse than not reading them, because the row looked checked.
 * (Codex second review, round 2.)
 */

const granted = [...INSIGHTS_PERMISSIONS];

describe('canReadInsights', () => {
  it('needs the ANALYZE task AND the granted permissions', () => {
    expect(canReadInsights({ tasks: [INSIGHTS_TASK], permissions: granted })).toBe(true);
  });

  it('refuses a Page whose role lacks ANALYZE, however complete the permissions', () => {
    // An advertiser can hold a Page role without ANALYZE. Meta requires a token
    // from someone who can analyze the Page.
    expect(canReadInsights({ tasks: ['ADVERTISE'], permissions: granted })).toBe(false);
    expect(missingInsightsReason({ tasks: ['ADVERTISE'], permissions: granted })).toBe('task');
  });

  it.each(INSIGHTS_PERMISSIONS)('refuses when %s was declined, even with ANALYZE', (missing) => {
    // The exact case the earlier version let through.
    const partial = granted.filter((p) => p !== missing);
    expect(canReadInsights({ tasks: [INSIGHTS_TASK], permissions: partial })).toBe(false);
    expect(missingInsightsReason({ tasks: [INSIGHTS_TASK], permissions: partial })).toBe(
      'permission',
    );
  });

  it('reports the permission gate first when BOTH are missing', () => {
    // Deliberate: re-consenting with every box ticked is the cheaper action, and
    // it is also the one that can reveal whether the task gate is really a
    // problem. Sending someone to a Page-roles admin screen first would be the
    // wrong order.
    expect(missingInsightsReason({ tasks: [], permissions: [] })).toBe('permission');
  });

  it('does not treat unrelated permissions as sufficient', () => {
    expect(
      canReadInsights({ tasks: [INSIGHTS_TASK], permissions: ['pages_show_list', 'public_profile'] }),
    ).toBe(false);
  });

  it('survives malformed rows without granting access', () => {
    // Failing OPEN here would hand insights to a connection we know nothing
    // about, which is the wrong direction for a permission check.
    expect(
      canReadInsights({ tasks: null as never, permissions: null as never }),
    ).toBe(false);
  });
});

describe('canRevoke', () => {
  it('is true while the user token is still in date', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(canRevoke({ user_token_expires_at: future })).toBe(true);
  });

  it('is false once it has lapsed, so disconnect can say so rather than fail vaguely', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(canRevoke({ user_token_expires_at: past })).toBe(false);
  });

  it('assumes usable when no expiry was recorded', () => {
    // Meta omits `expires_in` for tokens that do not expire. Treating absent as
    // expired would refuse to even ATTEMPT a revoke that would have worked, and
    // leave a live grant behind on every disconnect.
    expect(canRevoke({ user_token_expires_at: null })).toBe(true);
    expect(canRevoke({ user_token_expires_at: 'not-a-date' })).toBe(true);
  });
});

/**
 * This classification decides whether `facebook-disconnect` may delete the row
 * holding our only copy of the token — so it IS the "never abandon a live grant"
 * rule, not a detail of it.
 *
 * An earlier version returned `already_invalid` for ANY HTTP 400. Meta answers
 * 400 for a great many things unrelated to the token, so an ordinary Graph error
 * would delete the credential, report a clean disconnect, and leave a live
 * authorization nothing could ever revoke. (Codex second review, round 3.)
 */
describe('isTokenDeadError', () => {
  it.each([190, 102, 463, 467])('recognises code %i as a dead token', (code) => {
    expect(isTokenDeadError({ error: { code } })).toBe(true);
  });

  it('recognises the expiry subcodes that arrive under a generic 190', () => {
    expect(isTokenDeadError({ error: { code: 190, error_subcode: 463 } })).toBe(true);
    expect(isTokenDeadError({ error: { code: 190, error_subcode: 467 } })).toBe(true);
  });

  it('does NOT treat an ordinary Graph error as a dead token', () => {
    // The finding, stated as a test: these all arrive as HTTP 400 and none of
    // them means the token is gone. Claiming otherwise deletes the only thing
    // that could still revoke the grant.
    expect(isTokenDeadError({ error: { code: 100, message: 'Invalid parameter' } })).toBe(false);
    expect(isTokenDeadError({ error: { code: 4, message: 'rate limited' } })).toBe(false);
    expect(isTokenDeadError({ error: { code: 200, message: 'permissions error' } })).toBe(false);
    expect(isTokenDeadError({})).toBe(false);
    expect(isTokenDeadError(null)).toBe(false);
  });

  it('accepts a numeric string, because Meta is inconsistent about quoting', () => {
    expect(isTokenDeadError({ error: { code: '190' } })).toBe(true);
  });
});
