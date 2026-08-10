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
    /**
     * How many times the conversation query has actually RUN. A failed
     * conversation query used to be terminal — nothing ever asked for a
     * conversation again — so "the query was restarted" is the property the
     * recovery tests have to assert, and it is invisible from the send alone.
     */
    fetches: 0,
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
      conversationGate.fetches += 1;
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
  conversationGate.fetches = 0;
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

// donny-orchestrator answers with SSE in production; the JSON branch every
// other test in this file exercises is only its fallback. The two branches
// insert the assistant row through separate code, so the streaming one needs
// its own coverage or half the id recording is unpinned.
function sseResponse(answer: string): Response {
  const encoder = new TextEncoder();
  const frames = [
    `event: text_delta\ndata: ${JSON.stringify({ text: answer })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ answer, suggested_actions: [], rich_cards: [] })}\n\n`,
  ].map((frame) => encoder.encode(frame));
  let i = 0;
  return {
    ok: true,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader: () => ({
        read: async () =>
          i < frames.length ? { done: false, value: frames[i++] } : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

describe('useDonny — the ids of the rows this client writes', () => {
  it('reports both halves of an exchange, and they are the ids actually inserted', async () => {
    // DonnyCanvas scopes its thread to "this visit" by MEMBERSHIP in this list,
    // so if either half went unrecorded the user would watch their own question
    // — or Donny's answer — never appear. An index-based baseline could not do
    // this job at all: `messages` is empty on a cold load, so a count taken
    // then means "show everything".
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));

    const rows = messageInsertMock.mock.calls.map(
      (call) => (call as unknown as [{ id: string; role: string }])[0]
    );
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    // The id is chosen client-side and sent WITH the insert, so what this hook
    // reports is what the row actually carries — no read-back, no guessing.
    expect(result.current.clientMessageIds).toEqual(rows.map((r) => r.id));
    // `donny_messages.id` is a `uuid` column; a placeholder would be rejected
    // by Postgres long before any of this mattered.
    for (const row of rows) {
      expect(row.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }
  });

  it('records the assistant id on the STREAMING path too, not just the JSON fallback', async () => {
    fetchMock.mockResolvedValue(sseResponse('Three creators near Hoboken.'));
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));

    const rows = messageInsertMock.mock.calls.map(
      (call) => (call as unknown as [{ id: string; role: string; content: string }])[0]
    );
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(rows[1].content).toBe('Three creators near Hoboken.');
    expect(result.current.clientMessageIds).toEqual(rows.map((r) => r.id));
  });
});

// The rows this hook actually handed to `donny_messages.insert`, in call order.
const insertedRows = () =>
  messageInsertMock.mock.calls.map(
    (call) => (call as unknown as [{ id: string; role: string; content: string }])[0]
  );

describe('useDonny — Retry writes the user row when the failed send never did', () => {
  it('inserts the user row on a retry after a failure that happened BEFORE the insert', async () => {
    // `isRetry` was standing in for "the user row already exists", and those
    // are different facts. A send that dies on the `!conversation || !user`
    // guard — the cold-load path a suggestion chip provokes — writes nothing,
    // but retry() replays with `isRetry: true`, which used to skip the insert.
    // Donny's answer was then persisted with no question above it: the
    // conversation is missing the user's turn in the DATABASE, permanently.
    //
    // The retry runs down the SSE branch, which is what production serves; the
    // JSON fallback every other test here uses is not the path that ships.
    fetchMock.mockResolvedValue(sseResponse('Three creators near Hoboken.'));

    const { result, rerender } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    // Nothing was written — that is the premise of the whole test.
    expect(messageInsertMock).not.toHaveBeenCalled();

    authMock.value = { id: 'u1' };
    rerender();
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));

    const rows = insertedRows();
    // Exactly one user row, carrying the user's actual question…
    expect(rows.filter((r) => r.role === 'user')).toHaveLength(1);
    expect(rows[0].content).toBe('find creators near me');
    // …written BEFORE the answer, and reported in that order — which is what
    // puts the question above the answer in DonnyCanvas, whose visit window is
    // membership in exactly this list.
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(result.current.clientMessageIds).toEqual(rows.map((r) => r.id));
  });

  it('does NOT write a second user row when the failure happened AFTER the insert', async () => {
    // The other half of the same fact. Here the row exists, so the retry has to
    // regenerate the answer without duplicating the question — the failure is
    // at the fetch, downstream of the insert.
    authMock.value = { id: 'u1' };
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(messageInsertMock).toHaveBeenCalledTimes(1);
    expect(insertedRows()[0].role).toBe('user');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));

    expect(insertedRows().map((r) => r.role)).toEqual(['user', 'assistant']);
  });

  it('writes its own user row for a genuinely NEW message after a successful send', async () => {
    // The reset. Tracking "the row exists" without clearing it when a new
    // question is asked would just trade one dropped turn for another: every
    // message after the first would answer with nothing above it.
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('first question'));
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));
    // onSuccess is what releases isSendingRef, and it runs AFTER the assistant
    // id is recorded — without this the second send would be swallowed by the
    // in-flight guard and the test would prove nothing.
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    act(() => result.current.sendMessage('second question'));
    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(4));

    const rows = insertedRows();
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(rows[2].content).toBe('second question');
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

  it('restarts a FAILED conversation query on Retry, and the retried send actually posts', async () => {
    // A failed conversation query was a dead end. `conversationError` made the
    // send fall straight through to the `!conversation` guard, so Retry
    // re-emitted "No active conversation" for ever — and nothing anywhere asked
    // for a conversation again. A Retry button that cannot succeed is precisely
    // the failure this surface exists to remove.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await act(async () => {
      conversationGate.fail();
    });
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(conversationGate.fetches).toBe(1);

    // The next attempt succeeds — a TRANSIENT failure, which is the case the
    // finding is about.
    conversationGate.open();
    act(() => result.current.retry());

    // The query itself ran again. Without this the Retry could only ever re-run
    // the guard against a conversation that was never re-requested.
    await waitFor(() => expect(conversationGate.fetches).toBe(2));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentQueries()).toEqual(['find creators near me']);
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it('restarts a failed conversation query for a send made while the stage is still "closed"', async () => {
    // The compound case the finding calls out: the send lands in the pre-effect
    // window (`enabled: false`) AND the conversation query has already failed.
    // Neither existing mechanism could recover it — the queue excluded it
    // because an error was cached, and the fall-through only re-ran the guard.
    // This is also the branch where resetQueries CANNOT refetch on its own (the
    // query has no active observer while the stage is closed); the send's own
    // `enabled` false→true flip is what runs it.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny({ enabled: false }), { wrapper: Wrapper });

    act(() => result.current.sendMessage('first try'));
    await act(async () => {
      conversationGate.fail();
    });
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(conversationGate.fetches).toBe(1);

    // Hold the second attempt open. Asserting only the eventual outcome would
    // NOT pin the restart here: flipping `enabled` re-runs a stale query on its
    // own, so a version that never cleared the cached error still lands a
    // conversation eventually — it just races the send against it. The send has
    // to be HELD behind the fresh attempt, and that is what this asserts.
    conversationGate.hold();
    act(() => result.current.sendMessage('second try'));

    await waitFor(() => expect(conversationGate.fetches).toBe(2));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      conversationGate.open();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentQueries()).toEqual(['second try']);
  });

  it('ends a PERMANENTLY failing conversation query in a visible error, never in silence', async () => {
    // The bound on the recovery path. One user action buys exactly one fresh
    // attempt; if that fails too the user is back at the error card and its
    // Retry — not a spinner, not a blank screen, and not a queue with nothing
    // left to wait for.
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await act(async () => {
      conversationGate.fail();
    });
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));

    // Hold the SECOND attempt open, so the "trying again" phase is observable
    // rather than inferred. Without this the closing assertion would be vacuous
    // — the error text it waits for is the one already on screen.
    conversationGate.hold();
    act(() => result.current.retry());

    await waitFor(() => expect(conversationGate.fetches).toBe(2));
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);

    await act(async () => {
      conversationGate.fail();
    });

    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(result.current.isStreaming).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes the user row exactly once when a Retry has to WAIT for the conversation', async () => {
    // Round 3's property (a retry must write the user row when the failed send
    // never did) composed with this round's (a retry may now have to queue).
    // Each was pinned on its own; their composition was not, and it is the
    // sequence a cold dashboard actually produces.
    fetchMock.mockResolvedValue(sseResponse('Three creators near Hoboken.'));
    conversationGate.hold();
    authMock.value = { id: 'u1' };
    const { result } = renderHook(() => useDonny(), { wrapper: Wrapper });

    act(() => result.current.sendMessage('find creators near me'));
    await act(async () => {
      conversationGate.fail();
    });
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(messageInsertMock).not.toHaveBeenCalled();

    conversationGate.open();
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.clientMessageIds).toHaveLength(2));
    const rows = insertedRows();
    expect(rows.filter((r) => r.role === 'user')).toHaveLength(1);
    expect(rows[0].content).toBe('find creators near me');
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
  });

  it('does NOT write a second user row when a queued Retry replays a message it already wrote', async () => {
    // `isRetry` has to travel WITH the queued send: it is what tells mutationFn
    // that this text's `donny_messages` row already exists, and a queued retry
    // drained as a brand-new message would reset that fact and write the
    // question twice.
    //
    // Reaching it needs `conversation` to go missing AFTER a row was written,
    // which a failed refetch cannot do (react-query keeps the last successful
    // data). An identity change does: the conversation query is keyed on the
    // user id, while `lastUserMessage` and its "already inserted" companion are
    // refs on this hook instance and carry over.
    authMock.value = { id: 'u1' };
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const { result, rerender } = renderHook(() => useDonny(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(messageInsertMock).toHaveBeenCalledTimes(1);
    expect(insertedRows()[0].role).toBe('user');

    // The conversation goes missing, and the next fetch is held open so the
    // Retry lands in the QUEUE instead of going straight out.
    conversationGate.hold();
    authMock.value = { id: 'u2' };
    rerender();
    await waitFor(() => expect(result.current.conversation).toBeNull());

    act(() => result.current.retry());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      conversationGate.open();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isStreaming).toBe(false));

    // One question, one answer: the retry regenerated the answer without
    // duplicating the row it already had.
    expect(insertedRows().map((r) => r.role)).toEqual(['user', 'assistant']);
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
