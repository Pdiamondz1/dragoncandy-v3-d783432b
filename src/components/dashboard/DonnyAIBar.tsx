// src/components/dashboard/DonnyAIBar.tsx
import React, { useState, useRef } from 'react';
import donnyIcon from '@/assets/Donny_icon.png';
import { cn } from '@/lib/utils';

interface DonnyAIBarProps {
  placeholder: string; // Role-specific placeholder text
}

export function DonnyAIBar({ placeholder }: DonnyAIBarProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message: query.trim() } })
    );
    setQuery('');
    setFocused(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 bg-white border-2 border-dc-teal rounded-full transition-all duration-200',
          focused && 'shadow-md ring-2 ring-dc-teal/20'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <img
          src={donnyIcon}
          alt="Donny"
          className="w-10 h-10 md:w-11 md:h-11 flex-shrink-0 rounded-full object-contain shadow-[0_0_8px_rgba(77,217,192,0.4)]"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
        />
      </div>
    </form>
  );
}
