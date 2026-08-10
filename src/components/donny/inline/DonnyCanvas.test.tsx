// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { DonnyMessage } from '@/types/donny';
import type { DonnySuggestion } from '@/lib/donny/donnyHomeSuggestions';

const setInlineMock = vi.fn();
const exitInlineMock = vi.fn();
const registerInlineComposerMock = vi.fn();
const markAllReadMock = vi.fn();
const retryMock = vi.fn();

// Mutable context mock (the DonnyHome.test.tsx wrapper-object pattern) — each
// test reassigns `donnyContextMock.value` fields it cares about instead of
// re-mocking the module.
const donnyContextMock = {
  value: {
    setInline: setInlineMock,
    exitInline: exitInlineMock,
    registerInlineComposer: registerInlineComposerMock,
    markAllRead: markAllReadMock,
    unreadCount: 0,
    messages: [] as DonnyMessage[],
    isStreaming: false,
    streamingContent: '',
    error: null as string | null,
    retry: retryMock,
  },
};

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => donnyContextMock.value,
}));

import { stubMatchMedia } from '@/test/stubMatchMedia';
import { DonnyCanvas } from './DonnyCanvas';

// DonnyComposer branches Enter-vs-newline on useIsMobile, which subscribes to
// window.matchMedia; jsdom has none.
stubMatchMedia();

const msg = (over: Partial<DonnyMessage>): DonnyMessage =>
  ({
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'Hi there',
    created_at: '2026-08-09T12:00:00Z',
    tool_calls: null,
    tool_result: null,
    rich_card: null,
    quick_actions: null,
    ...over,
  }) as DonnyMessage;

const suggestions: DonnySuggestion[] = [
  { label: 'Find creators near me', message: 'Find creators near me' },
  { label: 'Create a campaign', message: 'Create a campaign for my restaurant' },
  { label: "What's trending?", message: "What's trending for restaurants near me?" },
];

// A fresh element every call — `rerender(sameElementObject)` lets React bail
// out on referential identity, which would make a rerender-driven test vacuous.
function canvasTree(
  props: Partial<Parameters<typeof DonnyCanvas>[0]> = {},
  children: ReactNode = <div>Dashboard body</div>
) {
  return (
    <MemoryRouter>
      <DonnyCanvas
        suggestions={suggestions}
        onSuggestionTap={vi.fn()}
        onPromptSubmit={vi.fn()}
        {...props}
      >
        {children}
      </DonnyCanvas>
    </MemoryRouter>
  );
}

function renderCanvas(
  props: Partial<Parameters<typeof DonnyCanvas>[0]> = {},
  children: ReactNode = <div>Dashboard body</div>
) {
  return render(canvasTree(props, children));
}

beforeEach(() => {
  vi.clearAllMocks();
  donnyContextMock.value = {
    setInline: setInlineMock,
    exitInline: exitInlineMock,
    registerInlineComposer: registerInlineComposerMock,
    markAllRead: markAllReadMock,
    unreadCount: 0,
    messages: [],
    isStreaming: false,
    streamingContent: '',
    error: null,
    retry: retryMock,
  };
});

describe('DonnyCanvas — stage lifecycle', () => {
  it('claims the inline stage exactly once on mount', () => {
    renderCanvas();
    expect(setInlineMock).toHaveBeenCalledTimes(1);
  });

  it('releases the inline stage on unmount', () => {
    const { unmount } = renderCanvas();
    unmount();
    expect(exitInlineMock).toHaveBeenCalledTimes(1);
  });

  // These three replace a single "marks nudges read exactly once on mount"
  // assertion. That test pinned the DEFECT: markAllRead guards on a closure
  // snapshot of the nudges array (`useDonnyNudges.ts`), so a lone call at mount
  // is a no-op on every load where the query has not resolved yet — and the
  // launcher badge then reads "3" forever. Keyed on unreadCount instead; the
  // underlying UPDATE is `.is('read_at', null)`, so re-firing is idempotent.
  it('marks nudges read when there is something unread', () => {
    donnyContextMock.value.unreadCount = 2;
    renderCanvas();
    expect(markAllReadMock).toHaveBeenCalledTimes(1);
  });

  it('does not mark read when there is nothing unread', () => {
    renderCanvas();
    expect(markAllReadMock).not.toHaveBeenCalled();
  });

  it('marks read when nudges land AFTER mount — the load race the mount-once call lost', () => {
    const { rerender } = renderCanvas();
    expect(markAllReadMock).not.toHaveBeenCalled();

    donnyContextMock.value.unreadCount = 3;
    rerender(canvasTree());

    expect(markAllReadMock).toHaveBeenCalledTimes(1);
  });
});

describe('DonnyCanvas — D6: always starts resting', () => {
  it('mounts resting even with messages already present — dashboard content shows, no turns render', () => {
    donnyContextMock.value.messages = [
      msg({ id: 'u1', role: 'user', content: 'First question' }),
      msg({ id: 'a1', role: 'assistant', content: 'First answer' }),
    ];
    const { container } = renderCanvas();
    expect(screen.getByText('Dashboard body')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-turn]')).toHaveLength(0);
  });
});

describe('DonnyCanvas — resting to thread', () => {
  it('submitting the composer calls onPromptSubmit and switches to thread — dashboard content gone, the new turn renders', () => {
    // Amended for the this-visit-only rule: the prior message is now BELOW the
    // baseline, so the turn that appears has to be one that arrived after the
    // send, not one that was already persisted.
    donnyContextMock.value.messages = [msg({ id: 'u1', role: 'user', content: 'First question' })];
    const onPromptSubmit = vi.fn();
    const { container, rerender } = render(canvasTree({ onPromptSubmit }));

    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onPromptSubmit).toHaveBeenCalledWith('find creators near me');
    expect(screen.queryByText('Dashboard body')).not.toBeInTheDocument();

    donnyContextMock.value.messages = [
      ...donnyContextMock.value.messages,
      msg({ id: 'u2', role: 'user', content: 'find creators near me' }),
    ];
    rerender(canvasTree({ onPromptSubmit }));

    expect(container.querySelectorAll('[data-turn]')).toHaveLength(1);
  });

  it('keeps the composer as the SAME DOM element across the resting-to-thread transition — regression test for the remount hazard', () => {
    renderCanvas();
    const before = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(before, { target: { value: 'hi' } });
    fireEvent.keyDown(before, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: /ask donny/i })).toBe(before);
  });

  it('a suggestion tap calls onSuggestionTap and also enters thread state', () => {
    const onSuggestionTap = vi.fn();
    renderCanvas({ onSuggestionTap });

    fireEvent.click(screen.getByRole('button', { name: suggestions[0].label }));

    expect(onSuggestionTap).toHaveBeenCalledWith(suggestions[0]);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  });

  it('taps a non-first suggestion (index 1) and reports THAT one, not the first', () => {
    // Restores a guarantee the deleted DonnyHomePrompt.test.tsx used to carry
    // explicitly (it clicked BUSINESS_SUGGESTIONS[1]). Every other test in
    // this file only ever taps suggestions[0], so a canvas that hard-coded
    // "always report suggestions[0]" would pass everything else on the branch.
    const onSuggestionTap = vi.fn();
    renderCanvas({ onSuggestionTap });

    fireEvent.click(screen.getByRole('button', { name: suggestions[1].label }));

    expect(onSuggestionTap).toHaveBeenCalledWith(suggestions[1]);
  });
});

describe('DonnyCanvas — the thread shows this visit only', () => {
  const priorTurns = [
    msg({ id: 'u1', role: 'user', content: 'Question from last week' }),
    msg({ id: 'a1', role: 'assistant', content: 'Answer from last week' }),
  ];

  it('shows only the new exchange, not every turn ever persisted', () => {
    // useDonny fetches the whole conversation with no limit, so without a
    // baseline one question would materialise months of history above the
    // answer — and the scroll effect would jump the user to the bottom of it.
    donnyContextMock.value.messages = priorTurns;
    const { container, rerender } = render(canvasTree());

    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    donnyContextMock.value.messages = [
      ...priorTurns,
      msg({ id: 'u2', role: 'user', content: 'find creators near me' }),
      msg({ id: 'a2', role: 'assistant', content: 'Three creators near Hoboken.' }),
    ];
    rerender(canvasTree());

    expect(container.querySelectorAll('[data-turn]')).toHaveLength(2);
    expect(screen.queryByText('Question from last week')).not.toBeInTheDocument();
    expect(screen.queryByText('Answer from last week')).not.toBeInTheDocument();
    expect(screen.getByText('Three creators near Hoboken.')).toBeInTheDocument();
  });

  it('keeps the first exchange of the visit visible when a second question is asked', () => {
    // The baseline moves on the resting→thread edge ONLY. If it re-anchored on
    // every send, each answer would erase the one before it.
    donnyContextMock.value.messages = priorTurns;
    const { container, rerender } = render(canvasTree());

    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'first question' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    donnyContextMock.value.messages = [
      ...priorTurns,
      msg({ id: 'u2', role: 'user', content: 'first question' }),
      msg({ id: 'a2', role: 'assistant', content: 'first answer' }),
    ];
    rerender(canvasTree());

    fireEvent.change(field, { target: { value: 'second question' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    donnyContextMock.value.messages = [
      ...donnyContextMock.value.messages,
      msg({ id: 'u3', role: 'user', content: 'second question' }),
    ];
    rerender(canvasTree());

    expect(container.querySelectorAll('[data-turn]')).toHaveLength(3);
    expect(screen.getByText('first answer')).toBeInTheDocument();
    expect(screen.queryByText('Question from last week')).not.toBeInTheDocument();
  });
});

describe('DonnyCanvas — a send the canvas did not start still lands somewhere', () => {
  it('enters thread state when streaming begins while resting', () => {
    // DonnyHome's proposal handler calls sendMessage() directly for an 'ask'
    // CTA and never touches this component's mode — such a tap would otherwise
    // stream a real answer, burn a Donny call, and render nothing.
    donnyContextMock.value.messages = [msg({ id: 'u1', role: 'user', content: 'Old question' })];
    const { container, rerender } = render(canvasTree());
    expect(screen.getByText('Dashboard body')).toBeInTheDocument();

    donnyContextMock.value.isStreaming = true;
    rerender(canvasTree());

    expect(screen.queryByText('Dashboard body')).not.toBeInTheDocument();
    expect(screen.getByTestId('donny-pending')).toBeInTheDocument();
    // The baseline is taken on this path too — the old turn stays hidden.
    expect(container.querySelectorAll('[data-turn]')).toHaveLength(0);
    expect(screen.queryByText('Old question')).not.toBeInTheDocument();
  });

  // The D6 counterpart — that this effect does NOT fire at mount — is already
  // pinned by "mounts resting even with messages already present" above, which
  // renders with isStreaming false and asserts zero turns. Not repeated here.
});

describe('DonnyCanvas — suggestion chips', () => {
  it('renders one tap per suggestion, not just the first', () => {
    // Guards against a canvas that renders only suggestions[0] and silently
    // drops the rest — every other test in this file taps suggestions[0]
    // only, so nothing else here would catch that regression.
    renderCanvas();
    for (const s of suggestions) {
      expect(screen.getByRole('button', { name: s.label })).toBeInTheDocument();
    }
    const chipButtons = screen
      .getAllByRole('button')
      .filter((btn) => suggestions.some((s) => s.label === btn.textContent));
    expect(chipButtons).toHaveLength(suggestions.length);
  });
});

// HONEST SCOPE: jsdom loads no CSS and lays nothing out, so every assertion in
// this block pins the class VALUE the component asks for — not that the bar
// actually pins, actually clears MobileBottomNav, or actually escapes
// DashboardLayout's overflow wrappers. Those are browser facts and belong to
// the both-viewport verify-prod pass. What these DO prove is that the recipe
// cannot silently regress to the inert `sticky` it replaced.
describe('DonnyCanvas — thread composer positioning (class values only)', () => {
  const wrapperClassOf = (container: HTMLElement) =>
    container.querySelector("[data-tour='brief-generator']")!.parentElement!.className;

  const enterThread = () => {
    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'hi' } });
    fireEvent.keyDown(field, { key: 'Enter' });
  };

  it('asks for no positioning at all while resting', () => {
    const { container } = renderCanvas();
    const cls = wrapperClassOf(container);
    expect(cls).not.toContain('fixed');
    expect(cls).not.toContain('sticky');
  });

  it('asks for the documented mobile fixed-bar recipe in thread mode', () => {
    const { container } = renderCanvas();
    enterThread();
    const cls = wrapperClassOf(container);

    // `fixed`, not `sticky`: DashboardLayout's `overflow-x-hidden` root (:182)
    // and mobile content wrapper (:309) compute to scroll containers per CSS
    // Overflow 3, and neither ever scrolls — so a sticky here was inert. A
    // fixed box's containing block is the viewport, so it escapes both.
    expect(cls).toContain('fixed');
    expect(cls).not.toContain('sticky');
    // Full-bleed on mobile (no sidebar there), with the app's own gutter.
    expect(cls).toContain('left-0');
    expect(cls).toContain('right-0');
    expect(cls).toContain('px-4');
    // Clears MobileBottomNav (fixed bottom-0 z-40, opaque, portaled to <body>);
    // 6rem mirrors the content area's pb-24 nav clearance and absorbs the
    // safe-area inset. Same shape and value as StickyApplyCTA.
    expect(cls).toContain('bottom-[calc(6rem+env(safe-area-inset-bottom))]');
    // The offset already absorbs the safe area; a second pad would double it.
    expect(cls).not.toContain('pb-[env(safe-area-inset-bottom)]');
    // App chrome, never the Radix modal layer (docs/DESIGN_SYSTEM.md).
    expect(cls).toContain('z-40');
    expect(cls).not.toContain('z-50');
  });

  it('leaves the composer IN FLOW on desktop — no md: pinning until a browser confirms one', () => {
    const { container } = renderCanvas();
    enterThread();
    const cls = wrapperClassOf(container);

    expect(cls).toContain('md:static');
    // The previous `md:bottom-0` pinned nothing (see above) and a replacement
    // cannot be designed from jsdom: <main>'s content column is centred beside
    // a collapsible sidebar, so a viewport-fixed bar needs a measured width.
    expect(cls).not.toContain('md:bottom-0');
    expect(cls).not.toContain('md:fixed');
    expect(cls).not.toContain('md:sticky');
  });

  it('pads the thread on mobile so the out-of-flow bar cannot cover the newest turn', () => {
    const { container } = renderCanvas();
    const root = () => container.querySelector("[data-tour='brief-generator']")!.parentElement!
      .parentElement!;

    // Resting: the composer is in flow, so no reserved space is needed.
    expect(root().className).not.toContain('pb-32');

    enterThread();

    expect(root().className).toContain('pb-32');
    // Desktop keeps the composer in flow, so the reservation is mobile-only.
    expect(root().className).toContain('md:pb-0');
  });
});

describe('DonnyCanvas — back link', () => {
  it('shows no "Dashboard" link while resting', () => {
    renderCanvas();
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it('shows a "Dashboard" link pointing at the overview route once in thread state', () => {
    renderCanvas();
    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'hi' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    const link = screen.getByRole('link', { name: /dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard/business/overview');
  });
});
