import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Building2, MapPin, Star, ExternalLink, Globe, Instagram } from 'lucide-react';
import { RestaurantProfile } from '@/hooks/useRestaurantProfile';
import { Skeleton } from '@/components/ui/skeleton';
import { safeUrl } from '@/lib/safeUrl';

interface RestaurantProfileCardProps {
  restaurant: RestaurantProfile | null;
  isLoading: boolean;
}

export const RestaurantProfileCard = ({ restaurant, isLoading }: RestaurantProfileCardProps) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!restaurant) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Restaurant Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Restaurant profile not available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Restaurant Partner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={restaurant.logo_url || undefined} alt={restaurant.business_name} />
            <AvatarFallback>{restaurant.business_name.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-2">
            <div>
              <h3 className="font-semibold text-lg">{restaurant.business_name}</h3>
              {restaurant.location && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {restaurant.location}
                </p>
              )}
            </div>

            {restaurant.average_rating !== null && restaurant.total_reviews !== null && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-medium">{restaurant.average_rating.toFixed(1)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  ({restaurant.total_reviews} {restaurant.total_reviews === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            )}
          </div>
        </div>

        {restaurant.description && (
          <p className="text-sm text-muted-foreground">{restaurant.description}</p>
        )}

        <div className="flex gap-2">
          {restaurant.website_url && safeUrl(restaurant.website_url) && (
            <Button variant="outline" size="sm" asChild>
              <a href={safeUrl(restaurant.website_url)} target="_blank" rel="noopener noreferrer">
                <Globe className="h-4 w-4 mr-2" />
                Website
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          )}
          {restaurant.instagram_url && safeUrl(restaurant.instagram_url) && (
            <Button variant="outline" size="sm" asChild>
              <a href={safeUrl(restaurant.instagram_url)} target="_blank" rel="noopener noreferrer">
                <Instagram className="h-4 w-4 mr-2" />
                Instagram
                <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          )}
          {restaurant.profile_slug && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/business/${restaurant.profile_slug}`} target="_blank" rel="noopener noreferrer">
                View Full Profile
                <ExternalLink className="h-3 w-3 ml-2" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
