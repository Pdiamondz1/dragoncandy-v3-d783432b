import React from 'react';
import dragonEmblem from '@/assets/dragon-emblem.png';
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
      <img src={dragonEmblem} alt="Donny" className="w-6 h-6 flex-shrink-0 object-contain" />
      <span className="text-gray-400 text-base flex-1 text-left">
        Ask Donny...
      </span>
    </button>
  );
};
