// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/donny/DonnyRichCard', () => ({
  DonnyRichCard: () => <div data-testid="rich-card" />,
}));

import { DonnyTurn } from './DonnyTurn';
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

describe('DonnyTurn', () => {
  it('bubbles the user, so the thread reads as a document', () => {
    const { container } = render(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-turn="user"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).toBeInTheDocument();
  });

  it('does not bubble Donny', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-turn="assistant"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).not.toBeInTheDocument();
  });

  it('keeps Donny his avatar', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-donny-avatar]')).toBeInTheDocument();
  });

  it('gives the user no avatar', () => {
    const { container } = render(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-donny-avatar]')).not.toBeInTheDocument();
  });

  it('renders rich cards inline under the prose', () => {
    render(
      <DonnyTurn
        message={msg({ rich_cards: [{ type: 'creator_profile' }, { type: 'creator_profile' }] } as Partial<DonnyMessage>)}
      />
    );
    expect(screen.getAllByTestId('rich-card')).toHaveLength(2);
  });

  it('offers Retry only when the caller supplies a handler', () => {
    const { rerender } = render(<DonnyTurn message={msg({})} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    rerender(<DonnyTurn message={msg({})} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows no timestamp — nothing here is a message from a person', () => {
    const { container } = render(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('time')).not.toBeInTheDocument();
  });
});
