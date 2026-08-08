import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { formatDuration } from '@/lib/formatDuration';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

interface FeedPostProps {
  media: PortfolioMedia;
  onOpen: () => void;
  /** Uploaded since the viewer's last visit. */
  isNew?: boolean;
}

export const FeedPost: React.FC<FeedPostProps> = ({ media, onOpen, isNew = false }) => {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const goToProfile = () => navigate(`/creator/${media.creatorSlug || media.creatorId}`);

  return (
    <article className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
      {/* Creator header → profile */}
      <button
        type="button"
        onClick={goToProfile}
        aria-label={`View ${media.creatorName}'s profile`}
        className="flex w-full items-center gap-3 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
      >
        <Avatar className="h-9 w-9 ring-2 ring-teal-400">
          <AvatarImage src={media.avatarUrl} alt={media.creatorName} />
          <AvatarFallback className="text-xs">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-semibold text-dc-text">{media.creatorName}</span>
        {isNew && (
          <span className="ml-auto flex-shrink-0 rounded-full bg-dc-teal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            New
          </span>
        )}
      </button>

      {/* Media → lightbox */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${media.type} by ${media.creatorName}`}
        className="group relative block aspect-square w-full overflow-hidden bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
      >
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted animate-pulse">
            <Spinner className="border-2 border-primary border-t-transparent" label="Loading content..." />
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="text-muted-foreground text-xs">Failed to load</div>
          </div>
        ) : media.type === 'video' ? (
          <video
            src={media.url}
            aria-label={`Video by ${media.creatorName}`}
            className="h-full w-full object-cover"
            onLoadedData={() => setLoaded(true)}
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
            className="h-full w-full object-cover"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}

        {media.type === 'video' && !error && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Play className="h-3 w-3 fill-white" aria-hidden />
            {formatDuration(duration) ?? 'Video'}
          </span>
        )}
      </button>
    </article>
  );
};
