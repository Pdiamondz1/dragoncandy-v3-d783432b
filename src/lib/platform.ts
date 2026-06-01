import { Capacitor } from '@capacitor/core';

/** True when running inside the native (iOS) Capacitor shell, false in any browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** The platform string: 'ios' | 'android' | 'web'. */
export function getPlatformName(): string {
  return Capacitor.getPlatform();
}

/** True only when running inside the native iOS app. */
export function isIOS(): boolean {
  return isNativeApp() && getPlatformName() === 'ios';
}
