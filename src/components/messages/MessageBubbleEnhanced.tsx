import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import logo from '@/assets/dragon-candy-logo.png';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Reply,
  Download,
  Check,
  CheckCheck
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { type Message } from '@/hooks/useMessages';
import MessageReactions from './MessageReactions';

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
  const senderName = message.sender_profile?.full_name ||
                     message.sender_profile?.email ||
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
      window.open(url, '_blank');
    }
  };

  const getDeliveryStatusIcon = () => {
    switch (message.delivery_status) {
      case 'sent':
        return <Check className="h-3 w-3 text-white/60" />;
      case 'delivered':
        return <CheckCheck className="h-3 w-3 text-white/60" />;
      case 'read':
        return <CheckCheck className="h-3 w-3 text-white" />;
      default:
        return null;
    }
  };

  const getCategoryBadge = () => {
    if (message.category === 'urgent') {
      return <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Urgent</Badge>;
    }
    if (message.category === 'info') {
      return <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Info</Badge>;
    }
    return null;
  };

  return (
    <div className={`group flex gap-2.5 px-4 py-1.5 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
      {/* Avatar — only show for other people's messages */}
      {!isOwnMessage && (
        <Avatar className="h-8 w-8 flex-shrink-0 mt-1 ring-2 ring-teal-400">
          <AvatarImage src={senderAvatar || logo} alt={senderName} />
          <AvatarFallback className="bg-dc-pink text-white text-xs font-semibold">
            {senderName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message content */}
      <div className={`flex flex-col max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {/* Sender name + time (only for other's messages) */}
        {!isOwnMessage && (
          <div className="flex items-center gap-2 mb-0.5 px-1">
            <span className="text-xs font-medium text-foreground">{senderName}</span>
            {getCategoryBadge()}
          </div>
        )}

        {/* Forwarded indicator */}
        {message.forwarded_from_message_id && (
          <div className="text-[10px] text-muted-foreground mb-0.5 px-1 italic">
            Forwarded
          </div>
        )}

        {/* Reply context */}
        {message.parent_message_id && message.parent_message && (
          <div className={`mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 ${
            isOwnMessage
              ? 'bg-dc-teal/20 border-white/40 text-white/80'
              : 'bg-muted border-dc-pink/40 text-muted-foreground'
          }`}>
            <span className="font-medium text-[10px]">
              {message.parent_message.sender_profile?.full_name || 'User'}
            </span>
            <p className="truncate mt-0.5 opacity-80">
              {message.parent_message.content.length > 60
                ? message.parent_message.content.substring(0, 60) + '...'
                : message.parent_message.content}
            </p>
          </div>
        )}

        {/* Message bubble — teal for outbound, pink for inbound */}
        <div
          className={`inline-block px-4 py-2.5 max-w-full transition-shadow duration-200 ${
            isOwnMessage
              ? 'bg-dc-teal text-white rounded-2xl rounded-br-md shadow-sm'
              : 'bg-dc-pink text-white rounded-2xl rounded-bl-md shadow-sm'
          }`}
        >
          <p className="text-base whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>

          {/* Attachment */}
          {message.attachment_url && (
            <div className="mt-2">
              {(() => {
                const isImage = message.attachment_name &&
                  /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(message.attachment_name);

                if (isImage) {
                  return (
                    <div className="space-y-1.5">
                      <img
                        src={message.attachment_url}
                        alt={message.attachment_name || 'Shared image'}
                        className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: '240px', maxWidth: '280px' }}
                        onClick={() => window.open(message.attachment_url, '_blank')}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className={`mt-1.5 p-2 rounded-lg ${
                      isOwnMessage ? 'bg-white/15' : 'bg-muted/60'
                    }`}>
                      <a
                        href={message.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline flex items-center gap-1.5"
                      >
                        📎 {message.attachment_name || 'Attachment'}
                        {message.attachment_size && (
                          <span className="opacity-70">
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

          {/* Timestamp + delivery status inside bubble */}
          <div className={`flex items-center gap-1.5 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
            <span className={`text-[10px] ${
              isOwnMessage ? 'text-white/60' : 'text-muted-foreground'
            }`}>
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
            {message.edited_at && (
              <span className={`text-[10px] ${isOwnMessage ? 'text-white/50' : 'text-muted-foreground/70'}`}>
                · edited
              </span>
            )}
            {isOwnMessage && getDeliveryStatusIcon()}
          </div>
        </div>

        {/* Reactions */}
        <MessageReactions messageId={message.id} />

        {/* Hover actions */}
        <div className={`flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
          isOwnMessage ? 'flex-row-reverse' : ''
        }`}>
          {onReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(message)}
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
          )}
          {message.attachment_url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload(message.attachment_url!, message.attachment_name || undefined)}
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3 w-3 mr-1" />
              Save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubbleEnhanced;
