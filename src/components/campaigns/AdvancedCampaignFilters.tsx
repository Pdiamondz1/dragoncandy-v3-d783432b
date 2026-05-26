import React, { useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, MapPin, ChevronDown, X } from 'lucide-react';
import { usePostalCodeAutoFill } from '@/hooks/usePostalCodeAutoFill';

interface CampaignFilters {
  searchTerm: string;
  platforms: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  postal_code: string;
  city: string;
  country: string;
  _isLocationAutoFilled?: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface AdvancedCampaignFiltersProps {
  filters: CampaignFilters;
  onFilterChange: (key: string, value: string | string[] | boolean | number | null) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

const PLATFORM_OPTIONS = ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'LinkedIn', 'X (Twitter)'];

export const AdvancedCampaignFilters: React.FC<AdvancedCampaignFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
  totalCount,
  filteredCount,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = React.useState(false);

  const handleCityChange = useCallback((city: string) => {
    onFilterChange('city', city);
    onFilterChange('_isLocationAutoFilled', false);
  }, [onFilterChange]);

  const handleCountryChange = useCallback((country: string) => {
    onFilterChange('country', country);
    onFilterChange('_isLocationAutoFilled', false);
  }, [onFilterChange]);

  const { isLoading: isPostalLoading, error: postalError, isAutoFilled, resetAutoFillFlag } = usePostalCodeAutoFill({
    postalCode: filters.postal_code,
    onCityChange: handleCityChange,
    onCountryChange: handleCountryChange,
  });

  React.useEffect(() => {
    if (isAutoFilled) {
      onFilterChange('_isLocationAutoFilled', true);
    }
  }, [isAutoFilled, onFilterChange]);

  const handlePostalCodeChange = (value: string) => {
    onFilterChange('postal_code', value);
    if (!value) {
      onFilterChange('_isLocationAutoFilled', false);
      resetAutoFillFlag();
    }
  };

  const togglePlatform = (platform: string) => {
    const newPlatforms = filters.platforms.includes(platform)
      ? filters.platforms.filter(p => p !== platform)
      : [...filters.platforms, platform];
    onFilterChange('platforms', newPlatforms);
  };

  const hasActiveFilters = 
    filters.searchTerm || 
    filters.platforms.length > 0 || 
    filters.budgetMin !== null || 
    filters.budgetMax !== null || 
    filters.postal_code || 
    filters.city || 
    filters.country;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Filters</h3>
          {(filteredCount > 0 || totalCount > 0) && (
            <p className="text-sm text-muted-foreground mt-1">
              {filteredCount} of {totalCount} campaigns
            </p>
          )}
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="h-4 w-4 mr-1" aria-hidden="true" />
            Clear
          </Button>
        )}
      </div>

      {/* Location Section - Always Visible */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Location
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postal/Zip Code</Label>
            <div className="relative">
              <Input
                id="postal_code"
                placeholder="Enter postal code"
                value={filters.postal_code}
                onChange={(e) => handlePostalCodeChange(e.target.value)}
              />
              {isPostalLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            {postalError && (
              <p className="text-xs text-destructive">{postalError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              placeholder="Enter city"
              value={filters.city}
              onChange={(e) => {
                onFilterChange('city', e.target.value);
                onFilterChange('_isLocationAutoFilled', false);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              placeholder="Enter country"
              value={filters.country}
              onChange={(e) => {
                onFilterChange('country', e.target.value);
                onFilterChange('_isLocationAutoFilled', false);
              }}
            />
          </div>
        </div>
      </div>

      {/* Collapsible Advanced Filters */}
      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            Advanced Filters
            <ChevronDown className={`h-4 w-4 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-4 pt-4">
          {/* Search */}
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="search"
                placeholder="Search campaigns…"
                value={filters.searchTerm}
                onChange={(e) => onFilterChange('searchTerm', e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Platforms */}
          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((platform) => (
                <Badge
                  key={platform}
                  variant={filters.platforms.includes(platform) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => togglePlatform(platform)}
                >
                  {platform}
                </Badge>
              ))}
            </div>
          </div>

          {/* Budget Range */}
          <div className="space-y-2">
            <Label>Budget Range</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.budgetMin ?? ''}
                onChange={(e) => onFilterChange('budgetMin', e.target.value ? parseFloat(e.target.value) : null)}
              />
              <Input
                type="number"
                placeholder="Max"
                value={filters.budgetMax ?? ''}
                onChange={(e) => onFilterChange('budgetMax', e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
          </div>

          {/* Sort Options */}
          <div className="space-y-2">
            <Label>Sort By</Label>
            <Select
              value={filters.sortBy}
              onValueChange={(value) => onFilterChange('sortBy', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date Created</SelectItem>
                <SelectItem value="budget_max">Budget</SelectItem>
                <SelectItem value="deadline">Deadline</SelectItem>
                <SelectItem value="application_count">Applications</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sort Order</Label>
            <Select
              value={filters.sortOrder}
              onValueChange={(value: 'asc' | 'desc') => onFilterChange('sortOrder', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

