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

  // Temporarily show debug info instead of returning null
  if (loading || error || !portfolioMedia.length) {
    return (
      <div className="fixed top-4 left-4 z-50 bg-black/80 text-white p-4 rounded-lg text-xs max-w-md">
        <h3 className="font-bold mb-2">🐛 DragonFeed Debug</h3>
        <div>Loading: {loading ? 'true' : 'false'}</div>
        <div>Error: {error || 'none'}</div>
        <div>Media Items: {portfolioMedia.length}</div>
        <div>Should Render: {(!loading && !error && portfolioMedia.length > 0) ? 'YES' : 'NO'}</div>
      </div>
    );
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