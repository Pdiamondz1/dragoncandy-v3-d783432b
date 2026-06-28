import { describe, it, expect } from 'vitest';
import { getDragonTier, DRAGON_TIERS } from './dragonTiers';

describe('getDragonTier', () => {
  it('maps every known tier', () => {
    for (const key of ['egg', 'scout', 'knight', 'master', 'legend'] as const) {
      expect(getDragonTier(key).key).toBe(key);
    }
  });
  it('falls back to egg for unknown / null', () => {
    expect(getDragonTier('mystery').key).toBe('egg');
    expect(getDragonTier(null).key).toBe('egg');
    expect(getDragonTier(undefined).key).toBe('egg');
  });
  it('never uses a gray badge color (DESIGN_SYSTEM rule)', () => {
    for (const meta of Object.values(DRAGON_TIERS)) {
      expect(meta.colorClasses).not.toMatch(/gray|slate|zinc|neutral/);
    }
  });
});
