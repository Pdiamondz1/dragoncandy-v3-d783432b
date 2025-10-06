import React, { useEffect } from 'react';
import { useBusinessDragonFeed, FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageSquare, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BusinessDashboardSideFeedProps {
  onItemClick: (item: FeedMediaItem, index: number) => void;
  onFeedItemsLoaded?: (items: FeedMediaItem[]) => void;
}

export const BusinessDashboardSideFeed: React.FC<BusinessDashboardSideFeedProps> = ({ 
  onItemClick, 
  onFeedItemsLoaded 
}) => {
  const { feedItems, loading, error } = useBusinessDragonFeed();

  useEffect(() => {
    if (!loading && feedItems.length > 0 && onFeedItemsLoaded) {
      onFeedItemsLoaded(feedItems);
    }
  }, [feedItems, loading, onFeedItemsLoaded]);

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

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Dragon Feed</h2>
        <p className="text-xs text-muted-foreground">Latest creator content</p>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {feedItems.map((item, index) => (
            <Card
              key={item.id}
              className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300"
              onClick={() => onItemClick(item, index)}
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
      </ScrollArea>
    </div>
  );
};
