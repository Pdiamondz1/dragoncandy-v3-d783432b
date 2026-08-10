// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { DonnyProvider, useDonnyContext } from './DonnyProvider';

// The property under test is an ARGUMENT the provider passes to useDonny, so
// the fake records it. Asserting on rendered messages instead would prove
// nothing here — with the query disabled the hook returns an empty list, which
// is indistinguishable from "no messages yet". That ambiguity is exactly how
// this would have shipped broken.
const useDonnyCalls: Array<{ enabled?: boolean }> = [];
vi.mock('@/hooks/useDonny', () => ({
  useDonny: (options: { enabled?: boolean }) => {
    useDonnyCalls.push({ enabled: options?.enabled });
    return {
      messages: [],
      conversation: null,
      isStreaming: false,
      streamingContent: '',
      error: null,
      sendMessage: vi.fn(),
      retry: vi.fn(),
      clearChat: vi.fn(),
      archiveConversation: vi.fn(),
      avatarState: 'idle',
    };
  },
}));

vi.mock('@/hooks/useDonnyNudges', () => ({
  useDonnyNudges: () => ({ nudges: [], unreadCount: 0, actOnNudge: vi.fn(), dismissNudge: vi.fn() }),
}));

// The provider reaches useAuth through useDonnyQuickChips; neither is under
// test here, and a real AuthProvider would drag in Supabase session handling.
vi.mock('@/hooks/useDonnyQuickChips', () => ({
  useDonnyQuickChips: () => [],
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', role: 'business_client' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
    }),
  },
}));

/** Mounts, registers as an inline surface, and unregisters on unmount. */
function InlineSurface() {
  const { registerInlineConversation } = useDonnyContext();
  useEffect(() => registerInlineConversation(), [registerInlineConversation]);
  return <div>inline</div>;
}

function Bare() {
  useDonnyContext();
  return <div>bare</div>;
}

function renderWith(child: React.ReactNode) {
  return render(
    <MemoryRouter>
      <DonnyProvider userRole="business_client">{child}</DonnyProvider>
    </MemoryRouter>
  );
}

const lastEnabled = () => useDonnyCalls[useDonnyCalls.length - 1]?.enabled;

beforeEach(() => {
  useDonnyCalls.length = 0;
});

describe('DonnyProvider — inline conversation registration', () => {
  // The bug this prevents: the dashboard renders the thread with the panel
  // closed, the query never runs, and the user sees an empty box forever.
  it('leaves the conversation disabled when nothing is showing it', () => {
    renderWith(<Bare />);
    expect(lastEnabled()).toBe(false);
  });

  it('enables the conversation while an inline surface is mounted, with the panel still closed', () => {
    renderWith(<InlineSurface />);
    expect(lastEnabled()).toBe(true);
  });

  it('disables it again once the inline surface unmounts', () => {
    const { unmount, rerender } = renderWith(<InlineSurface />);
    expect(lastEnabled()).toBe(true);

    act(() => {
      rerender(
        <MemoryRouter>
          <DonnyProvider userRole="business_client">
            <Bare />
          </DonnyProvider>
        </MemoryRouter>
      );
    });
    expect(lastEnabled()).toBe(false);
    unmount();
  });

  // A count, not a boolean: two surfaces, or a remount whose new effect runs
  // before the old cleanup, must not switch the conversation off under the one
  // still showing it.
  it('stays enabled while a second surface is still mounted', () => {
    const { rerender } = renderWith(
      <>
        <InlineSurface />
        <InlineSurface />
      </>
    );
    expect(lastEnabled()).toBe(true);

    act(() => {
      rerender(
        <MemoryRouter>
          <DonnyProvider userRole="business_client">
            <InlineSurface />
          </DonnyProvider>
        </MemoryRouter>
      );
    });
    expect(lastEnabled()).toBe(true);
  });
});
