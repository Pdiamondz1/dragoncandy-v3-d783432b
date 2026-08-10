// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Supabase stub.
//
// Only the shapes useDonny actually calls. Each `from()` returns a thenable
// builder so the chained `.select().eq().order()` reads resolve, while
// `.insert()` resolves to `{ error }` — which is the one this suite is about.
// ---------------------------------------------------------------------------

/** Every `donny_messages` insert this test run observed, in order. */
const inserts: Array<Record<string, unknown>> = [];
/** Set to an error to make the NEXT donny_messages insert fail. */
const failNextInsert = { value: null as { message: string } | null };
/** What the conversation query resolves to. */
const conversationRow = { value: { id: 'conv-1' } as { id: string } | null };

function messagesBuilder(table: string) {
  const result: Record<string, unknown> = { data: [], error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'is', 'order', 'limit', 'delete', 'update']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: conversationRow.value, error: null });
  builder.single = async () => ({ data: conversationRow.value, error: null });
  builder.insert = async (row: Record<string, unknown>) => {
    if (table === 'donny_messages') {
      const err = failNextInsert.value;
      failNextInsert.value = null;
      // Recorded even when it fails: the point of this suite is what happens
      // after a failed write, so an attempt has to be visible from an assertion.
      inserts.push({ ...row, __failed: !!err });
      if (err) return { data: null, error: err };
    }
    return { data: null, error: null };
  };
  // `await supabase.from(x).select()...` with no terminal method.
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => messagesBuilder(table),
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

const authState = {
  user: { id: 'u1' } as { id: string } | null,
  profile: { role: 'business_client' },
  activeOrg: null,
};
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useDonny } from './useDonny';

// ---------------------------------------------------------------------------
// The orchestrator call. SSE is the PRODUCTION path — donny-orchestrator streams
// — so these tests drive that branch, not the JSON fallback.
// ---------------------------------------------------------------------------

function sseResponse(text: string) {
  const chunks = [
    `event: text_delta\ndata: ${JSON.stringify({ text })}\n\n`,
    `event: done\ndata: ${JSON.stringify({ suggested_actions: [], rich_cards: [] })}\n\n`,
  ];
  let i = 0;
  return {
    ok: true,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  };
}

const userInserts = () => inserts.filter((r) => r.role === 'user');
const assistantInserts = () => inserts.filter((r) => r.role === 'assistant');

// One client per test, shared by every render in it — the last case has to
// invalidate the conversation query on the SAME hook instance that failed.
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderDonny() {
  const view = renderHook(() => useDonny(), { wrapper });
  if (conversationRow.value) {
    await waitFor(() => expect(view.result.current.conversation).not.toBeNull());
  }
  return view;
}

beforeEach(() => {
  inserts.length = 0;
  failNextInsert.value = null;
  conversationRow.value = { id: 'conv-1' };
  authState.user = { id: 'u1' };
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal('fetch', vi.fn(async () => sseResponse('Here you go.')));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDonny — retry never leaves an answer with no question behind it', () => {
  it('writes the user row on retry when the first attempt failed at the insert', async () => {
    // The live bug. `isRetry` was used as a proxy for "the user row already
    // exists"; when the insert itself errored those two facts disagreed, the
    // replay skipped the write, and the assistant row landed alone.
    failNextInsert.value = { message: 'insert boom' };
    const { result } = await renderDonny();

    act(() => result.current.sendMessage('how are my instagram posts doing?'));
    // 'Something went wrong', not 'insert boom': a Supabase PostgrestError is a
    // plain object, and useDonny's onError only unwraps `instanceof Error`.
    // Asserting truthiness rather than the copy keeps this test about the row.
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(userInserts()).toHaveLength(1);
    expect(userInserts()[0].__failed).toBe(true);
    expect(assistantInserts()).toHaveLength(0);

    act(() => result.current.retry());
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));

    // Two attempts, exactly one of which landed — and the answer now has its
    // question above it.
    expect(userInserts()).toHaveLength(2);
    expect(userInserts().filter((r) => !r.__failed)).toHaveLength(1);
    expect(userInserts()[1].content).toBe('how are my instagram posts doing?');
  });

  it('does not duplicate the user row on retry when the first attempt failed AFTER the insert', async () => {
    // The other side of the same coin: over-correcting to "always insert" would
    // double the question in the thread and in conversation_history.
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
    const { result } = await renderDonny();

    act(() => result.current.sendMessage('find creators near me'));
    await waitFor(() => expect(result.current.error).toBe('network down'));
    expect(userInserts()).toHaveLength(1);

    act(() => result.current.retry());
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));

    expect(userInserts()).toHaveLength(1);
  });

  it('writes its own user row for a genuinely new send after a successful one', async () => {
    // The flag has to be RESET by a non-retry send. Left true from the previous
    // exchange, the next question would be answered without ever being stored.
    const { result } = await renderDonny();

    act(() => result.current.sendMessage('first question'));
    await waitFor(() => expect(assistantInserts()).toHaveLength(1));

    act(() => result.current.sendMessage('second question'));
    await waitFor(() => expect(assistantInserts()).toHaveLength(2));

    expect(userInserts().map((r) => r.content)).toEqual(['first question', 'second question']);
  });

  it('retries what the user typed after a failure that predates the conversation, and writes its row', async () => {
    // The conversation guard fires before anything is recorded. With
    // lastUserMessage assigned only after the guards, retry() sees an empty ref
    // and returns silently — the error card's "Try Again" does nothing, the
    // same dead-control class as the twelve dead /settings CTAs. Recording the
    // text first makes Retry live, and the flag being false makes it write the
    // row it never got to write.
    conversationRow.value = null;
    const { result } = await renderDonny();

    act(() => result.current.sendMessage('what should I post this week?'));
    await waitFor(() => expect(result.current.error).toBe('No active conversation'));
    expect(userInserts()).toHaveLength(0);

    // The conversation query resolves on this same hook instance.
    conversationRow.value = { id: 'conv-1' };
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['donny-conversation', 'u1'] });
    });
    await waitFor(() => expect(result.current.conversation).not.toBeNull());

    act(() => result.current.retry());
    await waitFor(() => expect(userInserts()).toHaveLength(1));
    expect(userInserts()[0].content).toBe('what should I post this week?');
  });
});
