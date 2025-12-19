import React from 'react';
import { Sparkles, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AskBarProps {
  onClick: () => void;
  userRole: string;
}

const getRolePlaceholder = (role: string): string => {
  switch (role) {
    case 'business_client':
      return 'Ask Donny about campaigns, creators, promotions...';
    case 'content_creator':
      return 'Ask Donny about finding gigs, managing projects...';
    case 'brand':
      return 'Ask Donny about sponsorships, partnerships...';
    default:
      return 'Ask Donny anything...';
  }
};

export const AskBar: React.FC<AskBarProps> = ({ onClick, userRole }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full max-w-2xl mx-auto flex items-center gap-3 px-4 py-3",
        "bg-muted/50 hover:bg-muted border border-border rounded-xl",
        "transition-all duration-200 hover:shadow-md hover:border-primary/30",
        "group cursor-text"
      )}
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <span className="text-muted-foreground text-sm flex-1 text-left">
        {getRolePlaceholder(userRole)}
      </span>
      <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
        <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">⌘</kbd>
        <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono">K</kbd>
      </div>
    </button>
  );
};
