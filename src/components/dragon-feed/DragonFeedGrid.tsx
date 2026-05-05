import React, { useState } from 'react';
import { useUniqueCreatorPortfolio } from '@/hooks/useUniqueCreatorPortfolio';
import { DragonFeedCard } from './DragonFeedCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const DragonFeedGrid: React.FC = () => {
  const { portfolioMedia, loading, error } = useUniqueCreatorPortfolio();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredMedia = portfolioMedia.filter((item) => {
    const matchesSearch = item.creatorName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="h-10 bg-muted rounded-md flex-1 animate-pulse" />
          <div className="h-10 bg-muted rounded-md w-32 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
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

          {(searchTerm || typeFilter !== 'all') && (
            <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Active Filters */}
        {(searchTerm || typeFilter !== 'all') && (
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
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredMedia.length} {filteredMedia.length === 1 ? 'item' : 'items'} found
        </p>
      </div>

      {/* Media Grid */}
      {filteredMedia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No content found</h3>
            <p className="text-muted-foreground text-center">
              Try adjusting your search criteria or filters to find more content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredMedia.map((media) => (
            <DragonFeedCard key={media.id} media={media} />
          ))}
        </div>
      )}
    </div>
  );
};