import React from 'react';
import { useCreatorPortfolioFeed } from '@/hooks/useCreatorPortfolioFeed';
import { CreatorFeedColumn } from './CreatorFeedColumn';

export const CreatorPortfolioFeed = () => {
  const { portfolioMedia, loading, error } = useCreatorPortfolioFeed();

  if (loading || error || !portfolioMedia.length) {
    return null; // Don't render if no data
  }

  // Split media items into two columns
  const midpoint = Math.ceil(portfolioMedia.length / 2);
  const leftColumnItems = portfolioMedia.slice(0, midpoint);
  const rightColumnItems = portfolioMedia.slice(midpoint);

  return (
    <>
      {/* Left Column - Scrolls Up */}
      <div className="fixed left-0 top-0 w-32 lg:w-48 z-0 opacity-30 hover:opacity-50 transition-opacity duration-300">
        <CreatorFeedColumn 
          mediaItems={leftColumnItems} 
          direction="up"
          className="pr-2"
        />
      </div>

      {/* Right Column - Scrolls Down */}
      <div className="fixed right-0 top-0 w-32 lg:w-48 z-0 opacity-30 hover:opacity-50 transition-opacity duration-300">
        <CreatorFeedColumn 
          mediaItems={rightColumnItems} 
          direction="down"
          className="pl-2"
        />
      </div>
    </>
  );
};