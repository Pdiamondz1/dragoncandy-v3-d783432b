import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Star, 
  Archive, 
  Forward, 
  Reply, 
  MoreHorizontal,
  Edit,
  Check,
  CheckCheck 
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useStarMessage, type Message } from '@/hooks/useMessages';
import MessageReactions from './MessageReactions';
import UserPresenceIndicator from './UserPresenceIndicator';

interface MessageBubbleEnhancedProps {
  message: Message;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

const MessageBubbleEnhanced: React.FC<MessageBubbleEnhancedProps> = ({
  message,
  onReply,
  onForward,
  onEdit
}) => {
  const { user } = useAuth();
  const starMessage = useStarMessage();
  const [showActions, setShowActions] = useState(false);

  const isOwnMessage = message.sender_id === user?.id;
  const senderName = message.sender_profile?.email || 'Unknown User';
  const senderAvatar = message.sender_profile?.avatar_url;

  const handleStarToggle = () => {
    starMessage.mutate({ 
      messageId: message.id, 
      isStarred: !message.is_starred 
    });
  };

  const getDeliveryStatusIcon = () => {
    switch (message.delivery_status) {
      case 'sent':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      default:
        return null;
    }
  };

  const getCategoryBadge = () => {
    if (message.category === 'urgent') {
      return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
    }
    if (message.category === 'info') {
      return <Badge variant="secondary" className="text-xs">Info</Badge>;
    }
    return null;
  };

  return (
    <div 
      className={`flex gap-3 p-4 hover:bg-gray-50 group ${isOwnMessage ? 'flex-row-reverse' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <UserPresenceIndicator
        userId={message.sender_id}
        userName={message.sender_profile?.full_name || undefined}
        userEmail={message.sender_profile?.email || undefined}
        avatarUrl={senderAvatar}
        size="sm"
      />

      {/* Message content */}
      <div className={`flex-1 max-w-md ${isOwnMessage ? 'text-right' : ''}`}>
        {/* Header */}
        <div className={`flex items-center gap-2 mb-1 ${isOwnMessage ? 'justify-end' : ''}`}>
          <span className="text-sm font-medium text-gray-900">{senderName}</span>
          {getCategoryBadge()}
          {message.is_starred && <Star className="h-3 w-3 text-yellow-500 fill-current" />}
          <span className="text-xs text-gray-500">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Forwarded indicator */}
        {message.forwarded_from_message_id && (
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Forward className="h-3 w-3" />
            Forwarded
          </div>
        )}

        {/* Reply context */}
        {message.parent_message_id && (
          <div className="bg-gray-100 p-2 rounded mb-2 text-sm border-l-2 border-gray-300">
            <span className="text-gray-600">Replying to previous message</span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`inline-block px-4 py-2 rounded-lg max-w-full ${
            isOwnMessage
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          
          {/* Attachment */}
          {message.attachment_url && (
            <div className="mt-2 p-2 bg-black bg-opacity-10 rounded">
              <a 
                href={message.attachment_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm underline flex items-center gap-1"
              >
                📎 {message.attachment_name || 'Attachment'}
                {message.attachment_size && (
                  <span className="text-xs opacity-75">
                    ({Math.round(message.attachment_size / 1024)}KB)
                  </span>
                )}
              </a>
            </div>
          )}

          {/* Edited indicator */}
          {message.edited_at && (
            <div className="mt-1">
              <span className="text-xs opacity-75">edited</span>
            </div>
          )}
        </div>

        {/* Delivery status for own messages */}
        {isOwnMessage && (
          <div className="flex items-center justify-end gap-1 mt-1">
            {getDeliveryStatusIcon()}
          </div>
        )}

        {/* Reactions */}
        <MessageReactions messageId={message.id} />

        {/* Quick actions */}
        {showActions && (
          <div className={`flex items-center gap-1 mt-2 ${isOwnMessage ? 'justify-end' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStarToggle}
              className="h-6 px-2"
            >
              <Star className={`h-3 w-3 ${message.is_starred ? 'text-yellow-500 fill-current' : ''}`} />
            </Button>
            
            {onReply && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReply(message)}
                className="h-6 px-2"
              >
                <Reply className="h-3 w-3" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onForward && (
                  <DropdownMenuItem onClick={() => onForward(message)}>
                    <Forward className="h-4 w-4 mr-2" />
                    Forward
                  </DropdownMenuItem>
                )}
                {isOwnMessage && onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(message)}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubbleEnhanced;
