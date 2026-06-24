import { describe, it, expect } from 'vitest';
import { isTestKey } from './stripe-mode';

describe('isTestKey', () => {
  it('is true for sk_test_ keys', () => {
    expect(isTestKey('sk_test_abc123')).toBe(true);
  });
  it('is false for sk_live_ keys', () => {
    expect(isTestKey('sk_live_abc123')).toBe(false);
  });
  it('is false for empty / undefined-ish', () => {
    expect(isTestKey('')).toBe(false);
  });
});
