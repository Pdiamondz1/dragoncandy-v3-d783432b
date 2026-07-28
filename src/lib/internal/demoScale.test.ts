import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoScale } from './demoScale';

afterEach(() => vi.unstubAllEnvs());

describe('isDemoScale', () => {
  it('is false when the flag is unset (default — prod-safe)', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    expect(isDemoScale()).toBe(false);
  });

  it('is true with the flag on AND a non-prod project', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://branch-abc.supabase.co');
    expect(isDemoScale()).toBe(true);
  });

  it('is FALSE on the prod project even with the flag on (hard guard)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zocahiffooqdybdhguqv.supabase.co');
    expect(isDemoScale()).toBe(false);
  });

  it('is FALSE when the URL is unset (unset falls back to prod at runtime)', () => {
    vi.stubEnv('VITE_DEMO_SCALE', '1');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(isDemoScale()).toBe(false);
  });
});
