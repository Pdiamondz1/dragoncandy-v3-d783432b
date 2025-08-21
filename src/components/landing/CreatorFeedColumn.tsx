import React, { useEffect, useRef, useState } from 'react';
import { PortfolioMediaItem } from './PortfolioMediaItem';

interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
}

interface CreatorFeedColumnProps {
  mediaItems: PortfolioMedia[];
  direction: 'up' | 'down';
  className?: string;
}

export const CreatorFeedColumn = ({ mediaItems, direction, className = '' }: CreatorFeedColumnProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!mediaItems.length || isPaused) return;

    const container = containerRef.current;
    if (!container) return;

    const scrollSpeed = 0.5; // pixels per frame - slower for smoother animation
    const isUpward = direction === 'up';

    let animationId: number;

    const animate = () => {
      if (container && !isPaused) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        if (maxScroll > 0) { // Only animate if there's content to scroll
          if (isUpward) {
            container.scrollTop += scrollSpeed;
            if (container.scrollTop >= maxScroll) {
              container.scrollTop = 0;
            }
          } else {
            container.scrollTop -= scrollSpeed;
            if (container.scrollTop <= 0) {
              container.scrollTop = maxScroll;
            }
          }
        }
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [direction, isPaused, mediaItems.length]);

  if (!mediaItems.length) {
    return null;
  }

  // Create more duplicates for seamless looping - we need enough content to fill the screen multiple times
  const duplicatedItems = [...mediaItems, ...mediaItems, ...mediaItems, ...mediaItems];

  return (
    <div
      ref={containerRef}
      className={`h-screen overflow-hidden scrollbar-hide ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none',
        scrollBehavior: 'auto' // Disable smooth scrolling for animation
      }}
    >
      <div className="flex flex-col gap-4 py-4">
        {duplicatedItems.map((item, index) => (
          <PortfolioMediaItem
            key={`${item.id}-${index}`}
            url={item.url}
            type={item.type}
            creatorName={item.creatorName}
            className="w-full h-64 flex-shrink-0"
          />
        ))}
      </div>
    </div>
  );
};