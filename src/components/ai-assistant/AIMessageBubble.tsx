import React from 'react';
import { Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIMessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
}

export const AIMessageBubble: React.FC<AIMessageBubbleProps> = ({ role, content }) => {
  const isAssistant = role === 'assistant';

  return (
    <div
      className={cn(
        "flex gap-3",
        isAssistant ? "flex-row" : "flex-row-reverse"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
          isAssistant
            ? "bg-gradient-to-r from-pink-500 to-purple-600"
            : "bg-muted"
        )}
      >
        {isAssistant ? (
          <Sparkles className="w-3.5 h-3.5 text-white" />
        ) : (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Message */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
          isAssistant
            ? "bg-muted text-foreground rounded-tl-sm"
            : "bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-tr-sm"
        )}
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{content}</p>
      </div>
    </div>
  );
};
