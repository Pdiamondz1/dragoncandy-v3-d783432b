import { describe, it, expect } from 'vitest';
import { resolveDonnyProfile } from './profile';

const realProfile = {
  id: 'u-1',
  role: 'content_creator',
  full_name: 'Jane Creator',
  email: 'jane@example.com',
  avatar_url: 'https://example.com/a.png',
};

describe('resolveDonnyProfile', () => {
  it('returns the real profile on the consumer surface', () => {
    expect(resolveDonnyProfile({ profile: realProfile, internalMode: false, userId: 'u-1' })).toBe(
      realProfile,
    );
  });

  it('throws "Profile not found" for a consumer caller with no profile', () => {
    expect(() => resolveDonnyProfile({ profile: null, internalMode: false, userId: 'u-1' })).toThrow(
      'Profile not found',
    );
  });

  it('returns the real profile for an internal caller who also has one (e.g. Joe/Dame)', () => {
    expect(resolveDonnyProfile({ profile: realProfile, internalMode: true, userId: 'u-1' })).toBe(
      realProfile,
    );
  });

  it('synthesizes a minimal profile for an internal-only caller with no profile', () => {
    // Internal-only AIOS users (account_scope='internal') have no profiles row by design.
    expect(
      resolveDonnyProfile({ profile: null, internalMode: true, userId: 'adrian-uid' }),
    ).toEqual({
      id: 'adrian-uid',
      role: null,
      full_name: null,
      email: null,
      avatar_url: null,
    });
  });

  it('uses the fallback display name when synthesizing for an internal-only caller', () => {
    expect(
      resolveDonnyProfile({
        profile: null,
        internalMode: true,
        userId: 'adrian-uid',
        fallbackName: 'Adrian Vella',
      }),
    ).toEqual({
      id: 'adrian-uid',
      role: null,
      full_name: 'Adrian Vella',
      email: null,
      avatar_url: null,
    });
  });
});
