import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import MessageBubbleEnhanced from './MessageBubbleEnhanced';
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

const MessageList: React.FC<MessageListProps> = ({
  messages,
  isLoading,
  onReply,
  onForward,
  onEdit,
}) => {
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
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation by sending a message below</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2">
        {messages.map((message) => (
          <MessageBubbleEnhanced
            key={message.id}
            message={message}
            onReply={onReply}
            onForward={onForward}
            onEdit={onEdit}
          />
        ))}
      </div>
    </ScrollArea>
  );
};

export default MessageList;
