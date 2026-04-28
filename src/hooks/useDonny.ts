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
}

export function useDonny(options?: UseDonnyOptions) {
  const { user, profile, activeOrg } = useAuth();
  const queryClient = useQueryClient();
  const [streamingContent, setStreamingContent] = useState('');
  const [avatarState, setAvatarState] = useState<DonnyAvatarState>('idle');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isSendingRef = useRef(false);

  // Load or create conversation
  const { data: conversation } = useQuery({
    queryKey: ['donny-conversation', user?.id],
    queryFn: async () => {
      if (!user) return null;

      // Try to get existing conversation
      const { data: existing, error: fetchError } = await supabase
        .from('donny_conversations' as any)
        .select('id, user_id, created_at, last_message_at, context_snapshot')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (existing) return existing as unknown as DonnyConversation;

      // Create new conversation
      const { data: created, error: createError } = await supabase
        .from('donny_conversations' as any)
        .insert({ user_id: user.id })
        .select()
        .single();

      if (createError) throw createError;
      return created as unknown as DonnyConversation;
    },
    enabled: !!user,
  });

  // Load messages
  const { data: messages = [] } = useQuery({
    queryKey: ['donny-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation) return [];

      const { data, error: fetchError } = await supabase
        .from('donny_messages' as any)
        .select('id, conversation_id, role, content, tool_calls, tool_result, rich_card, quick_actions, created_at')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      return (data ?? []) as unknown as DonnyMessage[];
    },
    enabled: !!conversation,
  });

  // Subscribe to Realtime for new messages (streamed from edge function)
  useEffect(() => {
    if (!conversation) return;

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
  }, [conversation, queryClient]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation || !user) throw new Error('No active conversation');
      if (isSendingRef.current) throw new Error('Message already in flight');

      isSendingRef.current = true;

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert user message locally first
      const { error: insertError } = await supabase
        .from('donny_messages' as any)
        .insert({
          conversation_id: conversation.id,
          role: 'user',
          content,
        });

      if (insertError) throw insertError;

      // Call orchestrator edge function
      const { data, error: fnError } = await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: content,
          page_path: window.location.pathname,
          page_context: options?.campaignContext || {},
          user_role: profile?.role || 'content_creator',
          org_id: activeOrg?.id,
          conversation_history: messages.slice(-10).map(m => ({
            role: m.role === 'user' ? 'user' as const : 'assistant' as const,
            content: m.content || '',
          })),
        },
      });

      if (fnError) throw fnError;

      // Orchestrator returns { answer, suggested_actions, agent_used }
      // Save assistant message to DB
      if (data?.answer) {
        const quickActions = (data.suggested_actions ?? []).map(
          (a: { label: string; route: string }) => ({
            label: a.label,
            action: 'navigate' as const,
            url: a.route,
          })
        );

        const { error: insertError } = await supabase
          .from('donny_messages' as any)
          .insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: data.answer,
            quick_actions: quickActions.length > 0 ? quickActions : null,
          });

        if (insertError) throw insertError;
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
      setStreamingContent('');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      if (isSendingRef.current) return; // Silently discard duplicate sends
      sendMessageMutation.mutate(content);
    },
    [sendMessageMutation]
  );

  const clearChat = useCallback(async () => {
    if (!conversation) return;

    // Delete all messages in this conversation
    await supabase
      .from('donny_messages' as any)
      .delete()
      .eq('conversation_id', conversation.id);

    queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation.id] });
  }, [conversation, queryClient]);

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
  };
}
