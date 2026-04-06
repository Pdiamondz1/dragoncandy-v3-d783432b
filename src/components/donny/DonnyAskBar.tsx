// src/components/donny/DonnyAskBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import donnyIcon from '@/assets/Donny_icon.png';
import { cn } from '@/lib/utils';

interface DonnyAskBarProps {
  userRole: string;
}

const quickChips = [
  { label: 'Generate Campaign', href: '/dashboard/business/campaigns/create' },
  { label: 'Find Creators', href: '/dashboard/business/creators' },
  { label: 'Check Analytics', href: '/dashboard/analytics' },
];

export function DonnyAskBar({ userRole }: DonnyAskBarProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Close chips on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    // Open DonnyChatSheet with the query pre-filled
    window.dispatchEvent(
      new CustomEvent('donny-open-chat', { detail: { message: query.trim() } })
    );
    setQuery('');
    setFocused(false);
  };

  return (
    <div ref={containerRef} className="space-y-2">
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
            placeholder="Ask Donny anything... &quot;Create a campaign for our new brunch menu&quot;"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none"
          />
        </div>
      </form>

      {/* Quick-action chips — visible on focus */}
      <div
        className={cn(
          'flex gap-2 flex-wrap px-1 transition-all duration-200 overflow-hidden',
          focused ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        {quickChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              navigate(chip.href);
              setFocused(false);
            }}
            className="text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5 hover:bg-teal-100 transition-colors"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
