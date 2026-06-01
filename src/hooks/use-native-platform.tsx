import * as React from 'react';
import { isNativeApp, isIOS } from '@/lib/platform';

/**
 * Exposes whether the app is running inside the native shell.
 * Value is stable for the lifetime of the app (platform never changes at runtime),
 * so it is read once on mount.
 */
export function useNativePlatform() {
  const [state] = React.useState(() => ({
    isNative: isNativeApp(),
    isIOS: isIOS(),
  }));
  return state;
}
