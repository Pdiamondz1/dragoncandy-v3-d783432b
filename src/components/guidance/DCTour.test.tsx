// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

vi.mock('@/lib/motion', () => ({
  motion: { div: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useReducedMotion: () => true,
}));

import { DCTour } from './DCTour';

const STEP = [{ target: "[data-tour='thing']", title: 'A step', body: 'Body copy.' }];

/** jsdom gives every element a 0×0 rect, so size must be stubbed explicitly —
 *  which is exactly the distinction under test. */
function mountTarget(size: { width: number; height: number }) {
  const el = document.createElement('div');
  el.setAttribute('data-tour', 'thing');
  el.getBoundingClientRect = () =>
    ({ x: 10, y: 10, top: 10, left: 10, bottom: 10 + size.height, right: 10 + size.width, ...size, toJSON: () => ({}) }) as DOMRect;
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

/** The spotlight is a black rect punched into the dim layer's mask. No black
 *  rect means the whole screen is evenly dimmed — the honest "I can't point at
 *  anything" state. */
const cutout = (c: HTMLElement) => c.querySelector('mask rect[fill="black"]');

describe('DCTour spotlight', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('spotlights a target that has size', () => {
    mountTarget({ width: 320, height: 88 });
    const { container } = render(<DCTour steps={STEP} onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(cutout(container)).not.toBeNull();
  });

  // The regression this file exists for: NeedsAttentionSection and friends hide
  // themselves with CSS `:has()`, so the anchor wrapper survives at zero height.
  // Spotlighting it punched a ~16px hole in the dim layer and pointed an arrow
  // at blank page.
  it('does NOT spotlight a target that is present but zero-height', () => {
    mountTarget({ width: 320, height: 0 });
    const { container } = render(<DCTour steps={STEP} onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(cutout(container)).toBeNull();
  });

  it('does not scroll to a zero-size target either', () => {
    const el = mountTarget({ width: 0, height: 0 });
    render(<DCTour steps={STEP} onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('still shows the step copy when there is nothing to point at', () => {
    const { getByText } = render(<DCTour steps={STEP} onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(getByText('A step')).toBeInTheDocument();
    expect(getByText('Body copy.')).toBeInTheDocument();
  });
});
