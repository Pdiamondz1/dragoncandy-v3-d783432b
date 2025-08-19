import React from 'react';
import { createPortal } from 'react-dom';
import { useCreatorPortfolioFeed } from '@/hooks/useCreatorPortfolioFeed';
import { CreatorFeedColumn } from './CreatorFeedColumn';

export const CreatorPortfolioFeed = () => {
  const { portfolioMedia, loading, error } = useCreatorPortfolioFeed();

  // Debug logging to see current state
  console.log('🖥️ CreatorPortfolioFeed Debug:', {
    loading,
    error,
    portfolioMediaLength: portfolioMedia.length,
    portfolioMedia
  });

  // Enhanced debug - always render for now to see what's happening
  console.log('🔍 CreatorPortfolioFeed: About to render, component mounted');
  
  // Only show feed if we have enough content to make it look good
  if (loading || error || portfolioMedia.length === 0) {
    return null;
  }

  // Smart column distribution logic
  let leftColumnItems: typeof portfolioMedia;
  let rightColumnItems: typeof portfolioMedia;

  if (portfolioMedia.length === 1) {
    // For single item, duplicate it to both columns for balanced look
    leftColumnItems = portfolioMedia;
    rightColumnItems = portfolioMedia;
  } else {
    // For multiple items, split them between columns
    const midpoint = Math.ceil(portfolioMedia.length / 2);
    leftColumnItems = portfolioMedia.slice(0, midpoint);
    rightColumnItems = portfolioMedia.slice(midpoint);
  }

  // Use React Portal to render outside normal document flow
  return createPortal(
    <div 
      style={{
        position: 'fixed' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
        userSelect: 'none',
        contain: 'layout style',
        isolation: 'isolate',
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform'
      }}
    >
      {/* Left Column - CSS Animation Up */}
      <div 
        style={{
          position: 'absolute' as const,
          left: 0,
          top: 0,
          width: '10rem',
          height: '100%',
          opacity: 0.7,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'auto',
          paddingRight: '0.75rem',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          contain: 'layout style'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      >
        <CreatorFeedColumn 
          mediaItems={leftColumnItems} 
          direction="up"
        />
      </div>

      {/* Right Column - CSS Animation Down */}
      <div 
        style={{
          position: 'absolute' as const,
          right: 0,
          top: 0,
          width: '10rem',
          height: '100%',
          opacity: 0.7,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'auto',
          paddingLeft: '0.75rem',
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
          contain: 'layout style'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      >
        <CreatorFeedColumn 
          mediaItems={rightColumnItems} 
          direction="down"
        />
      </div>
    </div>,
    document.body
  );
};