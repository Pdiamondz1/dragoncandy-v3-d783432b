import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useBusinessActivity } from '@/hooks/useBusinessActivity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Heart, Play, User, Loader2, ChevronLeft } from 'lucide-react';
import { FeedLightbox } from '@/components/dragon-feed/FeedLightbox';
import { FeedMediaItem } from '@/hooks/useBusinessDragonFeed';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const BusinessActivity = () => {
  const { likedItems, loading, error } = useBusinessActivity();
  const [localLikedItems, setLocalLikedItems] = useState<FeedMediaItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<FeedMediaItem | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [unlikingIds, setUnlikingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (likedItems) {
      setLocalLikedItems(likedItems);
    }
  }, [likedItems]);

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

      setLocalLikedItems(prev => prev.filter(item => item.id !== contentId));

      toast({
        title: "Removed from Inspiration",
        description: "Content removed from your saved items",
      });
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
        <div className="min-h-screen bg-white overflow-x-hidden">
          <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
            <span className="h-5 w-5 bg-gray-200 rounded-full animate-pulse mr-2" />
            <span className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-8" />
          </div>
          <div className="px-4 pt-4 pb-24 flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-10 w-10 animate-spin text-dc-teal" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout userRole="business_client">
        <div className="min-h-screen bg-white overflow-x-hidden flex items-center justify-center p-4">
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center max-w-sm w-full">
            <p className="text-sm text-red-500 font-medium">{error}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        {/* Template B Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="text-dc-pink-accent text-lg mr-2 flex items-center"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 font-sans text-base font-bold text-gray-900 uppercase tracking-wide text-center">
            Inspiration
          </h1>
          <Badge variant="secondary" className="rounded-full text-xs shrink-0">
            {localLikedItems.length} saved
          </Badge>
        </div>

        {/* Body */}
        <div className="px-4 pt-4 pb-24">
          {localLikedItems.length === 0 ? (
            <div className="border-2 border-dc-teal rounded-2xl p-10 text-center">
              <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3 opacity-50" />
              <h3 className="font-bold text-gray-900 mb-1">No liked content yet</h3>
              <p className="text-sm text-gray-500 mb-4">
                Start exploring the Dragon Feed and like content you love!
              </p>
              <Button
                onClick={() => navigate('/dashboard/business/dragon-feed')}
                className="rounded-full bg-dc-teal text-white font-bold px-6"
              >
                Explore Dragon Feed
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {localLikedItems.map((item, index) => (
                <div
                  key={item.id}
                  className="border-2 border-dc-teal rounded-2xl overflow-hidden bg-white cursor-pointer active:scale-95 transition-transform"
                  onClick={() => handleItemClick(item, index)}
                >
                  {/* Media thumbnail */}
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    {item.type === 'video' ? (
                      <>
                        <video
                          src={item.url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="bg-white/90 rounded-full p-2 shadow">
                            <Play className="h-5 w-5 text-dc-teal fill-current" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={item.url}
                        alt={`Content by ${item.creatorName}`}
                        className="w-full h-full object-cover"
                      />
                    )}

                    {/* Type badge */}
                    <div className="absolute top-2 left-2">
                      <Badge className="text-xs bg-black/60 text-white border-0 rounded-full">
                        {item.type === 'video' ? 'Video' : 'Photo'}
                      </Badge>
                    </div>

                    {/* Unlike button */}
                    <div className="absolute top-2 right-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 w-7 p-0 rounded-full bg-white/90 hover:bg-white"
                        onClick={(e) => handleUnlike(item.id, item.creatorId, e)}
                        disabled={unlikingIds.has(item.id)}
                      >
                        {unlikingIds.has(item.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                        ) : (
                          <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Creator info */}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Avatar className="h-6 w-6 ring-1 ring-dc-teal">
                        <AvatarFallback className="text-xs bg-dc-teal/10">
                          <User className="h-3 w-3 text-dc-teal" />
                        </AvatarFallback>
                      </Avatar>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/creator/${item.creatorSlug}`);
                        }}
                        className="font-bold text-xs text-gray-900 truncate hover:text-dc-teal transition-colors text-left flex-1"
                      >
                        {item.creatorName}
                      </button>
                    </div>
                    {item.submittedAt && (
                      <p className="text-xs text-gray-500">
                        {format(new Date(item.submittedAt), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {selectedItem && (
        <FeedLightbox
          item={selectedItem}
          allItems={localLikedItems}
          currentIndex={currentIndex}
          onClose={() => setSelectedItem(null)}
          onNavigate={setCurrentIndex}
        />
      )}
    </DashboardLayout>
  );
};

export default BusinessActivity;
