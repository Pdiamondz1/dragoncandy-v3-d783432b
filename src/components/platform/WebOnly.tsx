// src/components/platform/WebOnly.tsx
import type { ReactNode } from 'react';
import { useNativePlatform } from '@/hooks/use-native-platform';

/**
 * Renders children only on the web (browser), never in the native iOS app.
 * Used to hide in-app purchase / upgrade / billing CTAs so the iOS build does
 * not sell digital goods or steer users to external purchase (Apple 3.1.1).
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const { isNative } = useNativePlatform();
  return isNative ? null : <>{children}</>;
}
