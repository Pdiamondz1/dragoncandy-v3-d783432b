import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type {
  DonnyMessage,
  DonnyConversation,
  DonnyState,
  DonnyAvatarState,
  DonnyQuickChip,
  DonnyRichCard,
} from '@/types/donny';

const DEFAULT_QUICK_CHIPS: Record<string, DonnyQuickChip[]> = {
  business_client: [
    { label: 'Create Campaign', message: 'I want to create a new campaign' },
    { label: 'Find Creators', message: 'Help me find content creators' },
    { label: 'My Campaigns', message: 'Show me my active campaigns' },
  ],
  content_creator: [
    { label: 'Browse Campaigns', message: 'Show me campaigns I can apply to' },
    { label: 'My Projects', message: 'Show me my active projects' },
    { label: 'My Earnings', message: 'Show me my earnings' },
  ],
  brand: [
    { label: 'Find Creators', message: 'Help me find content creators' },
    { label: 'My Campaigns', message: 'Show me my campaigns' },
    { label: 'Analytics', message: 'Show me my campaign analytics' },
  ],
};

interface UseDonnyOptions {
  campaignContext?: { campaign_id: string; title: string; status: string } | null;
  enabled?: boolean;
}

export function useDonny(options?: UseDonnyOptions) {
  const { user, profile, activeOrg } = useAuth();
  const queryClient = useQueryClient();
  const isEnabled = options?.enabled !== false;
  const [streamingContent, setStreamingContent] = useState('');
  const [avatarState, setAvatarState] = useState<DonnyAvatarState>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSendingRef = useRef(false);
  const lastUserMessage = useRef<string>("");

  // Ids of the `donny_messages` rows THIS client wrote, oldest first.
  //
  // Both halves of every exchange are written here — the user row and, once the
  // model answers, the assistant row. `donny-orchestrator` never touches
  // `donny_messages` (verified: zero references anywhere in that function), so
  // this list is a complete record of what the current browser session
  // contributed to the thread.
  //
  // Its value is that it does NOT depend on any query having resolved. The
  // inline canvas needs to show "this visit only", and a COUNT of `messages`
  // cannot express that on a cold load: `messages` is still 0-length while the
  // (stage-gated) messages query is in flight, so a baseline taken then means
  // "show everything" the moment months of history arrive. Membership in a set
  // this client minted is immune to that — a history row carries an id this
  // session never issued, whenever it turns up.
  const [clientMessageIds, setClientMessageIds] = useState<string[]>([]);

  // Sends issued before the conversation existed, oldest first. See the
  // `conversationPending` block below for why they can't just be sent.
  const queuedSendsRef = useRef<string[]>([]);
  // Bumped only to re-run the drain effect — mutating a ref does not.
  const [queueSignal, setQueueSignal] = useState(0);
  // Set SYNCHRONOUSLY, immediately before mutate(). isSendingRef is not usable
  // as the drain's own guard: it flips inside the async mutationFn, so between
  // mutate() and that first statement there is a window in which a re-render
  // would see an idle hook and fire the same queued item twice. This ref plus
  // the shift() below are what make a queued send exactly-once.
  const isDrainingRef = useRef(false);

  // `enabled` gates BACKGROUND work; an explicit send is a user intent and must
  // not be gated by it. DonnyProvider derives `enabled` from `stage`, and
  // DonnyCanvas only leaves 'closed' in a mount EFFECT — which React runs after
  // the first paint, i.e. while the inline composer and its chips are already
  // on screen and clickable. So `isEnabled === false` is NOT evidence that no
  // conversation is coming, and a tap in that window must not be answered with
  // "No active conversation".
  //
  // A send therefore turns the conversation query on ITSELF. That is what
  // bounds the hold below: the query a send starts has exactly two terminal
  // states and BOTH release the queue — success drains it, failure sets
  // `conversationError`, which makes `conversationPending` false and lets the
  // send fall through to the existing error card + Retry. Nothing ever waits on
  // a component that may never mount.
  const [sendRequested, setSendRequested] = useState(false);
  const queriesEnabled = isEnabled || sendRequested;

  // Load or create conversation
  const { data: conversation, error: conversationError } = useQuery({
    queryKey: ['donny-conversation', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: existing, error: fetchError } = await supabase
        .from('donny_conversations')
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .eq('user_id', user.id)
        .neq('surface', 'internal') // internal (AIOS) threads stay out of the consumer panel
        .is('archived_at', null)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (existing) return existing as DonnyConversation;

      const { data: created, error: createError } = await supabase
        .from('donny_conversations')
        .insert({ user_id: user.id })
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .single();

      if (createError) throw createError;
      return created as unknown as DonnyConversation;
    },
    enabled: !!user && queriesEnabled,
  });

  // The intent is discharged the moment the query reaches a terminal state:
  // react-query keeps `conversation` (or the error) in its cache when the gate
  // closes again, so subsequent sends resolve from cache and the "only query
  // while Donny is open" optimisation is preserved rather than pinned on.
  useEffect(() => {
    if (conversation || conversationError) setSendRequested(false);
  }, [conversation, conversationError]);

  // Load messages
  const { data: messages = [] } = useQuery({
    queryKey: ['donny-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];

      const { data, error: fetchError } = await supabase
        .from('donny_messages')
        .select('id, conversation_id, role, content, tool_calls, tool_result, rich_card, rich_cards, quick_actions, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      return (data ?? []) as DonnyMessage[];
    },
    enabled: !!conversation && queriesEnabled,
  });

  // Subscribe to Realtime for new messages (streamed from edge function)
  useEffect(() => {
    if (!conversation || !queriesEnabled) return;

    const channel = supabase
      .channel(`donny-messages-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donny_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation.id] });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation, queriesEnabled, queryClient]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, isRetry = false }: { content: string; isRetry?: boolean }) => {
      // Recorded BEFORE the guards, not after: retry() is gated on this ref, so
      // a send that fails on the conversation guard used to leave it empty and
      // make Retry inert — no request, no state change, no feedback. That is
      // the likeliest failure on this path, since a suggestion chip on the
      // inline dashboard can fire before the conversation query resolves.
      lastUserMessage.current = content;

      if (!conversation || !user) throw new Error('No active conversation');
      if (isSendingRef.current) throw new Error('Message already in flight');

      isSendingRef.current = true;

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert user message locally first (skip on retry — message already exists)
      if (!isRetry) {
        // The row id is chosen HERE rather than read back from the insert.
        // `donny_messages.id` is `uuid not null default gen_random_uuid()` with
        // no triggers on the table and an `authenticated` INSERT grant on the
        // column (checked against prod 2026-08-09), so an explicit value is
        // stored verbatim. Doing it this way means the id is known without a
        // second round trip and without making the send depend on RLS letting
        // the INSERT return its own row — a `.select()` that came back empty
        // would fail a send that had actually succeeded.
        const userMessageId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from('donny_messages')
          .insert({
            id: userMessageId,
            conversation_id: conversation.id,
            role: 'user',
            content,
          });

        if (insertError) throw insertError;
        // Recorded only after the write lands, so the set never claims a row
        // that does not exist.
        setClientMessageIds((ids) => [...ids, userMessageId]);
      }

      // Get session for auth header
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      // Call orchestrator with streaming support
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donny-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            query: content,
            page_path: window.location.pathname,
            page_context: options?.campaignContext || {},
            user_role: profile?.role || 'content_creator',
            org_id: activeOrg?.id,
            conversation_history: messages.slice(-10).map(m => ({
              role: m.role === 'user' ? 'user' as const : 'assistant' as const,
              content: m.content || '',
            })),
          }),
        }
      );

      // Handle non-OK responses (quota exceeded, auth errors, etc.)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.error === 'monthly_quota_exceeded') {
          throw new Error(
            `You've used all ${errorData.budget} Donny actions this month. Upgrade your plan to continue.`
          );
        }
        throw new Error(errorData?.error || errorData?.message || 'Something went wrong');
      }

      const contentType = response.headers.get('Content-Type') || '';

      // SSE streaming response
      if (contentType.includes('text/event-stream')) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';
        let suggestedActions: Array<{ label: string; route: string }> = [];
        let richCards: DonnyRichCard[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const event of events) {
              const lines = event.split('\n');
              let eventType = '';
              let eventData = '';

              for (const line of lines) {
                if (line.startsWith('event: ')) eventType = line.slice(7);
                else if (line.startsWith('data: ')) eventData = line.slice(6);
              }

              if (eventType === 'text_delta' && eventData) {
                const { text } = JSON.parse(eventData);
                accumulatedText += text;
                setStreamingContent(accumulatedText);
              } else if (eventType === 'done' && eventData) {
                const parsed = JSON.parse(eventData);
                suggestedActions = parsed.suggested_actions ?? [];
                richCards = parsed.rich_cards ?? [];
                if (parsed.answer) {
                  accumulatedText = parsed.answer;
                }
              }
            }
          }
        } catch (streamErr) {
          // Connection dropped — preserve partial text
          if (accumulatedText) {
            setStreamingContent(accumulatedText);
          }
          throw streamErr;
        }

        // Save assistant message to DB
        if (accumulatedText) {
          const quickActions = suggestedActions.map(
            (a: { label: string; route: string }) => ({
              label: a.label,
              action: 'navigate' as const,
              url: a.route,
            })
          );

          const assistantMessageId = crypto.randomUUID();
          const { error: saveErr } = await supabase.from('donny_messages').insert({
            id: assistantMessageId,
            conversation_id: conversation.id,
            role: 'assistant',
            content: accumulatedText,
            quick_actions: quickActions.length > 0 ? quickActions : null,
            rich_cards: richCards.length ? richCards : null,
          });
          if (saveErr) throw saveErr;
          setClientMessageIds((ids) => [...ids, assistantMessageId]);
        } else {
          throw new Error('Donny could not generate a response');
        }

        return { answer: accumulatedText, suggested_actions: suggestedActions };
      }

      // JSON fallback (non-streaming response)
      const data = await response.json();

      if (data?.answer) {
        const quickActions = (data.suggested_actions ?? []).map(
          (a: { label: string; route: string }) => ({
            label: a.label,
            action: 'navigate' as const,
            url: a.route,
          })
        );
        const jsonRichCards = (data.rich_cards ?? []) as DonnyRichCard[];

        const assistantMessageId = crypto.randomUUID();
        const { error: saveErr } = await supabase.from('donny_messages').insert({
          id: assistantMessageId,
          conversation_id: conversation.id,
          role: 'assistant',
          content: data.answer,
          quick_actions: quickActions.length > 0 ? quickActions : null,
          rich_cards: jsonRichCards.length ? jsonRichCards : null,
        });
        if (saveErr) throw saveErr;
        setClientMessageIds((ids) => [...ids, assistantMessageId]);
      } else {
        throw new Error(data?.error || 'Donny could not generate a response');
      }

      return data;
    },
    onSuccess: () => {
      isSendingRef.current = false;
      setAvatarState('celebrating');
      setTimeout(() => setAvatarState('idle'), 2000);
      setIsStreaming(false);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation?.id] });
      queryClient.invalidateQueries({ queryKey: ['donny-dashboard', user?.id] });
    },
    onError: (err) => {
      isSendingRef.current = false;
      setAvatarState('error');
      setTimeout(() => setAvatarState('idle'), 3000);
      setIsStreaming(false);
      // Don't clear streamingContent on error — preserve partial text
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  // Is a conversation genuinely on its way? Only then is holding a send the
  // right answer. With no user, or once the query has FAILED, nothing is
  // coming — fall through to the mutation so the `!conversation || !user` guard
  // fires and the caller gets the existing error card and its Retry, rather
  // than a queue that never drains.
  //
  // `isEnabled` is deliberately NOT a term here. It used to be, and that left
  // the whole pre-effect window uncovered: on a cold dashboard the hook is
  // disabled until DonnyCanvas's mount effect runs, so the very taps this queue
  // exists for were the ones it excluded. Removing it is only safe because
  // `sendMessage` below turns the query on when it queues — see `sendRequested`.
  const conversationPending = !!user && !conversation && !conversationError;

  const sendMessage = useCallback(
    (content: string) => {
      if (isSendingRef.current) return;
      // On a fresh dashboard visit this hook is disabled until DonnyCanvas's
      // mount effect moves the stage off 'closed', so the conversation query
      // does not even START until after first paint. A suggestion tap or a
      // prompt submit inside that window used to die on the guard in
      // mutationFn and render "No active conversation" instead of an answer.
      // Hold it instead; the effect below sends it the moment the conversation
      // lands.
      if (conversationPending) {
        queuedSendsRef.current.push(content);
        // Load-bearing, not bookkeeping: this is what guarantees the hold ends.
        // Without it a send issued while the hook is disabled would wait on
        // some OTHER component flipping the stage, and would sit queued and
        // silent forever if none ever did.
        setSendRequested(true);
        setQueueSignal((n) => n + 1);
        return;
      }
      sendMessageMutation.mutate({ content });
    },
    [conversationPending, sendMessageMutation]
  );

  // `mutate` is referentially stable for the life of the hook (react-query
  // binds it to a single observer); the mutation OBJECT is not — its identity
  // changes on every mutation state transition. Depending on the object here
  // would re-run the drain effect on those transitions, which happens to keep
  // the queue moving but leaves the continuation resting on a react-query
  // implementation detail rather than on the explicit signal below. Verified by
  // mutation testing: with the object as the dependency, deleting the re-drain
  // bump left every test green.
  const { mutate: mutateSend } = sendMessageMutation;

  // Drain the held sends — one at a time, oldest first. Serial on purpose:
  // mutationFn rejects a second concurrent send ("Message already in flight"),
  // so firing the queue in parallel would silently lose every message but the
  // first. Each item is shift()ed out BEFORE it is sent, so it cannot be
  // replayed by a later re-render or a later conversation change.
  useEffect(() => {
    if (conversationPending) return;
    if (isDrainingRef.current || isSendingRef.current) return;
    const next = queuedSendsRef.current.shift();
    if (next === undefined) return;

    isDrainingRef.current = true;
    mutateSend(
      { content: next },
      {
        onSettled: () => {
          isDrainingRef.current = false;
          // The ONLY thing that re-runs this effect for the next item. Guarded
          // so a lone queued send does not cost a pointless extra render.
          if (queuedSendsRef.current.length > 0) setQueueSignal((n) => n + 1);
        },
      }
    );
  }, [conversationPending, queueSignal, mutateSend]);

  const clearChat = useCallback(async () => {
    if (!conversation) return;

    // Delete all messages in this conversation
    await supabase
      .from('donny_messages')
      .delete()
      .eq('conversation_id', conversation.id);

    queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation.id] });
  }, [conversation, queryClient]);

  const archiveConversation = useCallback(async () => {
    if (!conversation || !user) return;

    await supabase
      .from('donny_conversations')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', conversation.id);

    await supabase
      .from('donny_nudges')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('acted_at', null)
      .is('dismissed_at', null);
  }, [conversation, user]);

  const retry = useCallback(() => {
    if (lastUserMessage.current && !isSendingRef.current) {
      setError(null);
      sendMessageMutation.mutate({ content: lastUserMessage.current, isRetry: true });
    }
  }, [sendMessageMutation]);

  const quickChips = DEFAULT_QUICK_CHIPS[profile?.role ?? 'business_client'] ?? [];

  const state: DonnyState = {
    conversation: conversation ?? null,
    messages,
    isStreaming,
    streamingContent,
    avatarState,
    error,
  };

  return {
    ...state,
    clientMessageIds,
    sendMessage,
    clearChat,
    archiveConversation,
    quickChips,
    retry,
  };
}
