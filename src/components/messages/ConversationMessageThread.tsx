import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Search, X, Phone, MoreVertical } from 'lucide-react';
import MessageList from './MessageList';
import MessageInputEnhanced from './MessageInputEnhanced';
import MessageSearch from './MessageSearch';
import { useMessages, useSendMessage, type Message } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';

interface ConversationMessageThreadProps {
  conversationId: string;
  recipientId: string;
  conversationTitle?: string;
}

const ConversationMessageThread: React.FC<ConversationMessageThreadProps> = ({
  conversationId,
  recipientId,
  conversationTitle
}) => {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useMessages(undefined, conversationId);
  const sendMessage = useSendMessage();
  const [showSearch, setShowSearch] = useState(false);
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
      {/* Thread header */}
      {conversationTitle && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {conversationTitle.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{conversationTitle}</h3>
              <p className="text-xs text-muted-foreground">Direct conversation</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSearch(!showSearch)}
            >
              {showSearch ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 min-h-0 bg-muted/20">
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
          placeholder="Type your message..."
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </div>

      {/* Search panel overlay */}
      {showSearch && conversationId && (
        <MessageSearch
          campaignId={conversationId}
          isOpen={showSearch}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
};

export default ConversationMessageThread;
