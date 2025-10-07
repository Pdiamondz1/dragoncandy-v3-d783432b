import React, { useEffect, useRef, useState } from 'react';
import { useBusinessDragonFeed, FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Play, Pause, Heart, MessageSquare, Loader2, User } from 'lucide-react';

interface BusinessDashboardSideFeedProps {
  onItemClick: (item: FeedMediaItem, index: number) => void;
  onFeedItemsLoaded?: (items: FeedMediaItem[]) => void;
}

export const BusinessDashboardSideFeed: React.FC<BusinessDashboardSideFeedProps> = ({ 
  onItemClick, 
  onFeedItemsLoaded 
}) => {
  const { feedItems, loading, error } = useBusinessDragonFeed();
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!loading && feedItems.length > 0 && onFeedItemsLoaded) {
      onFeedItemsLoaded(feedItems);
    }
  }, [feedItems, loading, onFeedItemsLoaded]);


  // Auto-scroll animation
  useEffect(() => {
    if (!feedItems.length || isPaused || loading) return;

    const container = containerRef.current;
    if (!container) {
      console.log('📭 Dragon Feed: No container ref');
      return;
    }

    console.log('🎬 Dragon Feed: Starting auto-scroll', {
      feedItemsCount: feedItems.length,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
      isPaused
    });

    const scrollSpeed = 0.8; // pixels per frame
    let animationId: number;
    let y = 0; // fallback translate offset

    const animate = () => {
      if (container && !isPaused) {
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll > 0) {
          container.scrollTop += scrollSpeed; // Upward scroll
          if (container.scrollTop >= maxScroll - 1) {
            container.scrollTop = 0; // Reset for seamless loop
          }
        } else {
          // Fallback: translate the list itself when native scroll is not possible
          const list = listRef.current;
          if (list) {
            const loopCopies = 2;
            const totalHeight = list.scrollHeight;
            const baseHeight = loopCopies > 0 ? totalHeight / loopCopies : totalHeight;
            y += scrollSpeed;
            if (y >= Math.max(baseHeight, 1)) {
              y = 0;
            }
            list.style.transform = `translateY(-${y}px)`;
          }
        }
      }
      animationId = requestAnimationFrame(animate);
    };

    // Start animation after a brief delay to ensure content is rendered
    const timeoutId = setTimeout(() => {
      animationId = requestAnimationFrame(animate);
    }, 100);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPaused, feedItems.length, loading]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground text-center">Unable to load feed</p>
      </div>
    );
  }

  if (feedItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground text-center">No content available yet</p>
      </div>
    );
  }

  // Duplicate items for seamless looping
  const getLoopDuplication = () => {
    const loopCopies = 2;
    const result: FeedMediaItem[] = [];
    for (let i = 0; i < loopCopies; i++) {
      result.push(...feedItems);
    }
    return result;
  };

  const duplicatedItems = feedItems.length > 0 ? getLoopDuplication() : [];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Dragon Feed</h2>
        <p className="text-xs text-muted-foreground">Latest creator content</p>
      </div>
      
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollBehavior: 'auto',
          overflowX: 'hidden'
        }}
      >
        <div ref={listRef} className="flex flex-col gap-3 p-3" style={{ willChange: 'transform' }}>
          {duplicatedItems.map((item, index) => {
            const originalIndex = index % feedItems.length;
            return (
              <FeedCard
                key={`${item.id}-${index}`}
                item={item}
                onItemClick={() => onItemClick(item, originalIndex)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Separate card component for better performance
interface FeedCardProps {
  item: FeedMediaItem;
  onItemClick: () => void;
}

const FeedCard: React.FC<FeedCardProps> = ({ item, onItemClick }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  const toggleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLiked(!liked);
  };

  const toggleVideoPlayback = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    
    try {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        await videoRef.current.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Video playback error:', error);
    }
  };

  return (
    <Card 
      className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105 cursor-pointer"
      onClick={onItemClick}
    >
      <div className="relative aspect-square overflow-hidden">
        {!loaded && !error && (
          <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        
        {error ? (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <div className="text-muted-foreground text-sm">Failed to load</div>
          </div>
        ) : (
          <>
            {item.type === 'video' ? (
              <video
                ref={videoRef}
                src={item.url}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                onLoadedData={handleLoad}
                onError={handleError}
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={item.url}
                alt={`Content by ${item.creatorName}`}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                onLoad={handleLoad}
                onError={handleError}
              />
            )}
          </>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
        
        {/* Play/Pause button for videos */}
        {item.type === 'video' && loaded && (
          <button
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-transparent border-0 cursor-pointer"
            onClick={toggleVideoPlayback}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            <div className="bg-white/90 rounded-full p-3 shadow-lg pointer-events-none">
              {isPlaying ? (
                <Pause className="h-6 w-6 text-primary fill-current" />
              ) : (
                <Play className="h-6 w-6 text-primary fill-current" />
              )}
            </div>
          </button>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <Badge variant="secondary" className="text-xs bg-black/70 text-white border-0">
            {item.type === 'video' ? 'Video' : 'Photo'}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
            onClick={toggleLike}
          >
            <Heart className={`h-4 w-4 ${liked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
          </Button>
          <Button
            size="sm" 
            variant="secondary"
            className="h-8 w-8 p-0 bg-white/90 hover:bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Navigation handled by parent if needed
              }}
              className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors cursor-pointer text-left w-full"
            >
              {item.creatorName}
            </button>
            <p className="text-xs text-muted-foreground">Creator</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
