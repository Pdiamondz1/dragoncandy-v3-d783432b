// @vitest-environment jsdom
// src/components/platform/WebOnly.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockPlatform = { isNative: false, isIOS: false };
vi.mock('@/hooks/use-native-platform', () => ({
  useNativePlatform: () => mockPlatform,
}));

import { WebOnly } from './WebOnly';

describe('WebOnly', () => {
  it('renders children on web', () => {
    mockPlatform = { isNative: false, isIOS: false };
    render(<WebOnly><button>Buy</button></WebOnly>);
    expect(screen.queryByText('Buy')).toBeTruthy();
  });

  it('renders nothing in the native app', () => {
    mockPlatform = { isNative: true, isIOS: true };
    render(<WebOnly><button>Buy</button></WebOnly>);
    expect(screen.queryByText('Buy')).toBeNull();
  });
});
