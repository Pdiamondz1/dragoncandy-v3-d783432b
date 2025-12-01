import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Search, Filter, X, MapPin, DollarSign, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { geocodingService } from '@/lib/geocoding';

interface CampaignFilters {
  searchTerm?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  platforms?: string[];
  budgetMin?: number | string | null;
  budgetMax?: number | string | null;
  sortBy?: string;
  sortOrder?: string;
  _isLocationAutoFilled?: boolean;
}

interface AdvancedCampaignFiltersProps {
  filters: CampaignFilters;
  onFilterChange: (key: keyof CampaignFilters, value: any) => void;
  onResetFilters: () => void;
  resultCount: number;
}

const AdvancedCampaignFilters: React.FC<AdvancedCampaignFiltersProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  resultCount,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const lastLookedUpPostalRef = useRef('');
  const userEditedCityRef = useRef(false);

  const handleFilterChange = useCallback((key: keyof CampaignFilters, value: any) => {
    onFilterChange(key, value);
  }, [onFilterChange]);

  useEffect(() => {
    if (filters.city && lastLookedUpPostalRef.current === filters.postal_code) {
      userEditedCityRef.current = true;
    }
  }, [filters.city, filters.postal_code]);

  useEffect(() => {
    const postalCode = filters.postal_code?.trim();
    
    if (!postalCode || 
        postalCode.length < 3 || 
        postalCode === lastLookedUpPostalRef.current ||
        (userEditedCityRef.current && filters.postal_code === lastLookedUpPostalRef.current)) {
      setIsLookingUp(false);
      return;
    }

    setIsLookingUp(true);

    const debounceTimer = setTimeout(async () => {
      try {
        const result = await geocodingService.lookupPostalCode(postalCode);
        
        if (result) {
          lastLookedUpPostalRef.current = postalCode;
          userEditedCityRef.current = false;
          handleFilterChange('city', result.city);
          handleFilterChange('country', result.country);
          handleFilterChange('_isLocationAutoFilled', true);
        }
      } catch (error) {
        console.error('Failed to lookup postal code:', error);
      } finally {
        setIsLookingUp(false);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [filters.postal_code, handleFilterChange]);

  const availablePlatforms = [
    'Instagram',
    'TikTok',
    'YouTube',
    'Facebook',
    'LinkedIn',
    'X (Twitter)'
  ];

  const togglePlatform = (platform: string) => {
    const currentPlatforms = filters.platforms || [];
    const updatedPlatforms = currentPlatforms.includes(platform)
      ? currentPlatforms.filter(p => p !== platform)
      : [...currentPlatforms, platform];
    onFilterChange('platforms', updatedPlatforms);
  };

  const activeAdvancedFiltersCount = [
    filters.platforms?.length > 0,
    filters.budgetMin !== null || filters.budgetMax !== null,
    filters.searchTerm,
    filters.sortBy !== 'created_at',
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Search Campaigns
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{resultCount} campaigns found</span>
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              <X className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* DEFAULT VISIBLE FILTERS - Location Only */}
        <div className="space-y-4">
          <Label className="flex items-center gap-2 text-base font-semibold">
            <MapPin className="h-5 w-5" />
            Location
          </Label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="filter-postal-code">Postal/Zip Code</Label>
              <div className="relative">
                <Input
                  id="filter-postal-code"
                  placeholder="e.g., 10001, SW1A 1AA"
                  value={filters.postal_code || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    onFilterChange('postal_code', value);
                    if (!value) {
                      onFilterChange('_isLocationAutoFilled', false);
                      lastLookedUpPostalRef.current = '';
                    }
                  }}
                />
                {isLookingUp && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="filter-city">City</Label>
              <Input
                id="filter-city"
                placeholder="e.g., New York, London"
                value={filters.city || ''}
                onChange={(e) => {
                  onFilterChange('city', e.target.value);
                  userEditedCityRef.current = true;
                  onFilterChange('_isLocationAutoFilled', false);
                }}
              />
            </div>
            <div>
              <Label htmlFor="filter-country">Country</Label>
              <Input
                id="filter-country"
                placeholder="e.g., United States, UK"
                value={filters.country || ''}
                onChange={(e) => {
                  onFilterChange('country', e.target.value);
                  userEditedCityRef.current = true;
                  onFilterChange('_isLocationAutoFilled', false);
                }}
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* COLLAPSIBLE ADVANCED FILTERS */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Advanced Filters
                {activeAdvancedFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeAdvancedFiltersCount} active
                  </Badge>
                )}
              </span>
              {isAdvancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="space-y-6 mt-6">
            {/* Search */}
            <div>
              <Label htmlFor="search">Search by Title or Description</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search campaign title or description..."
                  value={filters.searchTerm || ''}
                  onChange={(e) => onFilterChange('searchTerm', e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Separator />

            {/* Platforms */}
            <div>
              <Label className="flex items-center gap-2 mb-3">
                Platforms
              </Label>
              <div className="flex flex-wrap gap-2">
                {availablePlatforms.map(platform => (
                  <Badge
                    key={platform}
                    variant={filters.platforms?.includes(platform) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => togglePlatform(platform)}
                  >
                    {platform}
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Budget Range */}
            <div>
              <Label className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4" />
                Budget Range: ${filters.budgetMin || 0} - ${filters.budgetMax || 10000}
              </Label>
              <div className="px-2">
                <Slider
                  value={[Number(filters.budgetMin) || 0, Number(filters.budgetMax) || 10000]}
                  onValueChange={([min, max]) => {
                    onFilterChange('budgetMin', min);
                    onFilterChange('budgetMax', max);
                  }}
                  max={10000}
                  min={0}
                  step={100}
                  className="w-full"
                />
              </div>
              <div className="flex justify-between text-sm text-muted-foreground mt-1">
                <span>$0</span>
                <span>$10,000+</span>
              </div>
            </div>

            <Separator />

            {/* Sort Options */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sortBy">Sort By</Label>
                <Select 
                  value={filters.sortBy || 'created_at'} 
                  onValueChange={(value) => onFilterChange('sortBy', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Date Posted</SelectItem>
                    <SelectItem value="budget_max">Budget</SelectItem>
                    <SelectItem value="deadline">Deadline</SelectItem>
                    <SelectItem value="application_count">Applications</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sortOrder">Order</Label>
                <Select 
                  value={filters.sortOrder || 'desc'} 
                  onValueChange={(value) => onFilterChange('sortOrder', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default AdvancedCampaignFilters;
