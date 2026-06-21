import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { DonnyConversation, DonnyMessage } from '@/types/donny';
import { parseNdjsonChunk } from '@/lib/ndjson';

/**
 * Internal Donny (AIOS) chat — a dedicated donny_conversations thread with
 * surface='internal', answered by donny-chat's internal tool set. The edge
 * function re-verifies admin access server-side; this hook just declares the
 * surface.
 */
export function useInternalDonny() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastUserMessage = useRef<string>('');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<{ text: string; status: string } | null>(null);

  const { data: conversation } = useQuery({
    queryKey: ['aios', 'donny-conversation', user?.id],
    queryFn: async () => {
      const { data: existing, error: fetchError } = await supabase
        .from('donny_conversations')
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .eq('user_id', user!.id)
        .eq('surface', 'internal')
        .is('archived_at', null)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (existing) return existing as DonnyConversation;

      const { data: created, error: createError } = await supabase
        .from('donny_conversations')
        .insert({ user_id: user!.id, surface: 'internal' })
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .single();
      if (createError) throw createError;
      return created as unknown as DonnyConversation;
    },
    enabled: !!user,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['aios', 'donny-messages', conversation?.id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('donny_messages')
        .select('id, conversation_id, role, content, tool_calls, tool_result, rich_card, quick_actions, created_at')
        .eq('conversation_id', conversation!.id)
        .order('created_at', { ascending: true });
      if (fetchError) throw fetchError;
      return (data ?? []) as DonnyMessage[];
    },
    enabled: !!conversation,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ content, isRetry = false }: { content: string; isRetry?: boolean }) => {
      if (!conversation || !user) throw new Error('No active conversation');
      lastUserMessage.current = content;
      setError(null);

      if (!isRetry) {
        const { error: insertError } = await supabase
          .from('donny_messages')
          .insert({ conversation_id: conversation.id, role: 'user', content });
        if (insertError) throw insertError;
        queryClient.invalidateQueries({ queryKey: ['aios', 'donny-messages', conversation.id] });
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donny-chat`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message: content,
            context: { surface: 'internal', page_url: '/internal/donny' },
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || data?.message || 'Donny could not generate a response');
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('ndjson') || !response.body) {
        // Fallback: older/non-streaming function deploy → behave as before.
        return await response.json().catch(() => ({}));
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      setStreaming({ text: '', status: 'Thinking…' });
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const { events, rest } = parseNdjsonChunk(buffer, decoder.decode(value, { stream: true }));
          buffer = rest;
          for (const ev of events) {
            if (ev.type === 'status') setStreaming((s) => ({ text: s?.text ?? acc, status: ev.label }));
            else if (ev.type === 'text') { acc += ev.delta; setStreaming((s) => ({ text: acc, status: s?.status ?? '' })); }
            else if (ev.type === 'done') return { success: true, content: ev.content, rich_card: ev.rich_card };
            else if (ev.type === 'error') throw new Error(ev.message || 'Donny hit an error');
            // heartbeat: ignore
          }
        }
        // Stream closed without `done` → cut off (e.g. 400s wall-clock).
        throw new Error("Donny's response was cut off — please try again.");
      } finally {
        // Best-effort: release the reader lock and close the body on all exits
        // (normal done return, thrown error, or mutation cancellation).
        reader.cancel().catch(() => {});
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['aios', 'donny-messages', conversation?.id] });
      setStreaming(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      if (sendMutation.isPending) return;
      sendMutation.mutate({ content });
    },
    [sendMutation]
  );

  const retry = useCallback(() => {
    if (lastUserMessage.current && !sendMutation.isPending) {
      sendMutation.mutate({ content: lastUserMessage.current, isRetry: true });
    }
  }, [sendMutation]);

  return {
    messages,
    sendMessage,
    retry,
    isThinking: sendMutation.isPending,
    error,
    streaming,
  };
}
