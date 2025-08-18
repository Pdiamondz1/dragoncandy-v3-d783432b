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
    setLoaded(true);
  };

  const handleError = () => {
    setError(true);
  };

  if (error) {
    return null; // Don't render broken media
  }

  return (
    <div className={`relative rounded-lg overflow-hidden shadow-lg bg-muted ${className}`}>
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
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
          <p className="text-white text-sm font-medium truncate">{creatorName}</p>
        </div>
      )}
    </div>
  );
};