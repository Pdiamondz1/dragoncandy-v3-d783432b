import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { formatDuration } from '@/lib/formatDuration';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

interface FeedTileProps {
  media: PortfolioMedia;
  onOpen: () => void;
  /** Uploaded since the viewer's last visit. */
  isNew?: boolean;
}

export const FeedTile: React.FC<FeedTileProps> = ({ media, onOpen, isNew = false }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

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
          // The browser already decodes duration under preload="metadata" — no server-side probe
          // and no new column needed to label how long a clip runs.
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
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

      {!error && (
        <>
          {/* Video: a filled pill instead of the old bare 16px icon, so "this is a video" reads at
              a glance and the running time is visible before you commit to opening it. */}
          {media.type === 'video' && (
            <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
              <Play className="h-2.5 w-2.5 fill-white" aria-hidden />
              {formatDuration(duration) ?? 'Video'}
            </span>
          )}

          {isNew && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-dc-teal px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              New
            </span>
          )}

          {/* Attribution. The desktop grid previously rendered NOTHING on the tile — an anonymous
              wall of squares with no way to tell whose work you were looking at. Mobile FeedPost
              always had a creator header; this brings desktop to parity without a hover-only
              affordance (which touch-capable laptops can't reach). */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-left">
            {media.avatarUrl && (
              <img
                src={media.avatarUrl}
                alt=""
                className="h-4 w-4 flex-shrink-0 rounded-full object-cover ring-1 ring-white/70"
                loading="lazy"
              />
            )}
            <span className="truncate text-[11px] font-semibold text-white drop-shadow">
              {media.creatorName}
            </span>
          </span>
        </>
      )}
    </button>
  );
};
