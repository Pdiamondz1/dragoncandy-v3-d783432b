
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send } from 'lucide-react';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface MessageInputProps {
  campaignId: string;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({ 
  campaignId,
  onSendMessage, 
  disabled = false,
  placeholder = "Type your message…"
}) => {
  const [message, setMessage] = useState('');
  const { sendTypingIndicator } = useTypingIndicator(campaignId);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const draftKey = `dc_msg_draft_${campaignId}`;

  // Load draft on mount / conversation switch — reset to empty if no draft exists
  useEffect(() => {
    const saved = localStorage.getItem(draftKey);
    setMessage(saved || '');
  }, [draftKey]);

  // Persist draft on change
  useEffect(() => {
    if (message) localStorage.setItem(draftKey, message);
    else localStorage.removeItem(draftKey);
  }, [message, draftKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      localStorage.removeItem(draftKey);
      setMessage('');
      sendTypingIndicator(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t bg-white">
      <Textarea
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[40px] max-h-[120px] resize-none"
        rows={1}
        aria-label="Message"
        name="message"
      />
      <Button
        type="submit"
        disabled={!message.trim() || disabled}
        size="sm"
        className="self-end"
        aria-label="Send message"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
};

