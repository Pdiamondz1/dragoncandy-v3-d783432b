import { useState, useRef, useCallback } from 'react';
import { useInspirationStrip, type InspirationItem } from '@/hooks/useInspirationStrip';
import type { InspirationRef } from '@/types/firstRun';

interface InspirationStripProps {
  onSelectionChange: (refs: InspirationRef[]) => void;
  onScrolled?: () => void;
}

export function InspirationStrip({ onSelectionChange, onScrolled }: InspirationStripProps) {
  const { data: items, isLoading } = useInspirationStrip();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hasScrolled = useRef(false);

  const handleScroll = useCallback(() => {
    if (!hasScrolled.current) {
      hasScrolled.current = true;
      onScrolled?.();
    }
  }, [onScrolled]);

  const toggleItem = (item: InspirationItem) => {
    const next = new Set(selected);
    if (next.has(item.id)) {
      next.delete(item.id);
    } else {
      next.add(item.id);
    }
    setSelected(next);

    const refs: InspirationRef[] = (items ?? [])
      .filter((i) => next.has(i.id))
      .map((i) => ({
        media_url: i.url,
        creator_name: i.creatorName,
        content_label: i.contentLabel,
        media_type: i.type,
      }));
    onSelectionChange(refs);
  };

  if (isLoading) {
    return (
      <div className="mt-4">
        <div className="flex gap-2 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="min-w-[100px] h-[130px] rounded-xl bg-gray-200 animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items?.length) return null;

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-bold text-gray-900">🔥 Inspiration from creators</span>
        <button className="text-xs font-semibold text-pink-500">See all →</button>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
        onScroll={handleScroll}
      >
        {items.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleItem(item)}
              className={`min-w-[100px] h-[130px] rounded-xl relative flex-shrink-0 overflow-hidden border-2 transition-all ${
                isSelected ? 'border-teal-400 ring-2 ring-teal-200' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <video
                  src={item.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.contentLabel}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-teal-400 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 rounded-b-xl">
                <span className="text-[9px] text-white">{item.contentLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-gray-500 mt-1">
        Tap content you like — Donny uses it as a style reference
      </p>
    </div>
  );
}
