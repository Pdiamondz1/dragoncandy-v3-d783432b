import { describe, it, expect } from 'vitest';
import { resolveProviderId, resolveProviderFromRows, KNOWN_PROVIDERS } from './social-provider';

describe('resolveProviderId', () => {
  it('defaults to outstand when unset', () => {
    expect(resolveProviderId(null)).toBe('outstand');
    expect(resolveProviderId(undefined)).toBe('outstand');
  });
  it('honors a known provider', () => {
    expect(resolveProviderId('zernio')).toBe('zernio');
    expect(resolveProviderId('outstand')).toBe('outstand');
  });
  it('falls back to outstand on an unknown value', () => {
    expect(resolveProviderId('myspace')).toBe('outstand');
  });
  it('exposes the known providers set', () => {
    expect(KNOWN_PROVIDERS).toContain('outstand');
    expect(KNOWN_PROVIDERS).toContain('zernio');
  });
});

describe('resolveProviderFromRows', () => {
  it('returns the single shared provider when all rows agree', () => {
    expect(resolveProviderFromRows([{ provider: 'zernio' }, { provider: 'zernio' }])).toBe('zernio');
  });
  it('defaults to outstand when rows are empty', () => {
    expect(resolveProviderFromRows([])).toBe('outstand');
  });
  it('falls back to outstand when rows are mixed', () => {
    expect(resolveProviderFromRows([{ provider: 'zernio' }, { provider: 'outstand' }])).toBe('outstand');
  });
  it('treats all-null rows as outstand', () => {
    expect(resolveProviderFromRows([{ provider: null }, { provider: null }])).toBe('outstand');
  });
});
