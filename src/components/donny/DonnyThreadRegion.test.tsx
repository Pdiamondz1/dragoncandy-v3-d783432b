// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DonnyThreadRegion } from './DonnyThreadRegion';
import type { DonnyMessage } from '@/types/donny';

// jsdom performs NO layout: scrollHeight and clientHeight are hard 0, and
// scrollTop is not writable in any observable way. Every assertion below about
// scrolling is therefore only as real as this stub — what it does prove is the
// component's arithmetic and its writes, which is where the logic lives. What
// it cannot prove is that the CSS actually produces a scrollable box; that is a
// class-value pin, marked as such where it appears.
type Metrics = { scrollHeight: number; clientHeight: number; scrollTop: number };

const KEYS = ['scrollHeight', 'clientHeight', 'scrollTop'] as const;
let restore: (() => void) | null = null;

function stubScrollMetrics(initial: Metrics): Metrics {
  const state = { ...initial };
  const originals = KEYS.map(
    (k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k)] as const
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => state.scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => state.clientHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (v: number) => {
      state.scrollTop = v;
    },
  });
  restore = () => {
    for (const [k, descriptor] of originals) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, k, descriptor);
      // scrollHeight/clientHeight/scrollTop live on Element.prototype, not
      // HTMLElement.prototype, so deleting the shadow restores inheritance.
      else Reflect.deleteProperty(HTMLElement.prototype, k);
    }
  };
  return state;
}

afterEach(() => {
  restore?.();
  restore = null;
});

function message(id: string, content: string): DonnyMessage {
  return {
    id,
    conversation_id: 'c1',
    role: 'assistant',
    content,
    tool_calls: null,
    tool_result: null,
    rich_card: null,
    quick_actions: [],
    created_at: '2026-08-09T23:24:00.000Z',
  } as unknown as DonnyMessage;
}

function renderRegion(messages: DonnyMessage[]) {
  const props = {
    messages,
    avatarState: 'idle' as const,
    isStreaming: false,
    streamingContent: '',
    error: null,
    retry: vi.fn(),
    userRole: 'business_client' as const,
  };
  const utils = render(
    <MemoryRouter>
      <DonnyThreadRegion {...props} />
    </MemoryRouter>
  );
  const rerenderWith = (next: DonnyMessage[]) =>
    utils.rerender(
      <MemoryRouter>
        <DonnyThreadRegion {...props} messages={next} />
      </MemoryRouter>
    );
  return { ...utils, rerenderWith };
}

const scroller = () => screen.getByRole('log', { name: 'Donny conversation' });
const jumpButton = () => screen.queryByRole('button', { name: /scroll to latest/i });

describe('DonnyThreadRegion — the thread is bounded, not endless', () => {
  it('scrolls inside itself instead of growing the page', () => {
    // CLASS-VALUE PIN, not a behavioural proof: jsdom loads no CSS and does no
    // layout, so nothing here can observe an actually-scrollable box. What it
    // does pin is that the element carrying the conversation is the one asked
    // to scroll — the founder's "the conversation just keep running down
    // endlessly" is exactly this class being absent.
    stubScrollMetrics({ scrollHeight: 0, clientHeight: 0, scrollTop: 0 });
    renderRegion([message('m1', 'Based on 1 measured post so far.')]);
    expect(scroller()).toHaveClass('overflow-y-auto');
  });

  it('sizes the scroller with flex, never a percentage height', () => {
    // CLASS-VALUE PIN, and a deliberately weak one — but it guards a bug this
    // whole test tier is blind to, so it is worth its weight.
    //
    // The first version shipped `h-full` here. Every test in this file passed,
    // because jsdom does no layout. In a real browser it was broken: `h-full`
    // is `height: 100%`, and a percentage height only resolves against a parent
    // whose `height` PROPERTY is definite. Every ancestor sizes itself with
    // min-h/max-h and leaves `height: auto`, so the percentage silently fell
    // back to content height — measured at 8337px inside a 145px parent. The
    // box was never scrollable and the thread painted over the attention list.
    //
    // Flex sizing is measured against the parent's USED height, so it needs no
    // definite ancestor. `min-h-0` is load-bearing: a flex item defaults to
    // `min-height: auto` and refuses to shrink below its content, which would
    // reproduce the identical overflow.
    stubScrollMetrics({ scrollHeight: 0, clientHeight: 0, scrollTop: 0 });
    renderRegion([message('m1', 'first')]);
    expect(scroller()).toHaveClass('flex-1', 'min-h-0');
    expect(scroller()).not.toHaveClass('h-full');
  });
});

describe('DonnyThreadRegion — the scroll-to-bottom control', () => {
  it('stays hidden while the thread is already at its bottom', () => {
    // Mount pins to the bottom, so scrollTop is already scrollHeight here. The
    // assertion is that the epsilon arithmetic does not false-positive on an
    // overflowing-but-fully-scrolled thread.
    stubScrollMetrics({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });
    renderRegion([message('m1', 'first')]);
    fireEvent.scroll(scroller());
    expect(jumpButton()).not.toBeInTheDocument();
  });

  it('appears once the reader scrolls away from the bottom', () => {
    const metrics = stubScrollMetrics({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });
    renderRegion([message('m1', 'first')]);

    metrics.scrollTop = 0; // the reader scrolls back up to the start
    fireEvent.scroll(scroller());
    expect(jumpButton()).toBeInTheDocument();
  });

  it('returns the thread to the bottom on click, and then hides itself', () => {
    const metrics = stubScrollMetrics({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });
    renderRegion([message('m1', 'first')]);
    metrics.scrollTop = 0;
    fireEvent.scroll(scroller());

    fireEvent.click(jumpButton()!);

    expect(metrics.scrollTop).toBe(1000);
    expect(jumpButton()).not.toBeInTheDocument();
  });
});

describe('DonnyThreadRegion — following the reply', () => {
  it('pins to the newest message as it arrives', () => {
    const metrics = stubScrollMetrics({ scrollHeight: 1000, clientHeight: 300, scrollTop: 700 });
    const { rerenderWith } = renderRegion([message('m1', 'first')]);

    metrics.scrollHeight = 1600;
    rerenderWith([message('m1', 'first'), message('m2', 'second')]);

    expect(metrics.scrollTop).toBe(1600);
  });

  it('does not yank a reader who scrolled up to re-read an earlier answer', () => {
    const metrics = stubScrollMetrics({ scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });
    const { rerenderWith } = renderRegion([message('m1', 'first')]);
    // Register the reader's position — back at the top, 700px from the bottom.
    metrics.scrollTop = 0;
    fireEvent.scroll(scroller());

    metrics.scrollHeight = 1600;
    rerenderWith([message('m1', 'first'), message('m2', 'second')]);

    expect(metrics.scrollTop).toBe(0);
    // ...and the control is there to take them back down deliberately.
    expect(jumpButton()).toBeInTheDocument();
  });
});
