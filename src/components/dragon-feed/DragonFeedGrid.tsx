import React, { useState, useMemo, useEffect } from 'react';
import { useUniqueCreatorPortfolio } from '@/hooks/useUniqueCreatorPortfolio';
import { useIsMobile } from '@/hooks/use-mobile';
import { RADIUS_OPTIONS } from '@/lib/creatorLocationFilter';
import { feedCreatorsFromMedia } from '@/lib/feedCreators';
import { useFeedCreatorSearch } from '@/hooks/useFeedCreatorSearch';
import { useFeedLastVisit } from '@/hooks/useFeedLastVisit';
import { availableSkills, filterBySkill } from '@/lib/feedSkills';
import { isNewSince, countNewSince } from '@/lib/feedOrdering';
import { AppChip } from '@/components/app/AppChip';
import { FeedTile } from './FeedTile';
import { FeedPost } from './FeedPost';
import { FeedViewer } from './FeedViewer';
import { FeedCreatorList } from './FeedCreatorList';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface DragonFeedGridProps {
  /** Business feed only — passed straight to FeedCreatorList's "Browse all creators →" link. */
  browseAllHref?: string;
}

export const DragonFeedGrid: React.FC<DragonFeedGridProps> = ({ browseAllHref }) => {
  const { portfolioMedia, loading, error } = useUniqueCreatorPortfolio();
  const isMobile = useIsMobile();

  // All control state is owned here; only the rendered tree branches on searchActive.
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [radiusMiles, setRadiusMiles] = useState<number | null>(25);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { lastVisit } = useFeedLastVisit();

  const feedCreators = useMemo(() => feedCreatorsFromMedia(portfolioMedia), [portfolioMedia]);
  const search = useFeedCreatorSearch(feedCreators, searchTerm, locationQuery, radiusMiles);

  const searchActive = searchTerm.trim() !== '' || locationQuery.trim() !== '';
  const locationSet = locationQuery.trim() !== '';
  const anyFilter = searchActive || typeFilter !== 'all' || skillFilter !== null;

  // Chips come from the skills actually present in the feed, so none of them can match nothing.
  const skillOptions = useMemo(() => availableSkills(portfolioMedia), [portfolioMedia]);
  const newCount = useMemo(() => countNewSince(portfolioMedia, lastVisit), [portfolioMedia, lastVisit]);

  // Leave browse mode → close any open lightbox so it can't re-pop when the search later clears.
  useEffect(() => {
    if (searchActive) setViewerIndex(null);
  }, [searchActive]);

  // Browse-mode media: type + skill (a location query would be searchActive, not browse).
  // Already sorted newest-first by useUniqueCreatorPortfolio; filtering preserves that order.
  const browseMedia = useMemo(
    () =>
      filterBySkill(
        portfolioMedia.filter(item => typeFilter === 'all' || item.type === typeFilter),
        skillFilter,
      ),
    [portfolioMedia, typeFilter, skillFilter],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setSkillFilter(null);
    setLocationQuery('');
    setRadiusMiles(25);
    setViewerIndex(null);
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

  const countLine = searchActive
    ? search.status === 'resolving'
      ? 'Finding nearby creators…'
      : `${search.results.length} ${search.results.length === 1 ? 'creator' : 'creators'} found`
    : `${browseMedia.length} ${browseMedia.length === 1 ? 'item' : 'items'} found`;

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

          {!searchActive && (
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
          )}

          <div className="relative flex-1 sm:max-w-[180px]">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zip or city"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              className="pl-10"
              aria-label="Search creators by zip or city"
            />
          </div>

          <Select
            value={radiusMiles == null ? 'any' : String(radiusMiles)}
            onValueChange={(v) => setRadiusMiles(v === 'any' ? null : Number(v))}
            disabled={!locationSet}
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

        {/* Skill chips — hidden in search mode, matching how the type filter already behaves
            (search swaps the media grid for a creator list, which these don't apply to). */}
        {!searchActive && skillOptions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <AppChip active={skillFilter === null} onClick={() => setSkillFilter(null)}>
              All work
            </AppChip>
            {skillOptions.map((skill) => (
              <AppChip
                key={skill.value}
                active={skillFilter === skill.value}
                onClick={() => setSkillFilter(skillFilter === skill.value ? null : skill.value)}
              >
                {skill.label}
              </AppChip>
            ))}
          </div>
        )}

        {locationSet && search.status === 'failed' && (
          <p className="text-sm text-dc-pink-accent">Couldn't find that location — try another.</p>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{countLine}</p>
        {!searchActive && newCount > 0 && (
          <span className="rounded-full bg-dc-teal/10 px-2.5 py-0.5 text-xs font-semibold text-dc-teal-btn">
            {newCount} new since your last visit
          </span>
        )}
      </div>

      {/* Feed / Search results */}
      {searchActive ? (
        <FeedCreatorList
          creators={search.results}
          searchTerm={searchTerm}
          locationActive={search.locationActive}
          browseAllHref={browseAllHref}
        />
      ) : browseMedia.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">No content found</h3>
            <p className="text-muted-foreground text-center">
              Try adjusting your filters to find more content.
            </p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="space-y-4">
          {browseMedia.map((media, i) => (
            <FeedPost
              key={media.id}
              media={media}
              isNew={isNewSince(media, lastVisit)}
              onOpen={() => setViewerIndex(i)}
            />
          ))}
        </div>
      ) : (
        <div className="-mx-4 grid grid-cols-3 gap-0.5 lg:mx-0 lg:grid-cols-4 lg:gap-1 xl:grid-cols-5">
          {browseMedia.map((media, i) => (
            <FeedTile
              key={media.id}
              media={media}
              isNew={isNewSince(media, lastVisit)}
              onOpen={() => setViewerIndex(i)}
            />
          ))}
        </div>
      )}

      {!searchActive && viewerIndex !== null && browseMedia[viewerIndex] && (
        <FeedViewer
          items={browseMedia}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
};
