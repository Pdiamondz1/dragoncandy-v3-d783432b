import React, { useState, useEffect, useRef } from 'react';
import { MessageList } from './MessageList';
import { MessageInputEnhanced } from './MessageInputEnhanced';
import { useMessages, useSendMessage, type Message } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { useMarkMessagesAsRead } from '@/hooks/useMessageMutations';

interface ConversationMessageThreadProps {
  conversationId: string;
  recipientId: string;
  conversationTitle?: string;
}

export const ConversationMessageThread: React.FC<ConversationMessageThreadProps> = ({
  conversationId,
  recipientId,
  conversationTitle: _conversationTitle
}) => {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useMessages(undefined, conversationId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkMessagesAsRead();
  const markedRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId && user && !isLoading && messages.length > 0 && markedRef.current !== conversationId) {
      markedRef.current = conversationId;
      markAsRead.mutate({ conversationId });
    }
  }, [conversationId, user, isLoading, messages.length, markAsRead]);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const handleSendMessage = (content: string, options?: {
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    parentMessageId?: string;
    threadId?: string;
  }) => {
    const actualRecipientId = messages.length > 0
      ? messages[0].sender_id === user?.id
        ? messages[0].recipient_id
        : messages[0].sender_id
      : recipientId;

    sendMessage.mutate({
      conversationId,
      recipientId: actualRecipientId,
      content,
      ...options,
    });
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 min-h-0 bg-teal-50" aria-live="polite">
        <MessageList
          conversationId={conversationId}
          messages={messages}
          isLoading={isLoading}
          onReply={handleReply}
        />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0">
        <MessageInputEnhanced
          conversationId={conversationId}
          onSendMessage={handleSendMessage}
          disabled={sendMessage.isPending}
          placeholder="Type a message…"
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </div>


    </div>
  );
};

