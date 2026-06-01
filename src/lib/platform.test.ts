import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Capacitor core module so we can drive isNativePlatform()/getPlatform()
const mockIsNative = vi.fn();
const mockGetPlatform = vi.fn();
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mockIsNative(),
    getPlatform: () => mockGetPlatform(),
  },
}));

import { isNativeApp, isIOS, getPlatformName } from './platform';

describe('platform', () => {
  beforeEach(() => {
    mockIsNative.mockReset();
    mockGetPlatform.mockReset();
  });

  it('isNativeApp is true inside the native shell', () => {
    mockIsNative.mockReturnValue(true);
    expect(isNativeApp()).toBe(true);
  });

  it('isNativeApp is false in a normal browser', () => {
    mockIsNative.mockReturnValue(false);
    expect(isNativeApp()).toBe(false);
  });

  it('isIOS is true only when native AND platform is ios', () => {
    mockIsNative.mockReturnValue(true);
    mockGetPlatform.mockReturnValue('ios');
    expect(isIOS()).toBe(true);
  });

  it('isIOS is false for web even if getPlatform reports web', () => {
    mockIsNative.mockReturnValue(false);
    mockGetPlatform.mockReturnValue('web');
    expect(isIOS()).toBe(false);
  });

  it('getPlatformName passes through Capacitor.getPlatform()', () => {
    mockGetPlatform.mockReturnValue('ios');
    expect(getPlatformName()).toBe('ios');
  });
});
