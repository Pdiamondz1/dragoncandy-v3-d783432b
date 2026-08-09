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

import { DonnyCanvas } from './DonnyCanvas';

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

function renderCanvas(
  props: Partial<Parameters<typeof DonnyCanvas>[0]> = {},
  children: ReactNode = <div>Dashboard body</div>
) {
  return render(
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

beforeEach(() => {
  vi.clearAllMocks();
  donnyContextMock.value = {
    setInline: setInlineMock,
    exitInline: exitInlineMock,
    registerInlineComposer: registerInlineComposerMock,
    markAllRead: markAllReadMock,
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

  it('marks nudges read exactly once on mount', () => {
    renderCanvas();
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
  it('submitting the composer calls onPromptSubmit and switches to thread — dashboard content gone, turns render', () => {
    donnyContextMock.value.messages = [msg({ id: 'u1', role: 'user', content: 'First question' })];
    const onPromptSubmit = vi.fn();
    const { container } = renderCanvas({ onPromptSubmit });

    const field = screen.getByRole('textbox', { name: /ask donny/i });
    fireEvent.change(field, { target: { value: 'find creators near me' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onPromptSubmit).toHaveBeenCalledWith('find creators near me');
    expect(screen.queryByText('Dashboard body')).not.toBeInTheDocument();
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
