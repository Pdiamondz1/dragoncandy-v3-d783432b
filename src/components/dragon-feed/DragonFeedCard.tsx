import React, { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Play, Pause, Heart, MessageSquare, User } from 'lucide-react';

interface PortfolioMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  creatorName: string;
}

interface DragonFeedCardProps {
  media: PortfolioMedia;
}

export const DragonFeedCard: React.FC<DragonFeedCardProps> = ({ media }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [liked, setLiked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleLoad = () => setLoaded(true);
  const handleError = () => setError(true);
  const toggleLike = () => setLiked(!liked);

  const toggleVideoPlayback = async () => {
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
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:scale-105">
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
            {media.type === 'video' ? (
              <video
                ref={videoRef}
                src={media.url}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 cursor-pointer"
                onLoadedData={handleLoad}
                onError={handleError}
                onClick={toggleVideoPlayback}
                muted
                loop
                playsInline
              />
            ) : (
              <img
                src={media.url}
                alt={`Content by ${media.creatorName}`}
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
        {media.type === 'video' && loaded && (
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
            {media.type === 'video' ? 'Video' : 'Photo'}
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
            <p className="font-medium text-sm text-foreground truncate">
              {media.creatorName}
            </p>
            <p className="text-xs text-muted-foreground">Creator</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};