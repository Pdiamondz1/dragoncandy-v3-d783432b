
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
  const { sendTypingIndicator } = useTypingIndicator(campaignId);
  const { user } = useAuth();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

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

    // Send typing indicator
    if (value.trim()) {
      sendTypingIndicator(true);
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing indicator after 2 seconds of inactivity
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(false);
      }, 2000);
    } else {
      sendTypingIndicator(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Limit file size to 10MB
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Clean up typing indicator on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      sendTypingIndicator(false);
    };
  }, [sendTypingIndicator]);

  return (
    <div className="bg-[#A8A8A0] border-t border-[#909090]">
      {/* Reply indicator */}
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#959590] border-b border-[#909090]">
          <div className="flex items-center gap-2">
            <Reply className="h-4 w-4 text-white" />
            <span className="text-sm text-white">
              Replying to {replyingTo.sender_profile?.full_name || 'Unknown User'}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelReply} className="text-white hover:text-gray-200">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* File attachment preview */}
      {file && (
        <div className="flex items-center justify-between px-4 py-2 bg-teal-900/30 border-b border-[#909090]">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-teal-300" />
            <span className="text-sm text-white">{file.name}</span>
            <span className="text-xs text-gray-300">
              ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={removeFile} className="text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Message input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3">
        <Input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.txt"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <span className="text-white text-xl font-light leading-none">+</span>
        </button>

        <Textarea
          value={message}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || uploading}
          className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-full bg-white border-0 px-5 py-2 text-sm focus-visible:ring-1 focus-visible:ring-teal-400"
          rows={1}
        />
        
        <button
          type="submit"
          disabled={(!message.trim() && !file) || disabled || uploading}
          className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </form>
    </div>
  );
};

export default MessageInputEnhanced;
