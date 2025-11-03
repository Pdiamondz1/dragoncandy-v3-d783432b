import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useBusinessActivity } from '@/hooks/useBusinessActivity';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart, Play, User, Loader2 } from 'lucide-react';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const BusinessActivity = () => {
  const { likedItems, loading, error } = useBusinessActivity();
  const [selectedItem, setSelectedItem] = useState<FeedMediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [unlikingIds, setUnlikingIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleItemClick = (item: FeedMediaItem, index: number) => {
    setSelectedItem(item);
    setCurrentIndex(index);
  };

  const handleUnlike = async (contentId: string, creatorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setUnlikingIds(prev => new Set(prev).add(contentId));
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('analytics_events').insert({
        event_type: 'dragon_feed_like',
        user_id: user.id,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        event_data: {
          content_id: contentId,
          creator_id: creatorId,
          action: 'unlike'
        }
      });

      toast({
        title: "Removed from liked",
        description: "Content removed from your activity",
      });

      // Refresh the page to update the list
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      console.error('Failed to unlike:', err);
      toast({
        title: "Error",
        description: "Failed to remove like. Please try again.",
        variant: "destructive"
      });
      setUnlikingIds(prev => {
        const next = new Set(prev);
        next.delete(contentId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-destructive">{error}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">My Activity</h1>
              <p className="text-muted-foreground mt-1">Content you've liked from creators</p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {likedItems.length} {likedItems.length === 1 ? 'item' : 'items'} liked
            </Badge>
          </div>
        </div>

        {/* Content Grid */}
        {likedItems.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No liked content yet</h3>
            <p className="text-muted-foreground mb-6">Start exploring the Dragon Feed and like content you love!</p>
            <Button onClick={() => navigate('/dashboard/business/dragon-feed')}>
              Explore Dragon Feed
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {likedItems.map((item, index) => (
              <Card 
                key={item.id} 
                className="group overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer"
                onClick={() => handleItemClick(item, index)}
              >
                <div className="relative aspect-square overflow-hidden bg-muted">
                  {item.type === 'video' ? (
                    <>
                      <video
                        src={item.url}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        muted
                        playsInline
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="bg-white/90 rounded-full p-3 shadow-lg">
                          <Play className="h-6 w-6 text-primary fill-current" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt={`Content by ${item.creatorName}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                  )}
                  
                  {/* Type badge */}
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs bg-black/70 text-white border-0">
                      {item.type === 'video' ? 'Video' : 'Photo'}
                    </Badge>
                  </div>

                  {/* Unlike button */}
                  <div className="absolute top-2 right-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 w-8 p-0 bg-white/90 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleUnlike(item.id, item.creatorId, e)}
                      disabled={unlikingIds.has(item.id)}
                    >
                      {unlikingIds.has(item.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>

                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/creator/${item.creatorSlug}`);
                        }}
                        className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors text-left w-full"
                      >
                        {item.creatorName}
                      </button>
                      <p className="text-xs text-muted-foreground">Creator</p>
                    </div>
                  </div>
                  {item.submittedAt && (
                    <p className="text-xs text-muted-foreground">
                      Liked {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedItem && (
        <FeedLightbox
          item={selectedItem}
          allItems={likedItems}
          currentIndex={currentIndex}
          onClose={() => setSelectedItem(null)}
          onNavigate={setCurrentIndex}
        />
      )}
    </DashboardLayout>
  );
};

export default BusinessActivity;
