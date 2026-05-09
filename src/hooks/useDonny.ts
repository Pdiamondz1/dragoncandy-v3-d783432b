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

  // Load or create conversation
  const { data: conversation } = useQuery({
    queryKey: ['donny-conversation', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: existing, error: fetchError } = await supabase
        .from('donny_conversations')
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .eq('user_id', user.id)
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
  const { data: messages = [] } = useQuery({
    queryKey: ['donny-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];

      const { data, error: fetchError } = await supabase
        .from('donny_messages')
        .select('id, conversation_id, role, content, tool_calls, tool_result, rich_card, quick_actions, created_at')
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
      if (!conversation || !user) throw new Error('No active conversation');
      if (isSendingRef.current) throw new Error('Message already in flight');

      isSendingRef.current = true;
      lastUserMessage.current = content;

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert user message locally first (skip on retry — message already exists)
      if (!isRetry) {
        const { error: insertError } = await supabase
          .from('donny_messages')
          .insert({
            conversation_id: conversation.id,
            role: 'user',
            content,
          });

        if (insertError) throw insertError;
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

          await supabase.from('donny_messages').insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: accumulatedText,
            quick_actions: quickActions.length > 0 ? quickActions : null,
          });
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

        await supabase.from('donny_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          content: data.answer,
          quick_actions: quickActions.length > 0 ? quickActions : null,
        });
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
    sendMessage,
    clearChat,
    quickChips,
    retry,
  };
}
