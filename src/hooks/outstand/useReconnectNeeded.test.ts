import { describe, it, expect } from 'vitest';
import { platformsNeedingReconnect } from './useReconnectNeeded';

const r = (platform: string, status: string, platform_handle: string | null = null) => ({
  platform,
  status,
  platform_handle,
});

describe('platformsNeedingReconnect', () => {
  it('flags a platform with an error row and no active row', () => {
    const result = platformsNeedingReconnect([r('instagram', 'error', '@me')]);
    expect(result).toEqual([{ platform: 'instagram', platformHandle: '@me' }]);
  });

  it('hides a platform once it has an active row again (reconnected)', () => {
    const result = platformsNeedingReconnect([
      r('instagram', 'error', '@old'),
      r('instagram', 'active', '@new'),
    ]);
    expect(result).toEqual([]);
  });

  it('ignores user-initiated disconnects (revoked, not error)', () => {
    const result = platformsNeedingReconnect([r('youtube', 'revoked')]);
    expect(result).toEqual([]);
  });

  it('does not flag brand-new users who never connected (no error rows)', () => {
    const result = platformsNeedingReconnect([]);
    expect(result).toEqual([]);
  });

  it('handles multiple platforms independently', () => {
    const result = platformsNeedingReconnect([
      r('instagram', 'error', '@ig'),
      r('youtube', 'active', '@yt'),
      r('facebook', 'error', 'fb'),
      r('facebook', 'revoked', 'fb-old'),
    ]);
    expect(result.map((p) => p.platform).sort()).toEqual(['facebook', 'instagram']);
  });

  it('deduplicates a platform with multiple error rows', () => {
    const result = platformsNeedingReconnect([
      r('tiktok', 'error', '@a'),
      r('tiktok', 'error', '@b'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].platform).toBe('tiktok');
  });
});
