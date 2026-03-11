import React, { useState } from 'react';

interface PortfolioMediaItemProps {
  url: string;
  type: 'image' | 'video';
  creatorName: string;
  className?: string;
}

export const PortfolioMediaItem = ({ url, type, creatorName, className = '' }: PortfolioMediaItemProps) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = () => {
    if (import.meta.env.DEV) console.log('✅ PortfolioMediaItem loaded successfully:', url);
    setLoaded(true);
  };

  const handleError = (e: any) => {
    if (import.meta.env.DEV) console.error('❌ PortfolioMediaItem failed to load:', url, e);
    setError(true);
  };

  // Don't render broken media, but log for debugging
  if (error) {
    if (import.meta.env.DEV) console.log('🚫 PortfolioMediaItem: Skipping broken media:', url);
    return <div className={`relative rounded-3xl overflow-hidden bg-muted ${className}`} />;
  }

  return (
    <div className={`relative rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-muted ${className}`} style={{ contain: 'layout size' }}>
      {/* Loading placeholder */}
      {!loaded && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {type === 'video' ? (
        <video
          src={url}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={handleLoad}
          onError={handleError}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
        />
      ) : (
        <img
          src={url}
          alt={`Portfolio work by ${creatorName}`}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}

      {/* Creator name overlay */}
      {loaded && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
          <p className="text-white text-sm font-semibold truncate drop-shadow-sm">{creatorName}</p>
        </div>
      )}
    </div>
  );
};