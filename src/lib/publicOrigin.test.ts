// src/lib/publicOrigin.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isNativeApp = vi.fn();
vi.mock('@/lib/platform', () => ({ isNativeApp: () => isNativeApp() }));

import { publicOrigin } from './publicOrigin';
import { CANONICAL_APP_ORIGIN } from './allowedOrigins';

describe('publicOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { origin: 'https://staging.example.test' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the live browser origin on web, unchanged', () => {
    isNativeApp.mockReturnValue(false);
    expect(publicOrigin()).toBe('https://staging.example.test');
  });

  it('returns the canonical origin in the native shell', () => {
    // In Capacitor, window.location.origin is capacitor://localhost — a scheme
    // no mail client, share target or OAuth provider can open.
    isNativeApp.mockReturnValue(true);
    vi.stubGlobal('window', { location: { origin: 'capacitor://localhost' } });
    expect(publicOrigin()).toBe(CANONICAL_APP_ORIGIN);
  });

  it('never returns a capacitor: URL', () => {
    isNativeApp.mockReturnValue(true);
    vi.stubGlobal('window', { location: { origin: 'capacitor://localhost' } });
    expect(publicOrigin().startsWith('capacitor:')).toBe(false);
  });
});
