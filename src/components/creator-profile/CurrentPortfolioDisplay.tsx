import { useState, useEffect } from 'react';
import { X, Play, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

// URL cache for both public and signed URLs
const urlCache = new Map<string, { url: string; expiresAt: number }>();

const getSignedUrl = async (path: string): Promise<string | null> => {
  // If it's already an HTTP URL, return as-is
  if (path.startsWith('http')) {
    return path;
  }

  // Check cache first
  const cached = urlCache.get(path);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  try {
    // Create signed URL for storage path
    const { data, error } = await supabase.storage
      .from('profile-assets')
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      return null;
    }

    // Cache signed URL for 55 minutes
    urlCache.set(path, { url: data.signedUrl, expiresAt: now + 55 * 60 * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
};

interface CurrentPortfolioDisplayProps {
  portfolioPaths: string[];
  onRemoveItem: (path: string) => void;
}

interface PortfolioItem {
  path: string;
  url: string;
  type: 'image' | 'video';
  isLoaded: boolean;
  hasError: boolean;
}

export const CurrentPortfolioDisplay = ({ portfolioPaths, onRemoveItem }: CurrentPortfolioDisplayProps) => {
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const convertPortfolioUrls = async () => {
      if (!portfolioPaths.length) {
        setPortfolioItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      
      const mediaPromises = portfolioPaths.map(async (path) => {
        const finalUrl = await getSignedUrl(path);
        
        if (!finalUrl) {
          return null;
        }
        
        const isVideo = /\.(mp4|webm|mov|avi)$/i.test(path);
        return {
          path,
          url: finalUrl,
          type: isVideo ? 'video' : 'image',
          isLoaded: false,
          hasError: false
        } as PortfolioItem;
      });

      const settled = await Promise.allSettled(mediaPromises);
      const items: PortfolioItem[] = settled
        .filter((r): r is PromiseFulfilledResult<PortfolioItem | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((v): v is PortfolioItem => !!v);

      setPortfolioItems(items);
      setLoading(false);
    };

    convertPortfolioUrls();
  }, [portfolioPaths]);

  const handleMediaLoad = (path: string) => {
    setPortfolioItems(prev => prev.map(item => 
      item.path === path ? { ...item, isLoaded: true, hasError: false } : item
    ));
  };

  const handleMediaError = (path: string) => {
    setPortfolioItems(prev => prev.map(portfolioItem => 
      portfolioItem.path === path ? { ...portfolioItem, hasError: true } : portfolioItem
    ));
  };

  const handleRemove = (path: string) => {
    onRemoveItem(path);
  };

  if (loading) {
    return (
      <div className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: Math.min(portfolioPaths.length, 4) }).map((_, index) => (
            <div key={index} className="aspect-square bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!portfolioItems.length) {
    return null;
  }

  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-foreground mb-3">Current Portfolio Items</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {portfolioItems.map((item) => (
          <div key={item.path} className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
            {item.hasError ? (
              // Error state
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <div className="text-center">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <span className="text-xs text-muted-foreground">Media unavailable</span>
                </div>
              </div>
            ) : item.type === 'image' ? (
              <img
                src={item.url}
                alt="Portfolio item"
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
                onLoad={() => handleMediaLoad(item.path)}
                onError={() => handleMediaError(item.path)}
              />
            ) : (
              <div className="relative w-full h-full">
                <video
                  src={item.url}
                  aria-label="Portfolio video"
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedData={() => handleMediaLoad(item.path)}
                  onError={() => handleMediaError(item.path)}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="w-8 h-8 text-white" />
                </div>
              </div>
            )}
            
            {/* Media type indicator */}
            <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
              {item.type === 'image' ? (
                <ImageIcon className="w-3 h-3 text-white" />
              ) : (
                <Play className="w-3 h-3 text-white" />
              )}
            </div>
            
            {/* Remove button */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="destructive"
                size="sm"
                className="w-8 h-8 p-0 rounded-full"
                onClick={() => handleRemove(item.path)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        {portfolioItems.length} item{portfolioItems.length !== 1 ? 's' : ''} in portfolio
      </p>
    </div>
  );
};