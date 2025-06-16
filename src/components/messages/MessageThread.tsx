
import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { useMessages, useSendMessage, useMarkMessageAsRead } from '@/hooks/useMessages';
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
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useMessages(campaignId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkMessageAsRead();

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

  const handleSendMessage = (content: string) => {
    sendMessage.mutate({
      campaignId,
      recipientId,
      content,
    });
  };

  return (
    <Card className="flex flex-col h-[600px]">
      {campaignTitle && (
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-medium text-gray-900">{campaignTitle}</h3>
          <p className="text-sm text-gray-600">Campaign Discussion</p>
        </div>
      )}
      
      <MessageList messages={messages} isLoading={isLoading} />
      
      <MessageInput 
        onSendMessage={handleSendMessage}
        disabled={sendMessage.isPending}
        placeholder="Type your message..."
      />
    </Card>
  );
};

export default MessageThread;
