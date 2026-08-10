// @vitest-environment jsdom
// src/components/outstand/ConnectAccountButtonGroupGated.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

// ConnectAccountButtonGroup ships in @outstand-so/ui, not a local file.
vi.mock('@outstand-so/ui', () => ({
  ConnectAccountButtonGroup: () => <button>Connect Instagram</button>,
}));

import { ConnectAccountButtonGroupGated } from './ConnectAccountButtonGroupGated';

// `as never` (as originally drafted) fails strict-mode JSX spread checking
// ("Spread types may only be created from object types"). The component's
// real prop type only requires networks/redirectUri/apiKey (baseUrl and the
// rest are optional), so this literal already satisfies it — no cast needed.
type Props = Parameters<typeof ConnectAccountButtonGroupGated>[0];

describe('ConnectAccountButtonGroupGated', () => {
  const props: Props = {
    networks: ['instagram'],
    redirectUri: 'https://dragoncandy.com/outstand/callback',
    apiKey: 'k',
    baseUrl: 'https://api.example.test',
  };

  it('renders the real connect buttons on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<ConnectAccountButtonGroupGated {...props} />);
    expect(screen.queryByText('Connect Instagram')).toBeTruthy();
  });

  it('replaces them with an explanation in the native app', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<ConnectAccountButtonGroupGated {...props} />);
    expect(screen.queryByText('Connect Instagram')).toBeNull();
    expect(screen.queryByText(/dragoncandy\.com/)).toBeTruthy();
  });
});
