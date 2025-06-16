
import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import MessageBubbleEnhanced from './MessageBubbleEnhanced';
import TypingIndicator from './TypingIndicator';
import { Message } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface MessageListProps {
  campaignId: string;
  messages: Message[];
  isLoading?: boolean;
  onReply?: (message: Message) => void;
}

const MessageList: React.FC<MessageListProps> = ({ 
  campaignId, 
  messages, 
  isLoading,
  onReply 
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { typingUsers } = useTypingIndicator(campaignId);

  // Auto-scroll to bottom when new messages arrive or typing indicators change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0 && typingUsers.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg font-medium">No messages yet</p>
          <p className="text-sm">Start the conversation by sending a message below.</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
      <div className="space-y-1">
        {messages.map((message) => (
          <MessageBubbleEnhanced 
            key={message.id} 
            message={message} 
            onReply={onReply}
          />
        ))}
        
        {/* Show typing indicators */}
        {typingUsers.map((typingUser) => (
          <TypingIndicator 
            key={typingUser.user_id} 
            userName={typingUser.user_name} 
          />
        ))}
        
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};

export default MessageList;
