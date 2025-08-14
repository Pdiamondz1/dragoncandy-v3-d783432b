import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import MessageList from './MessageList';
import MessageInputEnhanced from './MessageInputEnhanced';
import MessageSearch from './MessageSearch';
import { useMessages, useSendMessage, useMarkMessageAsRead, type Message } from '@/hooks/useMessages';
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
  const markAsRead = useMarkMessageAsRead();
  const [showSearch, setShowSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Mark unread messages as read when component mounts or messages change
  useEffect(() => {
    if (messages.length > 0 && user) {
      const unreadMessages = messages.filter(
        msg => msg.recipient_id === user.id && !msg.read_at
      );
      
      unreadMessages.forEach(msg => {
        markAsRead.mutate(msg.id);
      });
    }
  }, [messages, user, markAsRead]);

  const handleSendMessage = (content: string, options?: {
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    parentMessageId?: string;
    threadId?: string;
  }) => {
    sendMessage.mutate({
      conversationId,
      recipientId,
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
    <div className="flex h-[600px]">
      <Card className="flex flex-col flex-1">
        {conversationTitle && (
          <div className="p-4 border-b bg-muted flex items-center justify-between">
            <div>
              <h3 className="font-medium">{conversationTitle}</h3>
              <p className="text-sm text-muted-foreground">Direct conversation</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <MessageList 
          conversationId={conversationId}
          messages={messages} 
          isLoading={isLoading}
          onReply={handleReply}
        />
        
        <MessageInputEnhanced 
          conversationId={conversationId}
          onSendMessage={handleSendMessage}
          disabled={sendMessage.isPending}
          placeholder="Type your message..."
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </Card>

      {/* Search panel */}
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