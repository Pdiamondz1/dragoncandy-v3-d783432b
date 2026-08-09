// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/donny/DonnyRichCard', () => ({
  DonnyRichCard: () => <div data-testid="rich-card" />,
}));

import { DonnyThread } from './DonnyThread';
import type { DonnyMessage } from '@/types/donny';

const msg = (over: Partial<DonnyMessage>): DonnyMessage =>
  ({
    id: 'm1',
    conversation_id: 'c1',
    role: 'assistant',
    content: 'Three creators near Hoboken shoot food content.',
    created_at: '2026-08-09T12:00:00Z',
    ...over,
  }) as DonnyMessage;

describe('DonnyThread', () => {
  it('renders one turn per message, in order', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'First question' }),
      msg({ id: 'a1', role: 'assistant', content: 'First answer' }),
      msg({ id: 'u2', role: 'user', content: 'Second question' }),
    ];
    const { container } = render(
      <DonnyThread messages={messages} isStreaming={false} streamingContent="" error={null} onRetry={vi.fn()} />
    );
    const turns = container.querySelectorAll('[data-turn]');
    expect(turns).toHaveLength(3);
    expect(turns[0]).toHaveTextContent('First question');
    expect(turns[1]).toHaveTextContent('First answer');
    expect(turns[2]).toHaveTextContent('Second question');
  });

  it('shows a shimmer placeholder while streaming with no content yet — never the three-dot indicator', () => {
    render(<DonnyThread messages={[]} isStreaming streamingContent="" error={null} onRetry={vi.fn()} />);
    expect(screen.getByTestId('donny-pending')).toBeInTheDocument();
    // DonnyTypingIndicator is the three-dot bounce indicator, identified by its
    // own role/label. The inline thread must never fall back to it.
    expect(screen.queryByRole('status', { name: /typing/i })).not.toBeInTheDocument();
  });

  it('renders partial streamed text as it arrives, instead of the shimmer', () => {
    render(
      <DonnyThread
        messages={[]}
        isStreaming
        streamingContent="Three creators near"
        error={null}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Three creators near/)).toBeInTheDocument();
    expect(screen.queryByTestId('donny-pending')).not.toBeInTheDocument();
  });

  it('shows the error with a Retry button that calls onRetry', () => {
    const onRetry = vi.fn();
    render(
      <DonnyThread
        messages={[]}
        isStreaming={false}
        streamingContent=""
        error="Donny lost the connection."
        onRetry={onRetry}
      />
    );
    expect(screen.getByText('Donny lost the connection.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the partial text on screen next to the error — a dropped stream must not lose it', () => {
    render(
      <DonnyThread
        messages={[]}
        isStreaming={false}
        streamingContent="Three creators near Hoboken"
        error="Donny lost the connection."
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByText(/Three creators near Hoboken/)).toBeInTheDocument();
    expect(screen.getByText('Donny lost the connection.')).toBeInTheDocument();
  });

  it('marks the thread as a live log region', () => {
    const { container } = render(
      <DonnyThread messages={[]} isStreaming={false} streamingContent="" error={null} onRetry={vi.fn()} />
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('role', 'log');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root).toHaveAttribute('aria-label', 'Donny conversation');
  });

  it('offers Retry on the last assistant turn only — exactly one Retry button given two assistant messages', () => {
    const onRetry = vi.fn();
    const messages = [
      msg({ id: 'a1', role: 'assistant', content: 'First answer' }),
      msg({ id: 'a2', role: 'assistant', content: 'Second answer' }),
    ];
    const { container } = render(
      <DonnyThread messages={messages} isStreaming={false} streamingContent="" error={null} onRetry={onRetry} />
    );

    // Strict count — this is the point of the test, not "at least one".
    expect(screen.getAllByRole('button', { name: /retry/i })).toHaveLength(1);

    const turns = container.querySelectorAll('[data-turn="assistant"]');
    expect(turns).toHaveLength(2);
    expect(within(turns[0] as HTMLElement).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    const lastTurnRetry = within(turns[1] as HTMLElement).getByRole('button', { name: /retry/i });
    fireEvent.click(lastTurnRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('scopes Retry to the error card when an assistant turn is already present — not the turn', () => {
    const onRetry = vi.fn();
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'What creators are near me?' }),
      msg({ id: 'a1', role: 'assistant', content: 'Three creators near Hoboken.' }),
    ];
    const { container } = render(
      <DonnyThread
        messages={messages}
        isStreaming={false}
        streamingContent=""
        error="Donny lost the connection."
        onRetry={onRetry}
      />
    );

    // Exactly one Retry on screen — the error card owns it, not the turn.
    expect(screen.getAllByRole('button', { name: /retry/i })).toHaveLength(1);

    const errorCard = screen.getByText('Donny lost the connection.').closest('div');
    expect(errorCard).not.toBeNull();
    const errorCardRetry = within(errorCard as HTMLElement).getByRole('button', { name: /retry/i });
    fireEvent.click(errorCardRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    // No turn — including the last assistant turn — carries a Retry of its own.
    const turns = container.querySelectorAll('[data-turn]');
    expect(turns).toHaveLength(2);
    turns.forEach((turn) => {
      expect(within(turn as HTMLElement).queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    });

    // The conversation itself is still on screen — an error doesn't replace it.
    expect(screen.getByText('Three creators near Hoboken.')).toBeInTheDocument();
  });

  it('offers no Retry while streaming, even with an assistant turn already present', () => {
    const messages = [
      msg({ id: 'u1', role: 'user', content: 'What creators are near me?' }),
      msg({ id: 'a1', role: 'assistant', content: 'Three creators near Hoboken.' }),
    ];
    render(
      <DonnyThread messages={messages} isStreaming streamingContent="" error={null} onRetry={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});
