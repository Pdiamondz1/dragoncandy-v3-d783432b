import React, { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Reply, 
  Download,
  Check,
  CheckCheck 
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { type Message } from '@/hooks/useMessages';
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

  const isOwnMessage = message.sender_id === user?.id;
  const senderName = message.sender_profile?.email || 
                     message.sender_profile?.full_name || 
                     `User ${message.sender_id.slice(0, 8)}`;
  const senderAvatar = message.sender_profile?.avatar_url;

  const handleDownload = async (url: string, filename?: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening in new tab
      window.open(url, '_blank');
    }
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
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
          </div>

        {/* Forwarded indicator */}
        {message.forwarded_from_message_id && (
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            Forwarded
          </div>
        )}

        {/* Reply context */}
        {message.parent_message_id && message.parent_message && (
          <div className="bg-gray-100 p-2 rounded mb-2 text-sm border-l-2 border-gray-300">
            <div className="text-gray-600">
              <span className="font-medium">
                Replying to {message.parent_message.sender_profile?.full_name || message.parent_message.sender_profile?.email || 'User'}:
              </span>
              <div className="text-gray-500 mt-1 truncate">
                {message.parent_message.content.length > 50 
                  ? message.parent_message.content.substring(0, 50) + '...'
                  : message.parent_message.content
                }
              </div>
            </div>
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
            <div className="mt-2">
              {(() => {
                const isImage = message.attachment_name && 
                  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(message.attachment_name);
                
                if (isImage) {
                  return (
                    <div className="space-y-2">
                      <img 
                        src={message.attachment_url}
                        alt={message.attachment_name || 'Shared image'}
                        className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: '300px', maxWidth: '300px' }}
                        onClick={() => window.open(message.attachment_url, '_blank')}
                        onError={(e) => {
                          // Fallback to download link if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'block';
                        }}
                      />
                      <a 
                        href={message.attachment_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs underline flex items-center gap-1 opacity-75 hover:opacity-100"
                        style={{ display: 'none' }}
                      >
                        📎 {message.attachment_name || 'Download image'}
                        {message.attachment_size && (
                          <span className="text-xs">
                            ({Math.round(message.attachment_size / 1024)}KB)
                          </span>
                        )}
                      </a>
                    </div>
                  );
                } else {
                  return (
                    <div className="p-2 bg-black bg-opacity-10 rounded">
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
                  );
                }
              })()}
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

        {/* Actions */}
        {onReply && (
          <div className={`flex items-center gap-2 mt-2 ${isOwnMessage ? 'justify-end' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(message)}
              className="h-6 px-2 text-xs"
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          </div>
        )}

        {/* Download button for attachments */}
        {message.attachment_url && (
          <div className={`flex items-center gap-2 mt-2 ${isOwnMessage ? 'justify-end' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload(message.attachment_url!, message.attachment_name || undefined)}
              className="h-6 px-2 text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubbleEnhanced;
