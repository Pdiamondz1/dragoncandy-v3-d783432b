import { describe, test, expect, vi, afterEach } from 'vitest';
import { detectTimezone, detectLocation } from '../../src/hooks/useAutoDetect';

describe('detectTimezone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('returns the IANA timezone reported by Intl', () => {
    // Mock Intl so this test does not depend on the runner's own timezone.
    // (CI runs in UTC, which has no "/", so asserting against the real
    // runner timezone is non-hermetic and was failing in CI.)
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'America/New_York' }),
    } as unknown as Intl.DateTimeFormat);

    const tz = detectTimezone();
    expect(typeof tz).toBe('string');
    expect(tz).toBe('America/New_York');
    expect(tz).toContain('/');
  });

  test('returns an empty string when Intl throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable');
    });

    expect(detectTimezone()).toBe('');
  });
});

describe('detectLocation', () => {
  test('returns null when geolocation is unavailable', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: undefined },
      writable: true,
    });

    const result = await detectLocation();
    expect(result).toBeNull();

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });
});
