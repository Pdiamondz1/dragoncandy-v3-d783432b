import React from 'react';
import { useNativePlatform } from '@/hooks/use-native-platform';
import { ConnectAccountButtonGroup } from '@outstand-so/ui';

type Props = React.ComponentProps<typeof ConnectAccountButtonGroup>;

/**
 * Connecting a social account is web-only in the iOS app until deep links land.
 *
 * The OAuth callback returns to an https URL, which opens in Safari against the
 * web app; the native shell has no way to receive it (no @capacitor/app, no
 * appUrlOpen listener). Repointing `redirectUri` alone would turn a visible
 * provider rejection into a silent dead end, so we say so instead.
 *
 * Deliberately NOT <WebOnly>, which renders null — an unexplained missing
 * button is worse than a sentence explaining where to go.
 */
export const ConnectAccountButtonGroupGated: React.FC<Props> = (props) => {
  const { isNative } = useNativePlatform();

  if (isNative) {
    return (
      <p className="text-sm text-dc-text-muted">
        Connecting a social account isn&apos;t available in the app yet. Sign in at
        dragoncandy.com to connect it, then it&apos;ll show up here.
      </p>
    );
  }

  return <ConnectAccountButtonGroup {...props} />;
};
