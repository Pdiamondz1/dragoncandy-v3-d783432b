import { describe, it, expect } from 'vitest';
import { resolveAmplificationPlatforms } from './useSponsorshipAmplification';

describe('resolveAmplificationPlatforms', () => {
  it('resolves each accountId to its real platform name, never the raw id', () => {
    const map = new Map([
      ['acct-ig', 'instagram'],
      ['acct-yt', 'youtube'],
    ]);
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-yt'], map);
    expect(result.platforms.sort()).toEqual(['instagram', 'youtube']);
    expect(result.unresolved).toEqual([]);
  });

  it('collapses two accounts on the same platform to one row (matches the DB unique key)', () => {
    const map = new Map([
      ['acct-ig-1', 'instagram'],
      ['acct-ig-2', 'instagram'],
    ]);
    const result = resolveAmplificationPlatforms(['acct-ig-1', 'acct-ig-2'], map);
    expect(result.platforms).toEqual(['instagram']);
    expect(result.unresolved).toEqual([]);
  });

  it('reports an unmatched accountId as unresolved instead of writing the id as the platform', () => {
    const map = new Map([['acct-ig', 'instagram']]);
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-ghost'], map);
    expect(result.platforms).toEqual(['instagram']);
    expect(result.unresolved).toEqual(['acct-ghost']);
  });

  it('reports every accountId as unresolved when the lookup is empty (e.g. the query errored)', () => {
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-yt'], new Map());
    expect(result.platforms).toEqual([]);
    expect(result.unresolved).toEqual(['acct-ig', 'acct-yt']);
  });

  it('returns nothing for an empty accountIds list', () => {
    const result = resolveAmplificationPlatforms([], new Map([['acct-ig', 'instagram']]));
    expect(result.platforms).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});
