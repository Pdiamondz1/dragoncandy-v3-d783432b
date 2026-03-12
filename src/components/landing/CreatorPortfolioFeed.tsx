import React from 'react';
import { useCreatorPortfolioFeed } from '@/hooks/useCreatorPortfolioFeed';

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
  
  if (loading || portfolioMedia.length === 0) {
    // Placeholder photo strip while loading
    return (
      <div className="flex gap-2 px-2 pb-4 overflow-x-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-24 h-24 flex-shrink-0 rounded-xl bg-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-2 pb-4 overflow-x-auto">
      {portfolioMedia.slice(0, 6).map((item, i) => (
        <div key={i} className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-200">
          <img
            src={item.url}
            alt="Creator portfolio"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
};