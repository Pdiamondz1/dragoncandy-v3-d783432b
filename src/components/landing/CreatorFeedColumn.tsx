import React, { useState } from 'react';
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

export const CreatorFeedColumn = ({ mediaItems, direction }: CreatorFeedColumnProps) => {
  const [isPaused, setIsPaused] = useState(false);

  if (!mediaItems.length) {
    return null;
  }

  // Create CSS keyframes for smooth infinite scroll
  const animationName = `dragon-feed-${direction}`;
  const animationDuration = '60s'; // Slow, smooth scrolling
  
  // Duplicate items multiple times for seamless infinite scroll
  const duplicatedItems = [...mediaItems, ...mediaItems, ...mediaItems, ...mediaItems];

  return (
    <>
      {/* Inject CSS animation keyframes */}
      <style>
        {`
          @keyframes dragon-feed-up {
            0% { transform: translateY(0%); }
            100% { transform: translateY(-50%); }
          }
          @keyframes dragon-feed-down {
            0% { transform: translateY(-50%); }
            100% { transform: translateY(0%); }
          }
        `}
      </style>
      
      <div
        style={{
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          contain: 'layout style',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform'
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            padding: '1rem 0',
            animation: isPaused ? 'none' : `${animationName} ${animationDuration} linear infinite`,
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            contain: 'layout style'
          }}
        >
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
    </>
  );
};