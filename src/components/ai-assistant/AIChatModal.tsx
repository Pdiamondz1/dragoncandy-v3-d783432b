import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { AIMessageBubble } from './AIMessageBubble';
import { AITypingIndicator } from './AITypingIndicator';
import { cn } from '@/lib/utils';

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

const getRoleGreeting = (role: string): string => {
  switch (role) {
    case 'business_client':
      return "Hey there! I'm Donny, your Restaurant Assistant. I can help you create campaigns, find creators, manage promotions, and answer any questions. What would you like to do?";
    case 'content_creator':
      return "Hey! I'm Donny, your Creator Assistant. I can help you find campaigns, manage projects, optimize your profile, and more. How can I help today?";
    case 'brand':
      return "Hello! I'm Donny, your Brand Assistant. I can help you discover sponsorship opportunities, find creators, and manage partnerships. What are you looking for?";
    default:
      return "Hi! I'm Donny, your DragonCandy Assistant. How can I help you today?";
  }
};

const getSuggestions = (role: string): { text: string; icon: string }[] => {
  switch (role) {
    case 'business_client':
      return [
        { text: "I would like to build a Campaign", icon: "📢" },
        { text: "How many Creators are available near me?", icon: "📍" },
        { text: "Show me how to create a promotion", icon: "🎁" },
        { text: "What are the best practices for working with creators?", icon: "💡" },
      ];
    case 'content_creator':
      return [
        { text: "Find campaigns that match my skills", icon: "🎯" },
        { text: "How do I improve my profile visibility?", icon: "✨" },
        { text: "Show me available gigs near me", icon: "📍" },
        { text: "Tips for writing a great application", icon: "📝" },
      ];
    case 'brand':
      return [
        { text: "Find restaurants to sponsor", icon: "🍽️" },
        { text: "How does the sponsorship process work?", icon: "🤝" },
        { text: "Show me campaigns open for sponsorship", icon: "📢" },
        { text: "Best practices for brand partnerships", icon: "💡" },
      ];
    default:
      return [
        { text: "How can I get started?", icon: "🚀" },
        { text: "Tell me about DragonCandy", icon: "🐉" },
        { text: "What features are available?", icon: "✨" },
        { text: "How do I set up my profile?", icon: "👤" },
      ];
  }
};

export const AIChatModal: React.FC<AIChatModalProps> = ({ isOpen, onClose, userRole }) => {
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
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (!isLoading) {
      sendMessage(suggestion);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const suggestions = getSuggestions(userRole);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl h-[80vh] max-h-[700px] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border bg-gradient-to-r from-pink-500/10 to-purple-600/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">Donny</DialogTitle>
                <p className="text-sm text-muted-foreground">Your DragonCandy AI Assistant</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="space-y-6">
              <AIMessageBubble
                role="assistant"
                content={getRoleGreeting(userRole)}
              />
              
              {/* Suggestions */}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-medium">Try asking:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion.text)}
                      disabled={isLoading}
                      className={cn(
                        "flex items-center gap-2 p-3 text-left text-sm",
                        "bg-muted/50 hover:bg-muted border border-border rounded-lg",
                        "transition-all duration-200 hover:border-primary/30",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      <span className="text-lg">{suggestion.icon}</span>
                      <span className="text-foreground/80">{suggestion.text}</span>
                    </button>
                  ))}
                </div>
              </div>
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
        <form onSubmit={handleSubmit} className="flex-shrink-0 p-4 border-t border-border bg-background">
          <div className="flex gap-3">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Donny anything..."
              disabled={isLoading}
              className="flex-1 bg-muted/50 h-11"
            />
            <Button
              type="submit"
              size="lg"
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 px-6"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
