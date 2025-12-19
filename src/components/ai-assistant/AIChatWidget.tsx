import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { AIMessageBubble } from './AIMessageBubble';
import { AITypingIndicator } from './AITypingIndicator';
import { cn } from '@/lib/utils';

interface AIChatWidgetProps {
  userRole: string;
}

const getRoleGreeting = (role: string): string => {
  switch (role) {
    case 'business_client':
      return "Hey there! I'm Donny, your Restaurant Assistant. I can help you create campaigns, find creators, manage promotions, and more. What would you like to do?";
    case 'content_creator':
      return "Hey! I'm Donny, your Creator Assistant. I can help you find campaigns, manage projects, optimize your profile, and more. How can I help?";
    case 'brand':
      return "Hello! I'm Donny, your Brand Assistant. I can help you discover sponsorship opportunities, find creators, and manage partnerships. What are you looking for?";
    default:
      return "Hi! I'm Donny, your DragonCandy Assistant. How can I help you today?";
  }
};

export const AIChatWidget: React.FC<AIChatWidgetProps> = ({ userRole }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, isLoading, error, sendMessage, clearChat } = useAIAssistant({ userRole });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-lg",
          "bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700",
          "flex items-center justify-center transition-all duration-300",
          "hover:scale-110 active:scale-95",
          isOpen && "rotate-180"
        )}
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Sparkles className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div
          className={cn(
            "fixed bottom-24 left-6 z-50 w-[380px] max-w-[calc(100vw-3rem)]",
            "bg-background border border-border rounded-2xl shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in slide-in-from-bottom-5 fade-in duration-300"
          )}
          style={{ height: 'min(500px, calc(100vh - 150px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-pink-500/10 to-purple-600/10">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">Donny</h3>
                <p className="text-xs text-muted-foreground">Your AI Assistant</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="space-y-4">
                <AIMessageBubble
                  role="assistant"
                  content={getRoleGreeting(userRole)}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <AIMessageBubble
                    key={index}
                    role={message.role}
                    content={message.content}
                  />
                ))}
                {isLoading && messages[messages.length - 1]?.role === 'user' && (
                  <AITypingIndicator />
                )}
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-border">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything..."
                disabled={isLoading}
                className="flex-1 bg-muted/50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
