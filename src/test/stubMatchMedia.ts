import { vi } from 'vitest';

// jsdom does not implement window.matchMedia, and `useIsMobile` subscribes to
// it on mount — so any suite rendering a component that uses that hook throws
// on the first effect without this. The reported viewport still comes from
// `window.innerWidth` (which the hook reads directly), so this only has to
// satisfy the subscription; set `window.innerWidth` to choose the viewport.
//
// Matches the inline stub DonnyMessage.test.tsx already uses; shared because
// three suites now need it.
export function stubMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
