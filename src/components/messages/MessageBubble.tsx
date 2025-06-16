
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Message } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';

interface MessageBubbleProps {
  message: Message;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { user } = useAuth();
  const isOwn = message.sender_id === user?.id;
  const senderName = message.sender_profile?.full_name || 'Unknown User';
  const avatarUrl = message.sender_profile?.avatar_url;

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={cn(
      "flex gap-3 mb-4",
      isOwn ? "flex-row-reverse" : "flex-row"
    )}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback className="text-xs">
          {senderName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className={cn(
        "flex flex-col max-w-[70%]",
        isOwn ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "rounded-lg px-4 py-2 break-words",
          isOwn 
            ? "bg-blue-600 text-white" 
            : "bg-gray-100 text-gray-900"
        )}>
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        <div className={cn(
          "flex items-center gap-2 mt-1 text-xs text-gray-500",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}>
          <span>{formatTime(message.created_at)}</span>
          {isOwn && (
            <span className="text-xs">
              {message.read_at ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
