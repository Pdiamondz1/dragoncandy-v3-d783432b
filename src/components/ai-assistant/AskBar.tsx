import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AskBarProps {
  onClick: () => void;
  userRole: string;
}

export const AskBar: React.FC<AskBarProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-4 py-3",
        "bg-white border-2 border-dc-teal rounded-full",
        "transition-all duration-200 hover:shadow-md",
        "cursor-text"
      )}
    >
      <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <span className="text-gray-400 text-base flex-1 text-left">
        Ask Donny...
      </span>
    </button>
  );
};
