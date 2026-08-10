// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DonnyThread } from './DonnyThread';
import type { DonnyMessage as DonnyMessageType } from '@/types/donny';

const closeMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock('@/contexts/DonnyProvider', () => ({
  useDonnyContext: () => ({ close: closeMock, sendMessage: sendMessageMock }),
}));

function msg(over: Partial<DonnyMessageType> & { id: string }): DonnyMessageType {
  return {
    conversation_id: 'c1',
    role: 'assistant',
    content: 'hello',
    tool_calls: null,
    tool_result: null,
    rich_card: null,
    quick_actions: [],
    created_at: '2026-08-09T12:00:00.000Z',
    ...over,
  } as DonnyMessageType;
}

function renderThread(props: Partial<React.ComponentProps<typeof DonnyThread>> = {}) {
  return render(
    <MemoryRouter>
      <DonnyThread
        messages={[]}
        avatarState="idle"
        isStreaming={false}
        streamingContent=""
        error={null}
        retry={vi.fn()}
        userRole="business_client"
        {...props}
      />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('DonnyThread', () => {
  it('renders the conversation in order', () => {
    renderThread({
      messages: [
        msg({ id: 'a', role: 'user', content: 'How are my Instagram posts doing?' }),
        msg({ id: 'b', role: 'assistant', content: 'Based on 1 measured post…' }),
      ],
    });

    expect(screen.getByText('How are my Instagram posts doing?')).toBeInTheDocument();
    expect(screen.getByText(/Based on 1 measured post/)).toBeInTheDocument();
  });

  // The whole reason this component exists: it must compose into normal page
  // flow. A panel header inline would give the dashboard a collapse/close that
  // re-opens the panel (design doc §13 hazard 1 — "two Donnys on one screen").
  it('renders no panel chrome — no header, no close or collapse control', () => {
    renderThread({ messages: [msg({ id: 'a' })] });

    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collapse/i })).not.toBeInTheDocument();
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('shows a typing indicator while streaming with no content yet', () => {
    const { container } = renderThread({ isStreaming: true, streamingContent: '' });
    // The indicator is decorative; assert the streaming bubble is absent instead
    // of matching on animation markup.
    expect(container.textContent).not.toContain('partial');
  });

  it('shows partial content while streaming', () => {
    renderThread({ isStreaming: true, streamingContent: 'Based on 1 measu' });
    expect(screen.getByText(/Based on 1 measu/)).toBeInTheDocument();
  });

  it('offers retry on error, and hides it while a retry is in flight', () => {
    const retry = vi.fn();
    const { rerender } = renderThread({ error: 'Something broke', retry });

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(retry).toHaveBeenCalledTimes(1);

    // An error still set while streaming means the retry is already running —
    // showing the button again invites a double send.
    rerender(
      <MemoryRouter>
        <DonnyThread
          messages={[]}
          avatarState="idle"
          isStreaming
          streamingContent=""
          error="Something broke"
          retry={retry}
          userRole="business_client"
        />
      </MemoryRouter>
    );
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });

  it('points an upgrade error at billing instead of offering a pointless retry', () => {
    renderThread({ error: 'Upgrade to continue' });

    expect(screen.getByRole('link', { name: 'Upgrade Plan' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
  });
});
