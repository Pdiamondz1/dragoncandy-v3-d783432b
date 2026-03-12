import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Search } from 'lucide-react';
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

  // Mark as read functionality removed to prevent infinite loops
  // Messages can be marked as read manually if needed

  const handleSendMessage = (content: string, options?: {
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    parentMessageId?: string;
    threadId?: string;
  }) => {
    // For direct conversations, we need to determine the recipient
    // We'll get it from the messages or use a default approach
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
    <div className="flex flex-col h-[calc(100vh-120px)] bg-[#A8A8A0]">
      {/* Top bar: white bg, teal name, "Recently Active", pink phone button */}
      {conversationTitle && (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <div className="text-center flex-1">
            <h3 className="font-semibold text-teal-400 text-base">{conversationTitle}</h3>
            <p className="text-xs text-gray-600 font-medium">Recently Active</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-pink-400 flex items-center justify-center">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSearch(!showSearch)}
              className="h-8 w-8 p-0"
            >
              <Search className="h-4 w-4 text-gray-500" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
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
          placeholder="Enter Text Here...."
          replyingTo={replyingTo}
          onCancelReply={handleCancelReply}
        />
      </div>

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