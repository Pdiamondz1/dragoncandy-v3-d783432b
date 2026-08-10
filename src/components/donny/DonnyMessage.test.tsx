// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DonnyMessage } from './DonnyMessage';
import type { DonnyMessage as DonnyMessageType } from '@/types/donny';

const navigateMock = vi.fn();
const closeMock = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const sendMessageMock = vi.fn();

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({ close: closeMock, sendMessage: sendMessageMock }),
}));

function stubViewport(isMobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isMobile,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const baseMessage: DonnyMessageType = {
  id: 'm1',
  conversation_id: 'c1',
  role: 'assistant',
  content: "I've pre-loaded the campaign builder — click below!",
  tool_calls: null,
  tool_result: null,
  rich_card: null,
  quick_actions: [
    { label: 'Open campaign builder', action: 'navigate', url: '/dashboard/business/campaigns/create?brief=x' },
  ],
  created_at: new Date().toISOString(),
};

function renderMessage(message: DonnyMessageType = baseMessage) {
  return render(
    <MemoryRouter>
      <DonnyMessage message={message} />
    </MemoryRouter>,
  );
}

describe('DonnyMessage quick actions', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    closeMock.mockClear();
  });

  // Regression: on mobile the Donny chat sheet is a fullscreen `inset-0`
  // overlay. Navigating without closing it changes the route *behind* the
  // sheet — the user sees nothing happen and the action buttons read as dead.
  it('closes the Donny overlay before navigating on mobile', () => {
    stubViewport(true);
    renderMessage();

    fireEvent.click(screen.getByRole('button', { name: 'Open campaign builder' }));

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/business/campaigns/create?brief=x');
  });

  it('keeps the docked desktop panel open when navigating', () => {
    stubViewport(false);
    renderMessage();

    fireEvent.click(screen.getByRole('button', { name: 'Open campaign builder' }));

    expect(closeMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard/business/campaigns/create?brief=x');
  });

  it('dismiss action hides the actions without closing the chat', () => {
    stubViewport(true);
    renderMessage({
      ...baseMessage,
      quick_actions: [{ label: 'Dismiss', action: 'dismiss' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(closeMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });
});

describe('DonnyMessage rich cards (plural creator-discovery cards)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    closeMock.mockClear();
    sendMessageMock.mockClear();
  });

  const cardMessage: DonnyMessageType = {
    ...baseMessage,
    content: 'Here are creators near Hoboken:',
    quick_actions: [{ label: 'Browse all creators', action: 'navigate', url: '/dashboard/business/creators' }],
    rich_cards: [
      {
        type: 'creator_profile',
        data: {
          id: 'u1',
          name: 'Ava Reels',
          avatar_url: null,
          profile_slug: 'ava-reels',
          platforms: ['Instagram', 'TikTok'],
          niche: 'Food, Lifestyle',
          rating: 4.8,
          project_count: 12,
          distance_miles: 5,
        },
      },
      {
        type: 'creator_profile',
        data: {
          id: 'u2',
          name: 'Bea Lens',
          avatar_url: null,
          profile_slug: 'bea-lens',
          platforms: ['YouTube'],
          niche: 'General',
          rating: 4.5,
          project_count: 3,
          distance_miles: 0.4,
        },
      },
    ],
  };

  it('renders one card per creator with distance and portfolio navigation', () => {
    stubViewport(false);
    renderMessage(cardMessage);

    // Both creator cards render.
    expect(screen.getByText('Ava Reels')).toBeInTheDocument();
    expect(screen.getByText('Bea Lens')).toBeInTheDocument();

    // Distance line: >= 1 mi rounds to "N mi away"; < 1 mi reads "Nearby".
    expect(screen.getByText('5 mi away')).toBeInTheDocument();
    expect(screen.getByText('Nearby')).toBeInTheDocument();

    // Each card owns its own "View Portfolio" nav (to the creator's public slug).
    const viewButtons = screen.getAllByRole('button', { name: 'View Portfolio' });
    expect(viewButtons).toHaveLength(2);
    fireEvent.click(viewButtons[0]);
    expect(navigateMock).toHaveBeenCalledWith('/creator/ava-reels');
  });

  it('does not render the plural block when rich_cards is absent (internal Donny parity)', () => {
    stubViewport(false);
    renderMessage({ ...baseMessage, rich_cards: null });

    expect(screen.queryByRole('button', { name: 'View Portfolio' })).not.toBeInTheDocument();
  });
  // The exact defect the founder hit on prod (2026-08-09): a markdown table in
  // an analytics answer reached the bubble as literal pipes, because
  // ReactMarkdown was running base CommonMark with no GFM plugin. Asserting the
  // RENDERED OUTPUT rather than the plugin's presence — 'remarkGfm is in the
  // array' would pass even if the components map dropped the table.
  it('renders a markdown table as a real table, not as raw pipes', () => {
    stubViewport(false);
    renderMessage({
      ...baseMessage,
      quick_actions: [],
      content: [
        'Based on **1 measured post**:',
        '',
        '| Metric | Total |',
        '|--------|-------|',
        '| Views | 1 |',
        '| Likes | 0 |',
      ].join('\n'),
    });

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Views' })).toBeInTheDocument();
    // The failure signature: the pipe characters must not survive as text.
    expect(table.textContent).not.toContain('|');
  });

  it('keeps a wide table inside its own scroll container, never widening the bubble', () => {
    stubViewport(true);
    renderMessage({
      ...baseMessage,
      quick_actions: [],
      content: ['| A | B | C | D | E |', '|---|---|---|---|---|', '| 1 | 2 | 3 | 4 | 5 |'].join('\n'),
    });

    // A bubble that grows to fit a table pushes the whole chat column sideways
    // on a phone, which is the reason wide content scrolls itself here.
    const wrapper = screen.getByRole('table').parentElement;
    expect(wrapper).toHaveClass('overflow-x-auto');
  });
});
