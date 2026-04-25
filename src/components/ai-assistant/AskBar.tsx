import React from 'react';
import dragonEmblem from '@/assets/donny-emblem.png';
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
      <div className="w-10 h-10 md:w-11 md:h-11 flex-shrink-0 rounded-full overflow-hidden shadow-[0_0_8px_rgba(77,217,192,0.4)]">
        <img src={dragonEmblem} alt="Donny" className="w-full h-full object-cover scale-[1.35]" />
      </div>
      <span className="text-gray-400 text-base flex-1 text-left">
        Ask Donny...
      </span>
    </button>
  );
};
