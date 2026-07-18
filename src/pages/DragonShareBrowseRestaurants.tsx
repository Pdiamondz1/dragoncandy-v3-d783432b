// src/pages/DragonShareBrowseRestaurants.tsx
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { useRestaurantBrowse } from '@/hooks/useRestaurantBrowse';
import { RestaurantBrowseHeader } from '@/components/dragonshare/RestaurantBrowseHeader';
import { RestaurantCard } from '@/components/dragonshare/RestaurantCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { usePagedList } from '@/hooks/usePagedList';
import { LoadMoreButton } from '@/components/shared/LoadMoreButton';
import { PageBody } from '@/components/app/PageBody';

const DragonShareBrowseRestaurants: React.FC = () => {
  const navigate = useNavigate();
  const { restaurants, cuisines, isLoading, filters, setSearch, setCuisine, resetFilters } =
    useRestaurantBrowse();
  const { visible, hasMore, showing, total, loadMore } = usePagedList(restaurants, 12);

  function handleSelect(restaurant: RestaurantSearchResult) {
    navigate(`/dashboard/creator/dragonshare?restaurant=${restaurant.id}`);
  }

  return (
    <DashboardLayout userRole="content_creator">
      <PrerequisiteGate feature="use DragonShare">
        <PageBody className="space-y-5 pt-4">
          {/* Back link + page header */}
          <div>
            <button
              onClick={() => navigate('/dashboard/creator/dragonshare')}
              className="flex items-center gap-2 text-sm font-medium text-dc-teal hover:text-dc-teal-dark transition-colors mb-3"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to DragonShare
            </button>
            <h1 className="text-2xl font-bold tracking-tight">Find Restaurants</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse restaurants near you to tag in your content
            </p>
          </div>

          {/* Search + filters */}
          <RestaurantBrowseHeader
            search={filters.search}
            onSearchChange={setSearch}
            cuisines={cuisines}
            activeCuisine={filters.cuisine}
            onCuisineChange={setCuisine}
            resultCount={restaurants.length}
          />

          {/* Restaurant grid */}
          {isLoading ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl bg-dc-teal/10" />
              ))}
            </div>
          ) : restaurants.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-dc-text-muted">
                No restaurants found matching your search.
              </p>
              <Button
                variant="outline"
                onClick={resetFilters}
                className="rounded-full"
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
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
        </PageBody>
      </PrerequisiteGate>
    </DashboardLayout>
  );
};

export default DragonShareBrowseRestaurants;
