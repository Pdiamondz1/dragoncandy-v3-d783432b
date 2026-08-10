// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState, type ReactNode } from 'react';

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

// Lets a test hold the conversation query open, which is the only way to
// reproduce Finding 1's race: a send issued while the query is still in flight.
// vi.hoisted because the vi.mock factory below is hoisted above every import.
const conversationGate = vi.hoisted(() => {
  let release: (() => void) | null = null;
  let pending: Promise<void> | null = null;
  return {
    failing: false,
    /** Block `maybeSingle` until open()/fail() is called. */
    hold() {
      this.failing = false;
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    /** Let the query resolve with a conversation row. */
    open() {
      this.failing = false;
      release?.();
      release = null;
      pending = null;
    },
    /** Let the query REJECT — the "conversation never arrives" case. */
    fail() {
      this.failing = true;
      release?.();
      release = null;
      pending = null;
    },
    wait() {
      return pending ?? Promise.resolve();
    },
  };
});

// Minimal PostgREST-shaped stub: every chainable call returns the builder and
// the terminal call resolves. Only the two tables useDonny touches exist.
vi.mock('@/integrations/supabase/client', () => {
  type Builder = Record<string, (...args: unknown[]) => unknown>;

  const conversations = (): Builder => {
    const b: Builder = {};
    for (const method of ['select', 'eq', 'neq', 'is', 'order', 'limit']) {
      b[method] = () => b;
    }
    b.maybeSingle = async () => {
      await conversationGate.wait();
      if (conversationGate.failing) throw new Error('conversation fetch failed');
      return { data: conversationRow, error: null };
    };
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

import { supabase } from '@/integrations/supabase/client';
import { useDonny } from './useDonny';

const fetchMock = vi.fn();

function Wrapper({ children }: { children: ReactNode }) {
  // One client per MOUNT, not per render. `new QueryClient()` inline handed
  // every rerender a fresh cache, so any test that rerenders (e.g. to simulate
  // DonnyCanvas's mount effect flipping `enabled`) silently reset the very
  // in-flight query it was testing.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.value = null;
  conversationGate.open();
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
    const { result, rerender } = renderHook(() => useDonny(), { wrapper: Wrapper });

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

// Every `query` this hook has posted to donny-orchestrator, in call order.
const sentQueries = () =>
  fetchMock.mock.calls.map(
    (call) => JSON.parse((call[1] as RequestInit).body as string).query as string
  );

describe('useDonny — a send issued before the conversation resolves is held, not dropped', () => {
  it('holds the send while the conversation query is in flight, then posts it exactly once', async () => {
    // The race: DonnyCanvas flips the stage off 'closed' in a mount effect, so
    // this hook's conversation query does not even start until after first
    // paint. A suggestion tap in that window used to hit the
    // `!conversation || !user` guard and show "No active conversation".
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    expect(result.current.conversation).toBeNull();

    act(() => result.current.sendMessage('find creators near me'));

    // Held: no request yet, and — the whole point — no error either.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();

    await act(async () => {
      conversationGate.open();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // …and it stays at one. The drain effect re-runs on every mutation state
    // change; a queued item is shift()ed out before it is sent so it cannot be
    // replayed, and this pins that.
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts the ORIGINAL text of a held send, unmodified', async () => {
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('Find creators near me — Hoboken, 5 mi'));
    await act(async () => {
      conversationGate.open();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentQueries()[0]).toBe('Find creators near me — Hoboken, 5 mi');
  });

  it('posts BOTH of two rapid pre-readiness sends, in the order they were issued', async () => {
    // Two chip taps in the same tick. Serial drain, not parallel: mutationFn
    // rejects a second concurrent send ("Message already in flight"), so a
    // parallel flush would silently lose the second message.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => {
      result.current.sendMessage('first question');
      result.current.sendMessage('second question');
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      conversationGate.open();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(sentQueries()).toEqual(['first question', 'second question']);
  });

  it('still sends immediately when the conversation is already there', async () => {
    // No regression on the warm path: nothing is queued once the hook is ready.
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('ready now'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentQueries()).toEqual(['ready now']);
  });

  // The window ABOVE this one is "enabled, query in flight". These cover the
  // earlier window Codex found: `enabled` is still false because DonnyProvider
  // derives it from `stage`, and DonnyCanvas only leaves 'closed' in a MOUNT
  // EFFECT — which React runs after the first paint, while the composer and the
  // suggestion chips are already on screen and clickable. `enabled: false` IS
  // that window; the conversation query has not merely not resolved, it has not
  // started.
  it('holds a send issued while the stage is still "closed" (enabled: false), then posts it exactly once', async () => {
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny({ enabled: false }), { wrapper: Wrapper });

    expect(result.current.conversation).toBeNull();

    act(() => result.current.sendMessage('find creators near me'));

    // The symptom this fixes: an error card reading "No active conversation".
    expect(result.current.error).toBeNull();

    // And it does not wait for anything else to enable the hook — the send
    // turned the conversation query on itself. `enabled` stays false for the
    // whole test.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentQueries()).toEqual(['find creators near me']);

    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('sends a stage-"closed" send exactly once even when the stage flips right after it', async () => {
    // The real sequence: tap lands in the pre-effect window, then DonnyCanvas's
    // mount effect commits and `enabled` goes true. Two independent things
    // (`conversationPending` and the query gate) change in quick succession, so
    // this pins that the queue is drained once and not once per change.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result, rerender } = renderHook(({ enabled }) => useDonny({ enabled }), {
      wrapper: Wrapper,
      initialProps: { enabled: false },
    });

    act(() => result.current.sendMessage('find creators near me'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();

    rerender({ enabled: true });

    await act(async () => {
      conversationGate.open();
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentQueries()).toEqual(['find creators near me']);
  });

  it('restores the `enabled` gate once a stage-"closed" send has been discharged', async () => {
    // The send turns Donny's queries on; something has to turn them back off,
    // or one cold-start tap would leave the conversation query and its realtime
    // channel live for the rest of the session on a surface that never opened
    // Donny. Observable through the subscription's own teardown: it can only
    // run because `queriesEnabled` went false again while `conversation` stayed
    // in cache.
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny({ enabled: false }), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(vi.mocked(supabase.removeChannel)).toHaveBeenCalled());
  });

  it('does NOT hold forever when the stage stays closed and the conversation query fails', async () => {
    // The bound on the hold. Because the send itself starts the query, the wait
    // ends at that query's own terminal state — there is no clock and no
    // dependence on some other component ever mounting. Failure lands on the
    // pre-existing error card + Retry, which is feedback rather than silence.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny({ enabled: false }), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));

    // Let every pending microtask AND the mutation's own error path settle
    // before asserting the hold. Without this window the assertion is vacuous
    // under the defect: a send that fell straight through to the guard also
    // reads `error === null` for the first few ticks.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(result.current.error).toBeNull();

    await act(async () => {
      conversationGate.fail();
    });

    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives up and shows the existing error when the conversation query FAILS, rather than holding forever', async () => {
    // A queue that only drains on success would turn a failed conversation
    // fetch into a silent hang — the send accepted, nothing ever sent, no error
    // and no Retry on screen.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    expect(result.current.error).toBeNull();

    await act(async () => {
      conversationGate.fail();
    });

    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
