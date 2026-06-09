// src/components/dragonshare/RestaurantBrowseDialog.tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRestaurantBrowse } from '@/hooks/useRestaurantBrowse';
import { RestaurantBrowseHeader } from '@/components/dragonshare/RestaurantBrowseHeader';
import { RestaurantCard } from '@/components/dragonshare/RestaurantCard';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreButton } from '@/components/shared/LoadMoreButton';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (restaurant: RestaurantSearchResult) => void;
}

/**
 * In-page restaurant browser. Replaces navigating to a separate page so the
 * creator never loses their in-progress upload/draft when picking a restaurant.
 */
export function RestaurantBrowseDialog({ open, onOpenChange, onSelect }: Props) {
  const { restaurants, cuisines, isLoading, filters, setSearch, setCuisine, resetFilters } =
    useRestaurantBrowse();
  const { visible, hasMore, showing, total, loadMore } = usePagedList(restaurants, 12);

  function handleSelect(restaurant: RestaurantSearchResult) {
    onSelect(restaurant);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-dc-teal font-bold">Find Restaurants</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <RestaurantBrowseHeader
            search={filters.search}
            onSearchChange={setSearch}
            cuisines={cuisines}
            activeCuisine={filters.cuisine}
            onCuisineChange={setCuisine}
            resultCount={restaurants.length}
          />

          {isLoading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-dc-teal/10" />
              ))}
            </div>
          ) : restaurants.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-dc-text-muted">
                No restaurants found matching your search.
              </p>
              <Button variant="outline" onClick={resetFilters} className="rounded-full">
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((restaurant) => (
                  <RestaurantCard
                    key={restaurant.id}
                    restaurant={restaurant}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
              <LoadMoreButton
                hasMore={hasMore}
                showing={showing}
                total={total}
                onClick={loadMore}
                noun="restaurants"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
