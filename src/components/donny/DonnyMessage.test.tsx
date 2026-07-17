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
});
