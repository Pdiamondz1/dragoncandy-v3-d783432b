import { describe, test, expect } from 'vitest';
import { detectTimezone, detectLocation } from '../../src/hooks/useAutoDetect';

describe('detectTimezone', () => {
  test('returns IANA timezone string from browser', () => {
    const tz = detectTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    expect(tz).toContain('/');
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
