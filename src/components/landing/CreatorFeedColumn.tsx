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

    const scrollSpeed = 1; // pixels per frame - increased for more visible movement
    const isUpward = direction === 'up';

    let animationId: number;

    const animate = () => {
      if (container && !isPaused) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        
        // Debug logging - remove after testing
        if (Math.random() < 0.01) { // Log occasionally
          console.log(`🎭 Animation Debug [${direction}]:`, {
            maxScroll,
            currentScroll: container.scrollTop,
            clientHeight: container.clientHeight,
            scrollHeight: container.scrollHeight
          });
        }
        
        if (maxScroll > 50) { // Ensure sufficient scrollable content
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

  // Create more duplicates for seamless looping - ensure we have enough content for smooth scrolling
  const duplicatedItems = [...mediaItems, ...mediaItems, ...mediaItems, ...mediaItems, ...mediaItems, ...mediaItems];

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-hidden scrollbar-hide ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{ 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none',
        scrollBehavior: 'auto', // Disable smooth scrolling for animation
        pointerEvents: 'auto',
        height: '100vh'
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