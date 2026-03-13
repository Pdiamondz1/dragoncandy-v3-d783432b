
import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Send, Plus } from 'lucide-react';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';

interface MessageInputProps {
  campaignId: string;
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({
  campaignId,
  onSendMessage,
  disabled = false,
  placeholder = "Type your message..."
}) => {
  const [message, setMessage] = useState('');
  const { sendTypingIndicator } = useTypingIndicator(campaignId);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      sendTypingIndicator(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 bg-white">
      <button
        type="button"
        className="h-9 w-9 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0"
      >
        <Plus className="h-4 w-4 text-white" />
      </button>
      <Input
        value={message}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        disabled={disabled}
        className="rounded-full px-5 border border-dc-pink/40 flex-1 h-9"
      />
      <button
        type="submit"
        disabled={!message.trim() || disabled}
        className="h-9 w-9 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 disabled:opacity-40"
      >
        <Send className="h-4 w-4 text-white" />
      </button>
    </form>
  );
};

export default MessageInput;
