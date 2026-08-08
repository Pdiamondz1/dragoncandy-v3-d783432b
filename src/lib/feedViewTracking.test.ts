import { describe, it, expect } from 'vitest';
import { dayStamp, viewDedupKey, claimViewOncePerDay, type KeyValueStore } from './feedViewTracking';

function memoryStore(): KeyValueStore & { size: () => number } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    size: () => map.size,
  };
}

describe('dayStamp', () => {
  it('is a UTC YYYY-MM-DD', () => {
    expect(dayStamp(new Date('2026-08-07T23:59:59Z'))).toBe('2026-08-07');
  });

  it('rolls over on UTC midnight, not local midnight', () => {
    expect(dayStamp(new Date('2026-08-07T23:59:59Z'))).not.toBe(
      dayStamp(new Date('2026-08-08T00:00:01Z')),
    );
  });
});

describe('viewDedupKey', () => {
  it('separates users, items and days', () => {
    const now = new Date('2026-08-07T12:00:00Z');
    const base = viewDedupKey('u1', 'i1', now);
    expect(viewDedupKey('u2', 'i1', now)).not.toBe(base);
    expect(viewDedupKey('u1', 'i2', now)).not.toBe(base);
    expect(viewDedupKey('u1', 'i1', new Date('2026-08-08T12:00:00Z'))).not.toBe(base);
  });
});

describe('claimViewOncePerDay', () => {
  const now = new Date('2026-08-07T12:00:00Z');

  it('counts the first open and ignores repeats the same day', () => {
    const store = memoryStore();
    expect(claimViewOncePerDay(store, 'u1', 'i1', now)).toBe(true);
    expect(claimViewOncePerDay(store, 'u1', 'i1', now)).toBe(false);
    expect(claimViewOncePerDay(store, 'u1', 'i1', new Date('2026-08-07T23:00:00Z'))).toBe(false);
  });

  it('counts again the next day', () => {
    const store = memoryStore();
    claimViewOncePerDay(store, 'u1', 'i1', now);
    expect(claimViewOncePerDay(store, 'u1', 'i1', new Date('2026-08-08T00:00:01Z'))).toBe(true);
  });

  it('tracks different items and users independently', () => {
    const store = memoryStore();
    expect(claimViewOncePerDay(store, 'u1', 'i1', now)).toBe(true);
    expect(claimViewOncePerDay(store, 'u1', 'i2', now)).toBe(true);
    expect(claimViewOncePerDay(store, 'u2', 'i1', now)).toBe(true);
  });

  it('records nothing without a user or an item', () => {
    const store = memoryStore();
    expect(claimViewOncePerDay(store, '', 'i1', now)).toBe(false);
    expect(claimViewOncePerDay(store, 'u1', '', now)).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('under-counts rather than double-counts when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('disabled'); },
      setItem: () => { throw new Error('disabled'); },
    };
    expect(claimViewOncePerDay(broken, 'u1', 'i1', now)).toBe(false);
  });
});
