
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Message } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { Check, CheckCheck, Reply, Download, Paperclip } from 'lucide-react';

interface MessageBubbleEnhancedProps {
  message: Message;
  onReply?: (message: Message) => void;
}

const MessageBubbleEnhanced: React.FC<MessageBubbleEnhancedProps> = ({ message, onReply }) => {
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

  const getStatusIcon = () => {
    if (!isOwn) return null;
    
    if (message.read_at) {
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    } else {
      return <Check className="h-3 w-3 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={cn(
      "flex gap-3 mb-4 group",
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
        {/* Reply indicator */}
        {message.parent_message_id && (
          <div className="text-xs text-gray-500 mb-1 italic">
            Replying to a message
          </div>
        )}

        <div className={cn(
          "rounded-lg px-4 py-2 break-words relative",
          isOwn 
            ? "bg-blue-600 text-white" 
            : "bg-gray-100 text-gray-900"
        )}>
          {/* Message content */}
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          
          {/* File attachment */}
          {message.attachment_url && (
            <div className={cn(
              "mt-2 p-3 rounded border border-opacity-20",
              isOwn ? "border-white bg-white bg-opacity-10" : "border-gray-300 bg-gray-50"
            )}>
              <div className="flex items-center gap-2">
                <Paperclip className={cn(
                  "h-4 w-4",
                  isOwn ? "text-white" : "text-gray-600"
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate",
                    isOwn ? "text-white" : "text-gray-900"
                  )}>
                    {message.attachment_name}
                  </p>
                  {message.attachment_size && (
                    <p className={cn(
                      "text-xs",
                      isOwn ? "text-white text-opacity-75" : "text-gray-500"
                    )}>
                      {formatFileSize(message.attachment_size)}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(message.attachment_url!, message.attachment_name!)}
                  className={cn(
                    "h-8 w-8 p-0",
                    isOwn 
                      ? "hover:bg-white hover:bg-opacity-20 text-white" 
                      : "hover:bg-gray-200 text-gray-600"
                  )}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Reply button */}
          {!isOwn && onReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(message)}
              className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0 bg-white shadow-sm hover:bg-gray-50"
            >
              <Reply className="h-3 w-3 text-gray-600" />
            </Button>
          )}
        </div>
        
        <div className={cn(
          "flex items-center gap-2 mt-1 text-xs text-gray-500",
          isOwn ? "flex-row-reverse" : "flex-row"
        )}>
          <span>{formatTime(message.created_at)}</span>
          {getStatusIcon()}
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleEnhanced;
