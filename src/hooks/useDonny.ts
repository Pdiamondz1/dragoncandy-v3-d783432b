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
  // Whether the `donny_messages` USER row for `lastUserMessage.current` was
  // actually written.
  //
  // `isRetry` used to stand in for this fact, and the two diverge exactly where
  // it matters. A send can fail BEFORE the insert — the `No active
  // conversation` guard, the in-flight guard, or the insert statement itself
  // erroring. Replaying any of those with `isRetry: true` skipped the insert,
  // so the assistant row was persisted with no question above it. That is not
  // cosmetic: `conversation_history` is assembled from these rows, so every
  // later turn is briefed on an answer to a question Donny cannot see.
  //
  // Assigned in the same statement block as `lastUserMessage` below, so the
  // pair can never describe different messages.
  const lastUserMessageInserted = useRef(false);

  // Load or create conversation
  const { data: conversation } = useQuery({
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
    enabled: !!user && isEnabled,
  });

  // Load messages
  const {
    data: messages = [],
    isSuccess: messagesFetched,
    isFetching: messagesFetching,
    isError: messagesErrored,
    refetch: refetchMessages,
  } = useQuery({
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
    enabled: !!conversation && isEnabled,
  });

  // Subscribe to Realtime for new messages (streamed from edge function)
  useEffect(() => {
    if (!conversation || !isEnabled) return;

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
  }, [conversation, isEnabled, queryClient]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, isRetry = false }: { content: string; isRetry?: boolean }) => {
      // Recorded BEFORE the guards, not after: retry() is gated on this ref, so
      // a send that failed on the conversation guard used to leave it holding
      // the PREVIOUS message — or, on the very first send, the empty string it
      // is initialised with, which makes retry() a no-op and renders the error
      // card's "Try Again" as a button that does nothing at all.
      lastUserMessage.current = content;
      // A genuinely new message has no row yet, so the pair is reset together
      // with the text it describes — a stale `true` surviving into a new
      // question would silently drop that question instead. A retry
      // deliberately keeps what is known, because it replays the very message
      // this pair already describes.
      if (!isRetry) lastUserMessageInserted.current = false;

      if (!conversation || !user) throw new Error('No active conversation');
      if (isSendingRef.current) throw new Error('Message already in flight');

      isSendingRef.current = true;

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert the user message locally first. Skipped ONLY when this message's
      // row is known to have been written — never merely because this
      // invocation is a retry.
      if (!lastUserMessageInserted.current) {
        const { error: insertError } = await supabase
          .from('donny_messages')
          .insert({
            conversation_id: conversation.id,
            role: 'user',
            content,
          });

        if (insertError) throw insertError;
        // Recorded only AFTER the write lands, so the flag never claims a row
        // that does not exist. In particular an insert that THREW leaves it
        // false, so Retry writes the row.
        lastUserMessageInserted.current = true;
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

          const { error: saveErr } = await supabase.from('donny_messages').insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: accumulatedText,
            quick_actions: quickActions.length > 0 ? quickActions : null,
            rich_cards: richCards.length ? richCards : null,
          });
          if (saveErr) throw saveErr;
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

        const { error: saveErr } = await supabase.from('donny_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          content: data.answer,
          quick_actions: quickActions.length > 0 ? quickActions : null,
          rich_cards: jsonRichCards.length ? jsonRichCards : null,
        });
        if (saveErr) throw saveErr;
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

  const sendMessage = useCallback(
    (content: string) => {
      if (isSendingRef.current) return;
      sendMessageMutation.mutate({ content });
    },
    [sendMessageMutation]
  );

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

  // Whether `messages` currently reflects the server — NOT the same question as
  // `messages.length === 0`. The query defaults to `[]` and is
  // `enabled: !!conversation`, so an empty array means "conversation still
  // loading", "history query in flight", or "genuinely none", and only the
  // third is a fact a caller can act on. A caller that must tell them apart —
  // DonnyHome, which shows only the current visit — cannot do it from
  // `messages`.
  //
  // `!isFetching` as well as `isSuccess`, because React Query keeps `isSuccess`
  // true while a background refetch runs against CACHED data. With the thread
  // already cached from the side panel, readiness would be announced over a
  // stale array, and anything added since (another tab, another device) would
  // land after a baseline taken from it. `isSuccess` alone answers "have we
  // ever loaded"; this answers "is what I am holding current".
  //
  // A FAILED fetch is deliberately NOT loaded. Counting it as loaded was the
  // obvious way to stop a failing query queueing sends forever, and it quietly
  // reintroduced the very leak this flag exists to prevent: on error `data` is
  // undefined, so `messages` is the `[]` default, a baseline taken from it says
  // "no history", and the moment the query recovers the whole conversation
  // counts as the current visit. (Codex, twice — the second time on my own
  // fix.) The deadlock is real but it is the CALLER's to solve, with
  // `messagesErrored` below, by telling the user rather than by pretending the
  // empty array is an answer.
  const messagesLoaded = messagesFetched && !messagesFetching;

  const state: DonnyState = {
    conversation: conversation ?? null,
    messages,
    isStreaming,
    streamingContent,
    avatarState,
    error,
  };

  const retryLoadMessages = useCallback(() => {
    void refetchMessages();
  }, [refetchMessages]);

  return {
    ...state,
    messagesLoaded,
    // The history load FAILED, as opposed to "has not finished". A surface that
    // waits on `messagesLoaded` needs this to end the wait honestly.
    messagesErrored,
    retryLoadMessages,
    sendMessage,
    clearChat,
    archiveConversation,
    quickChips,
    retry,
  };
}
