
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';
import MessageList from './MessageList';
import MessageInputEnhanced from './MessageInputEnhanced';
import MessageSearch from './MessageSearch';
import { useMessages, useSendMessage, type Message } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';

interface MessageThreadProps {
  campaignId: string;
  recipientId: string;
  campaignTitle?: string;
}

const MessageThread: React.FC<MessageThreadProps> = ({ 
  campaignId, 
  recipientId, 
  campaignTitle 
}) => {
  useAuth();
  const { data: messages = [], isLoading } = useMessages(campaignId);
  const sendMessage = useSendMessage();
  const [showSearch, setShowSearch] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Mark as read functionality removed to prevent infinite loops
  // Messages can be marked as read manually if needed

  const handleSendMessage = (content: string, options?: {
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    parentMessageId?: string;
    threadId?: string;
  }) => {
    sendMessage.mutate({
      campaignId,
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
        {campaignTitle && (
          <div className="p-4 border-b bg-muted flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">{campaignTitle}</h3>
              <p className="text-sm text-muted-foreground">Campaign Discussion</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              aria-label="Toggle search"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        <MessageList 
          campaignId={campaignId}
          messages={messages} 
          isLoading={isLoading}
          onReply={handleReply}
        />
        
        <MessageInputEnhanced 
          campaignId={campaignId}
          onSendMessage={handleSendMessage}
          disabled={sendMessage.isPending}
          placeholder="Type your message…"
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </Card>

      {/* Search panel */}
      <MessageSearch
        campaignId={campaignId}
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
      />
    </div>
  );
};

export default MessageThread;
