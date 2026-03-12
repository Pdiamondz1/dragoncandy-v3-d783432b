
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
    <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3 bg-[#A8A8A0] border-t border-[#909090]">
      <button
        type="button"
        className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 hover:bg-gray-700 transition-colors"
      >
        <span className="text-white text-xl font-light leading-none">+</span>
      </button>
      <Textarea
        value={message}
        onChange={handleInputChange}
        onKeyPress={handleKeyPress}
        placeholder="Enter Text Here...."
        disabled={disabled}
        className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-full bg-white border-0 px-5 py-2 text-sm focus-visible:ring-1 focus-visible:ring-teal-400"
        rows={1}
      />
      <button
        type="submit"
        disabled={!message.trim() || disabled}
        className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0 hover:bg-gray-700 transition-colors disabled:opacity-40"
      >
        <Send className="h-4 w-4 text-white" />
      </button>
    </form>
  );
};

export default MessageInput;
