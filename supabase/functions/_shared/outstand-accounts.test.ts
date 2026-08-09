import { describe, it, expect } from 'vitest';
import {
  resolveAccount,
  describeAccount,
  type ConnectedAccount,
} from './outstand-accounts';

const IG: ConnectedAccount = { id: 'LEnjV', platform: 'instagram', handle: 'areyouaman' };
const YT: ConnectedAccount = { id: 'I2pgX', platform: 'youtube', handle: '@josephcastelo149' };
const IG2: ConnectedAccount = { id: 'ZZZZZ', platform: 'instagram', handle: 'second_shop' };

describe('resolveAccount', () => {
  it('returns none for an empty list', () => {
    expect(resolveAccount([])).toEqual({ kind: 'none' });
  });

  it('uses the only account without asking', () => {
    expect(resolveAccount([IG])).toEqual({ kind: 'one', account: IG });
  });

  it('asks when there is more than one and no hint', () => {
    expect(resolveAccount([IG, YT])).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('narrows by an explicitly requested platform instead of asking', () => {
    expect(resolveAccount([IG, YT], 'instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('matches the platform hint case-insensitively', () => {
    expect(resolveAccount([IG, YT], 'Instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('still asks when the hint leaves more than one candidate', () => {
    expect(resolveAccount([IG, IG2, YT], 'instagram')).toEqual({
      kind: 'many',
      accounts: [IG, IG2],
    });
  });

  it('falls back to the full list when the hint matches nothing, rather than reporting none', () => {
    // "none" would make Donny say no account is connected, which is a lie the
    // product has already told a user three times. An unmatched hint is a
    // disambiguation problem, not an absence.
    expect(resolveAccount([IG, YT], 'threads')).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('uses the only account even when the hint matches nothing', () => {
    expect(resolveAccount([IG], 'tiktok')).toEqual({ kind: 'one', account: IG });
  });
});

describe('describeAccount', () => {
  it('names an account by handle and platform, never by id', () => {
    const label = describeAccount(IG);
    expect(label).toBe('@areyouaman · Instagram');
    expect(label).not.toContain('LEnjV');
  });

  it('does not double the @ when the handle already carries one', () => {
    expect(describeAccount(YT)).toBe('@josephcastelo149 · YouTube');
  });

  it('falls back to the platform alone when there is no handle', () => {
    expect(describeAccount({ id: 'x', platform: 'facebook', handle: null })).toBe('Facebook');
  });
});
