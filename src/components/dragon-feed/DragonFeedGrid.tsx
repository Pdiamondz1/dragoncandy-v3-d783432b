import React, { useState, useMemo } from 'react';
import { useUniqueCreatorPortfolio } from '@/hooks/useUniqueCreatorPortfolio';
import { useFeedLocationFilter } from '@/hooks/useFeedLocationFilter';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS } from '@/lib/creatorLocationFilter';
import { FeedTile } from './FeedTile';
import { FeedPost } from './FeedPost';
import { FeedViewer } from './FeedViewer';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const DragonFeedGrid: React.FC = () => {
  const { portfolioMedia, loading, error } = useUniqueCreatorPortfolio();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();

  // Stage 1: name + type filter (existing behavior).
  const nameTypeFiltered = useMemo(
    () =>
      portfolioMedia.filter((item) => {
        const matchesSearch = item.creatorName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        return matchesSearch && matchesType;
      }),
    [portfolioMedia, searchTerm, typeFilter],
  );

  // Stage 2: zip-radius filter (new). `filteredMedia` is the final list the feed renders.
  const { zip, setZip, radiusMiles, setRadiusMiles, filteredMedia, status, active } =
    useFeedLocationFilter(nameTypeFiltered);

  const zipActive = zip.trim().length > 0;
  const anyFilter = searchTerm !== '' || typeFilter !== 'all' || zipActive;

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setZip('');
    setRadiusMiles(25);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="h-10 bg-muted rounded-md flex-1 animate-pulse" />
          <div className="h-10 bg-muted rounded-md w-32 animate-pulse" />
        </div>
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <X className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Failed to load content</h3>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search creators..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 sm:max-w-[180px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              inputMode="numeric"
              maxLength={10}
              placeholder="Zip code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="pl-10"
              aria-label="Search by zip code"
            />
          </div>

          <Select
            value={radiusMiles == null ? 'any' : String(radiusMiles)}
            onValueChange={(v) => setRadiusMiles(v === 'any' ? null : Number(v))}
            disabled={!zipActive}
          >
            <SelectTrigger className="w-full sm:w-28" aria-label="Search radius">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_OPTIONS.map((r) => (
                <SelectItem key={r} value={String(r)}>{r} mi</SelectItem>
              ))}
              <SelectItem value="any">Any</SelectItem>
            </SelectContent>
          </Select>

          {anyFilter && (
            <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {zipActive && status === 'failed' && (
          <p className="text-sm text-dc-pink-accent">Couldn't find that zip — try another.</p>
        )}

        {/* Active Filters */}
        {anyFilter && (
          <div className="flex flex-wrap gap-2">
            {searchTerm && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Search: {searchTerm}
                <button onClick={() => setSearchTerm('')} aria-label="Clear search" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {typeFilter !== 'all' && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Type: {typeFilter}
                <button onClick={() => setTypeFilter('all')} aria-label="Clear type filter" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {zipActive && (
              <Badge variant="secondary" className="flex items-center gap-1">
                Near {zip.trim()}{active ? ` · ${radiusMiles == null ? 'Any' : `${radiusMiles} mi`}` : ''}
                <button onClick={() => setZip('')} aria-label="Clear zip filter" className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredMedia.length} {filteredMedia.length === 1 ? 'item' : 'items'} found
        </p>
      </div>

      {/* Feed */}
      {filteredMedia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {zipActive && status === 'resolving' ? 'Finding nearby creators…' : 'No content found'}
            </h3>
            <p className="text-muted-foreground text-center">
              {zipActive && status === 'resolving'
                ? 'Locating creators near that zip…'
                : active
                  ? 'No creators near that zip. Try a wider radius or "Any".'
                  : 'Try adjusting your search criteria or filters to find more content.'}
            </p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-4">
          {filteredMedia.map((media, i) => (
            <FeedPost key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {filteredMedia.map((media, i) => (
            <FeedTile key={media.id} media={media} onOpen={() => setViewerIndex(i)} />
          ))}
        </div>
      )}

      {viewerIndex !== null && filteredMedia[viewerIndex] && (
        <FeedViewer
          items={filteredMedia}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};