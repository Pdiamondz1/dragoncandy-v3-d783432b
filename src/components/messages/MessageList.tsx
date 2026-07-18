import React, { useEffect, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { MessageBubbleEnhanced } from './MessageBubbleEnhanced';
import { type Message } from '@/hooks/useMessages';

interface MessageListProps {
  campaignId?: string;
  conversationId?: string;
  messages: Message[];
  isLoading: boolean;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  onReply,
  onForward,
  onEdit,
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length]);
  if (isLoading) {
    return (
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-16 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-dc-teal/[0.04] min-h-[200px]">
        <div className="text-center">
          <div className="p-4 bg-dc-teal/10 rounded-2xl w-fit mx-auto mb-3">
            <MessageSquare className="h-8 w-8 text-dc-teal/60" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No messages yet</p>
          <p className="text-xs text-gray-400">Start the conversation by sending a message below</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 bg-dc-teal/[0.04]" ref={scrollAreaRef}>
      <div className="space-y-2 p-4" aria-live="polite" role="list">
        {messages.map((message, index) => {
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showAvatar = !prevMessage || prevMessage.sender_id !== message.sender_id;
          return (
            <MessageBubbleEnhanced
              key={message.id}
              message={message}
              showAvatar={showAvatar}
              onReply={onReply}
              onForward={onForward}
              onEdit={onEdit}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </ScrollArea>
  );
};

