import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();

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
              className="w-[90px] h-[90px] lg:w-[120px] lg:h-[120px] rounded-xl bg-gray-200 animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!items?.length) {
    return (
      <div className="mt-4 bg-white rounded-2xl border border-dashed border-gray-300 p-5 text-center">
        <p className="text-2xl mb-2">🐉</p>
        <p className="text-sm text-gray-500">Like content on the DragonFeed to use as style inspiration here</p>
        <button
          onClick={() => navigate('/dashboard/business/dragon-feed')}
          className="mt-3 bg-teal-400 text-white font-semibold text-xs px-5 py-2 rounded-full hover:bg-teal-500 transition-colors"
        >
          Explore DragonFeed
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-bold text-gray-900">❤️ Your Liked Content</span>
        {items.length >= 8 && (
          <button
            onClick={() => navigate('/dashboard/business/dragon-feed')}
            className="text-xs font-semibold text-pink-500"
          >
            See all →
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">From your DragonFeed — Donny uses it as a style reference</p>
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
              className={`w-[90px] h-[90px] lg:w-[120px] lg:h-[120px] rounded-xl relative flex-shrink-0 overflow-hidden border-2 transition-all ${
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
              <div className="absolute top-1 left-1 bg-white rounded-full px-1.5 py-0.5 text-[9px]">❤️</div>
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-teal-400 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 rounded-b-xl">
                <span className="text-[9px] text-white font-semibold">@{item.creatorName.toLowerCase().replace(/\s+/g, '_')}</span>
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
