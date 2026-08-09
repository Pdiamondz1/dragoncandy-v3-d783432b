// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

const authMock: { value: { id: string } | null } = { value: null };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authMock.value,
    profile: { role: 'business_client' },
    activeOrg: null,
  }),
}));

const conversationRow = {
  id: 'conv1',
  user_id: 'u1',
  created_at: '2026-08-09T12:00:00Z',
  last_message_at: '2026-08-09T12:00:00Z',
  context_snapshot: null,
};

const messageInsertMock = vi.fn(() => Promise.resolve({ error: null }));

// Minimal PostgREST-shaped stub: every chainable call returns the builder and
// the terminal call resolves. Only the two tables useDonny touches exist.
vi.mock('@/integrations/supabase/client', () => {
  type Builder = Record<string, (...args: unknown[]) => unknown>;

  const conversations = (): Builder => {
    const b: Builder = {};
    for (const method of ['select', 'eq', 'neq', 'is', 'order', 'limit']) {
      b[method] = () => b;
    }
    b.maybeSingle = () => Promise.resolve({ data: conversationRow, error: null });
    b.single = () => Promise.resolve({ data: conversationRow, error: null });
    return b;
  };

  const messages = (): Builder => {
    const b: Builder = {};
    b.select = () => b;
    b.eq = () => b;
    b.order = () => Promise.resolve({ data: [], error: null });
    b.insert = messageInsertMock;
    return b;
  };

  const channel = () => {
    const ch = { on: () => ch, subscribe: () => ch };
    return ch;
  };

  return {
    supabase: {
      from: (table: string) => (table === 'donny_conversations' ? conversations() : messages()),
      channel,
      removeChannel: vi.fn(),
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } }),
      },
    },
    SUPABASE_URL: 'https://example.test',
  };
});

import { useDonny } from './useDonny';

const fetchMock = vi.fn();

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.value = null;
  fetchMock.mockResolvedValue({
    ok: true,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ answer: 'Three creators near Hoboken.', suggested_actions: [] }),
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDonny — retry after a send that failed before the conversation existed', () => {
  it('resends the original text once a conversation is available', async () => {
    // A suggestion chip on the inline dashboard can fire before the
    // conversation query resolves; the send then throws on the
    // `!conversation || !user` guard. Retry must still work — it used to do
    // nothing at all, because lastUserMessage was only recorded AFTER that
    // guard.
    const { result, rerender } = renderHook(() => useDonny(), { wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(fetchMock).not.toHaveBeenCalled();

    // The conversation arrives (user resolves, query runs).
    authMock.value = { id: 'u1' };
    rerender();
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.retry());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.query).toBe('find creators near me');
  });
});
