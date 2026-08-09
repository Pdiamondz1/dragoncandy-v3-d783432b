// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';

vi.mock('@/components/donny/DonnyRichCard', () => ({
  DonnyRichCard: () => <div data-testid="rich-card" />,
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { DonnyTurn } from './DonnyTurn';
import type { DonnyMessage } from '@/types/donny';

const renderTurn = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => vi.clearAllMocks());

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
    const { container } = renderTurn(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-turn="user"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).toBeInTheDocument();
  });

  it('does not bubble Donny', () => {
    const { container } = renderTurn(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-turn="assistant"]')).toBeInTheDocument();
    expect(container.querySelector('[data-bubble="true"]')).not.toBeInTheDocument();
  });

  it('keeps Donny his avatar', () => {
    const { container } = renderTurn(<DonnyTurn message={msg({})} />);
    expect(container.querySelector('[data-donny-avatar]')).toBeInTheDocument();
  });

  it('gives the user no avatar', () => {
    const { container } = renderTurn(<DonnyTurn message={msg({ role: 'user', content: 'hi' })} />);
    expect(container.querySelector('[data-donny-avatar]')).not.toBeInTheDocument();
  });

  it('renders rich cards inline under the prose', () => {
    renderTurn(
      <DonnyTurn
        message={msg({ rich_cards: [{ type: 'creator_profile' }, { type: 'creator_profile' }] } as Partial<DonnyMessage>)}
      />
    );
    expect(screen.getAllByTestId('rich-card')).toHaveLength(2);
  });

  it('offers Retry only when the caller supplies a handler', () => {
    const { rerender } = renderTurn(<DonnyTurn message={msg({})} />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <DonnyTurn message={msg({})} onRetry={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows no timestamp — nothing here is a message from a person', () => {
    // Asserted on the RENDERED TEXT, not on a <time> tag: nothing in this
    // codebase renders a timestamp semantically. DonnyMessage.tsx — the file
    // this component's prose was extracted from — uses a plain <span> around
    // formatBubbleTime(), which produces "2:34 PM". A tag-absence assertion
    // would stay green if someone copy-pasted that span in here, which is
    // exactly the regression worth catching.
    const { container } = renderTurn(<DonnyTurn message={msg({})} />);
    expect(container).not.toHaveTextContent(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });
});

describe('DonnyTurn — quick actions', () => {
  // donny-orchestrator emits suggested_actions specifically to satisfy this
  // project's "Never end on a dead end" contract, and useDonny persists them
  // as quick_actions. The panel renders them; the inline surface dropped them.
  it("renders Donny's suggested next steps and navigates on tap", () => {
    renderTurn(
      <DonnyTurn
        message={msg({
          quick_actions: [{ label: 'See my campaigns', action: 'navigate', url: '/dashboard/business/campaigns' }],
        })}
      />
    );
    const cta = screen.getByRole('button', { name: 'See my campaigns' });
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/business/campaigns');
  });

  it('drops an action pointing at a route that does not exist, rather than 404ing', () => {
    renderTurn(
      <DonnyTurn
        message={msg({
          quick_actions: [
            { label: 'Invite Creators', action: 'navigate', url: '/dashboard/business/invite' },
            { label: 'See my campaigns', action: 'navigate', url: '/dashboard/business/campaigns' },
          ],
        })}
      />
    );
    expect(screen.queryByRole('button', { name: 'Invite Creators' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'See my campaigns' })).toBeInTheDocument();
  });
});

describe('DonnyTurn — Copy and Retry are reachable on touch', () => {
  it('shows the action row by default and hides it behind hover only from lg: up', () => {
    // Touch has no hover and focus-within needs a keyboard, so a bare
    // opacity-0 left these permanently invisible on a phone — while still
    // hit-testable, so a stray tap could fire Retry.
    const { container } = renderTurn(<DonnyTurn message={msg({})} onRetry={vi.fn()} />);
    const actionRow = screen.getByRole('button', { name: /copy/i }).parentElement!;
    expect(container.querySelector('[data-turn="assistant"]')).toContainElement(actionRow);
    expect(actionRow.className).toContain('opacity-100');
    expect(actionRow.className).toContain('lg:opacity-0');
    expect(actionRow.className).toContain('lg:group-hover:opacity-100');
    expect(actionRow.className).toContain('lg:focus-within:opacity-100');
    // The unqualified opacity-0 is what made it invisible on every phone.
    expect(actionRow.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
  });
});
