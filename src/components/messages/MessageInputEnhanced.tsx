
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, X, Reply } from 'lucide-react';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { Message } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface MessageInputEnhancedProps {
  campaignId?: string;
  conversationId?: string;
  onSendMessage: (content: string, options?: {
    attachmentUrl?: string;
    attachmentName?: string;
    attachmentSize?: number;
    parentMessageId?: string;
    threadId?: string;
  }) => void;
  disabled?: boolean;
  placeholder?: string;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
}

const MessageInputEnhanced: React.FC<MessageInputEnhancedProps> = ({
  campaignId,
  conversationId,
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
  replyingTo,
  onCancelReply
}) => {
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendTypingIndicator } = useTypingIndicator(campaignId);
  const { user } = useAuth();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Focus input when reply is set
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  const uploadFile = async (file: File): Promise<{ attachmentUrl: string; attachmentName: string; attachmentSize: number }> => {
    if (!user?.id) {
      toast({
        title: 'You must be signed in to upload',
        description: 'Please sign in and try again.',
        variant: 'destructive',
      });
      throw new Error('Missing user id for upload');
    }

    const fileExt = file.name.split('.').pop();
    const randomId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const fileName = `${randomId}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('message-attachments')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data: signedData, error: urlError } = await supabase.storage
      .from('message-attachments')
      .createSignedUrl(filePath, 60 * 60);

    if (urlError || !signedData?.signedUrl) {
      throw urlError || new Error('Failed to generate signed URL');
    }

    return {
      attachmentUrl: signedData.signedUrl,
      attachmentName: file.name,
      attachmentSize: file.size
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && !file) || disabled) return;

    try {
      let attachmentData = undefined;

      if (file) {
        setUploading(true);
        attachmentData = await uploadFile(file);
      }

      onSendMessage(message.trim() || `📎 ${file?.name}`, {
        ...attachmentData,
        parentMessageId: replyingTo?.id,
        threadId: replyingTo?.thread_id || replyingTo?.id,
      });

      setMessage('');
      setFile(null);
      sendTypingIndicator(false);
      if (onCancelReply) onCancelReply();
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);

    if (value.trim()) {
      sendTypingIndicator(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTypingIndicator(false), 2000);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please select a file smaller than 10MB.',
          variant: 'destructive',
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      sendTypingIndicator(false);
    };
  }, [sendTypingIndicator]);

  return (
    <div className="border-t border-border/50 bg-card">
      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-primary/5 border-b border-border/30">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-0.5 h-8 bg-primary rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] font-medium text-primary">
                Replying to {replyingTo.sender_profile?.full_name || 'User'}
              </span>
              <p className="text-xs text-muted-foreground truncate">
                {replyingTo.content.substring(0, 60)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={onCancelReply}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* File attachment preview */}
      {file && (
        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border/30">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className="text-xs text-foreground truncate">{file.name}</span>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              ({(file.size / 1024 / 1024).toFixed(1)} MB)
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 flex-shrink-0" onClick={removeFile}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Message input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3">
        <Input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 flex-shrink-0 text-muted-foreground hover:text-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || uploading}
          className="min-h-[40px] max-h-[120px] resize-none text-sm bg-muted/30 border-border/50 focus:border-primary/50 rounded-xl"
          rows={1}
        />

        <Button
          type="submit"
          disabled={(!message.trim() && !file) || disabled || uploading}
          size="sm"
          className="h-9 w-9 p-0 flex-shrink-0 rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white shadow-sm transition-all duration-200"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};

export default MessageInputEnhanced;
