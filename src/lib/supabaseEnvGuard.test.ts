import { describe, it, expect } from 'vitest';
import {
  classifySupabaseUrl,
  isProductionSupabaseUrl,
  PROD_SUPABASE_HOST,
  STAGING_SUPABASE_HOST,
} from './supabaseEnvGuard';

describe('classifySupabaseUrl', () => {
  it('recognises the plain production URL', () => {
    expect(isProductionSupabaseUrl(`https://${PROD_SUPABASE_HOST}`)).toBe(true);
  });

  // The bug Codex caught: an exact string comparison lets every one of these through,
  // and the guard fails OPEN straight onto live customer data.
  it.each([
    ['a trailing slash', `https://${PROD_SUPABASE_HOST}/`],
    ['uppercase host', `https://${PROD_SUPABASE_HOST.toUpperCase()}`],
    ['mixed case host', 'https://ZocaHiffooqdybdhguqv.Supabase.CO'],
    ['a path', `https://${PROD_SUPABASE_HOST}/rest/v1`],
    ['a query string', `https://${PROD_SUPABASE_HOST}/?apikey=x`],
    ['an explicit port', `https://${PROD_SUPABASE_HOST}:443`],
    ['a fragment', `https://${PROD_SUPABASE_HOST}#x`],
  ])('still recognises production with %s', (_label, url) => {
    expect(isProductionSupabaseUrl(url)).toBe(true);
  });

  it('does not flag the staging project', () => {
    expect(isProductionSupabaseUrl(`https://${STAGING_SUPABASE_HOST}`)).toBe(false);
    expect(classifySupabaseUrl(`https://${STAGING_SUPABASE_HOST}/`)).toBe('other');
  });

  it('does not flag a local stack', () => {
    expect(isProductionSupabaseUrl('http://127.0.0.1:54321')).toBe(false);
  });

  // A host that merely *contains* the prod ref is a different host and must not match —
  // a substring check would wrongly block legitimate targets.
  it.each([
    ['a lookalike subdomain', 'https://zocahiffooqdybdhguqv.supabase.co.evil.test'],
    ['the ref as a prefix', 'https://zocahiffooqdybdhguqvx.supabase.co'],
    ['the ref in a path only', `https://${STAGING_SUPABASE_HOST}/${PROD_SUPABASE_HOST}`],
  ])('treats %s as a different project', (_label, url) => {
    expect(isProductionSupabaseUrl(url)).toBe(false);
  });

  // Fail closed: we cannot prove an unparseable value is safe, so callers must not
  // treat it as "not production".
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a bare host with no scheme', 'zocahiffooqdybdhguqv.supabase.co'],
    ['nonsense', 'not a url'],
  ])('reports %s as unparseable rather than safe', (_label, url) => {
    expect(classifySupabaseUrl(url)).toBe('unparseable');
    // and critically, it is NOT reported as production either — the caller decides
    expect(isProductionSupabaseUrl(url)).toBe(false);
  });
});
