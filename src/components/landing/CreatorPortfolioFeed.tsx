import React from 'react';
import { useCreatorPortfolioFeed } from '@/hooks/useCreatorPortfolioFeed';
import { CreatorFeedColumn } from './CreatorFeedColumn';

export const CreatorPortfolioFeed = () => {
  const { portfolioMedia, loading, error } = useCreatorPortfolioFeed();

  // Debug logging to see current state
  if (import.meta.env.DEV) {
    console.log('🖥️ CreatorPortfolioFeed Debug:', {
      loading,
      error,
      portfolioMediaLength: portfolioMedia.length,
      portfolioMedia
    });
  }

  // Enhanced debug - always render for now to see what's happening
  if (import.meta.env.DEV) {
    console.log('🔍 CreatorPortfolioFeed: About to render, component mounted');
  }
  
  // Only show feed if we have real content from the database
  if (loading || error || portfolioMedia.length === 0) {
    if (import.meta.env.DEV) console.log('🚫 DragonFeed: No real content available, not rendering feed');
    return (
      <>
        <div className="fixed-sidebar fixed-sidebar-left w-40 lg:w-64" style={{ zIndex: 0 }} />
        <div className="fixed-sidebar fixed-sidebar-right w-40 lg:w-64" style={{ zIndex: 0 }} />
      </>
    );
  }

  if (import.meta.env.DEV) console.log(`📊 DragonFeed: Using ${portfolioMedia.length} real media items`);

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

  if (import.meta.env.DEV) console.log(`🎯 DragonFeed Distribution: Left column: ${leftColumnItems.length} items, Right column: ${rightColumnItems.length} items`);

  return (
    <>
      {/* Left Column - Scrolls Up */}
      <div 
        className="fixed-sidebar fixed-sidebar-left w-40 lg:w-64 opacity-70 hover:opacity-90 transition-opacity duration-300"
        style={{
          pointerEvents: 'none',
          zIndex: 0
        }}
      >
        <CreatorFeedColumn 
          mediaItems={leftColumnItems} 
          direction="up"
          className="pr-3"
        />
      </div>

      {/* Right Column - Scrolls Down */}
      <div 
        className="fixed-sidebar fixed-sidebar-right w-40 lg:w-64 opacity-70 hover:opacity-90 transition-opacity duration-300"
        style={{
          pointerEvents: 'none',
          zIndex: 0
        }}
      >
        <CreatorFeedColumn 
          mediaItems={rightColumnItems} 
          direction="down"
          className="pl-3"
        />
      </div>
    </>
  );
};