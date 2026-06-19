import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

interface FeedTileProps {
  media: PortfolioMedia;
  onOpen: () => void;
}

export const FeedTile: React.FC<FeedTileProps> = ({ media, onOpen }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${media.type} by ${media.creatorName}`}
      className="group relative aspect-square w-full overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
    >
      {!loaded && !error && (
        <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
          <Spinner className="border-2 border-primary border-t-transparent" label="Loading content..." />
        </div>
      )}

      {error ? (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-muted-foreground text-xs">Failed to load</div>
        </div>
      ) : media.type === 'video' ? (
        <video
          src={media.url}
          aria-label={`Video by ${media.creatorName}`}
          className="h-full w-full object-cover pointer-events-none lg:transition-transform lg:duration-200 lg:group-hover:scale-105"
          onLoadedData={() => setLoaded(true)}
          onError={() => setError(true)}
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={media.url}
          alt={`Content by ${media.creatorName}`}
          className="h-full w-full object-cover lg:transition-transform lg:duration-200 lg:group-hover:scale-105"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}

      {media.type === 'video' && !error && (
        <Play className="absolute top-1.5 right-1.5 h-4 w-4 text-white fill-white drop-shadow" />
      )}
    </button>
  );
};
