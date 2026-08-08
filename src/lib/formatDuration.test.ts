import { describe, it, expect } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  it('formats under a minute with a zero-padded second', () => {
    expect(formatDuration(24)).toBe('0:24');
    expect(formatDuration(5)).toBe('0:05');
  });

  it('formats minutes and hours', () => {
    expect(formatDuration(95)).toBe('1:35');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('rounds to the nearest second', () => {
    expect(formatDuration(24.4)).toBe('0:24');
    expect(formatDuration(24.6)).toBe('0:25');
  });

  it('returns null rather than a misleading 0:00', () => {
    // Callers render a plain "Video" label instead — never an empty-looking clip.
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(0.4)).toBeNull();
  });

  it('returns null for values a browser reports when length is unknown', () => {
    expect(formatDuration(NaN)).toBeNull();
    expect(formatDuration(Infinity)).toBeNull();
  });
});
