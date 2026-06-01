import { describe, it, expect } from 'vitest';
import { resolveSupabaseConfig, PROD_FALLBACK } from './client';

describe('resolveSupabaseConfig', () => {
  it('falls back to the prod project when env is unset', () => {
    const c = resolveSupabaseConfig({});
    expect(c.url).toBe(PROD_FALLBACK.url);
    expect(c.key).toBe(PROD_FALLBACK.key);
  });

  it('uses env overrides when present (e.g. staging on a preview build)', () => {
    const c = resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://staging-ref.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'staging-anon-key',
    });
    expect(c.url).toBe('https://staging-ref.supabase.co');
    expect(c.key).toBe('staging-anon-key');
  });

  it('falls back per-field when only one override is set', () => {
    const c = resolveSupabaseConfig({ VITE_SUPABASE_URL: 'https://only-url.supabase.co' });
    expect(c.url).toBe('https://only-url.supabase.co');
    expect(c.key).toBe(PROD_FALLBACK.key);
  });
});
