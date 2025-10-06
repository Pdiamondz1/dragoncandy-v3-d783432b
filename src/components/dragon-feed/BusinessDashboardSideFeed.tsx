import React, { useEffect, useRef, useState } from 'react';
import { useBusinessDragonFeed, FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageSquare, Loader2 } from 'lucide-react';

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
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!loading && feedItems.length > 0 && onFeedItemsLoaded) {
      onFeedItemsLoaded(feedItems);
    }
  }, [feedItems, loading, onFeedItemsLoaded]);

  // Auto-scroll animation
  useEffect(() => {
    const container = containerRef.current;
    if (!container || feedItems.length === 0 || isPaused) return;

    let animationFrameId: number;
    const scrollSpeed = 1; // pixels per frame

    const animate = () => {
      if (container) {
        container.scrollTop += scrollSpeed;

        // Reset scroll position for seamless loop
        const maxScroll = container.scrollHeight / 3; // We duplicate items 3x
        if (container.scrollTop >= maxScroll) {
          container.scrollTop = 0;
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [feedItems, isPaused]);

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

  // Duplicate items 3x for seamless looping
  const loopedItems = [...feedItems, ...feedItems, ...feedItems];

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Dragon Feed</h2>
        <p className="text-xs text-muted-foreground">Latest creator content</p>
      </div>
      
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="p-3 space-y-3">
          {loopedItems.map((item, index) => (
            <Card
              key={`${item.id}-${index}`}
              className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300"
              onClick={() => onItemClick(item, index % feedItems.length)}
            >
              <div className="relative aspect-square overflow-hidden">
                {item.type === 'video' ? (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={item.url}
                    alt={`Content by ${item.creatorName}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Type badge */}
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-xs bg-black/70 text-white border-0">
                    {item.type === 'video' ? '🎥' : '📷'}
                  </Badge>
                </div>
                
                {/* Action buttons */}
                <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="h-7 w-7 flex items-center justify-center rounded-full bg-white/90">
                    <Heart className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="h-7 w-7 flex items-center justify-center rounded-full bg-white/90">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                
                {/* Creator name */}
                <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <p className="text-xs font-medium text-white drop-shadow-lg">
                    {item.creatorName}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
