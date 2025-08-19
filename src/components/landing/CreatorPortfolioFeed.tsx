import React from 'react';
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

  return (
    <>
      {/* Left Column - Scrolls Up, Fixed to viewport */}
      <div className="fixed left-0 top-0 w-40 lg:w-64 h-screen z-0 opacity-70 hover:opacity-90 transition-opacity duration-300 pointer-events-none">
        <CreatorFeedColumn 
          mediaItems={leftColumnItems} 
          direction="up"
          className="pr-3"
        />
      </div>

      {/* Right Column - Scrolls Down, Fixed to viewport */}
      <div className="fixed right-0 top-0 w-40 lg:w-64 h-screen z-0 opacity-70 hover:opacity-90 transition-opacity duration-300 pointer-events-none">
        <CreatorFeedColumn 
          mediaItems={rightColumnItems} 
          direction="down"
          className="pl-3"
        />
      </div>
    </>
  );
};