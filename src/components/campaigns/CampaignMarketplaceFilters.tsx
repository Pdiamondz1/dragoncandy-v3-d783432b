
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, X, MapPin, DollarSign } from 'lucide-react';

export interface CampaignMarketplaceFilters {
  searchTerm: string;
  platforms: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  location: string;
  sortBy: 'created_at' | 'budget_max' | 'deadline' | 'application_count';
  sortOrder: 'asc' | 'desc';
}

interface CampaignMarketplaceFiltersProps {
  filters: CampaignMarketplaceFilters;
  onFilterChange: (key: keyof CampaignMarketplaceFilters, value: string | string[] | boolean | number | null) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

const PLATFORM_OPTIONS = [
  'Instagram',
  'TikTok',
  'YouTube',
  'Facebook',
  'LinkedIn',
  'X (Twitter)',
  'Website',
  'Blog',
];

const CampaignMarketplaceFilters: React.FC<CampaignMarketplaceFiltersProps> = ({
  filters,
  onFilterChange,
  onReset,
  totalCount,
  filteredCount,
}) => {
  const addPlatform = (platform: string) => {
    if (!filters.platforms.includes(platform)) {
      onFilterChange('platforms', [...filters.platforms, platform]);
    }
  };

  const removePlatform = (platform: string) => {
    onFilterChange('platforms', filters.platforms.filter(p => p !== platform));
  };

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {filteredCount} of {totalCount} campaigns
          </span>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="h-4 w-4 mr-1" aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-2">
          <Label htmlFor="search">Search Campaigns</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="search"
              placeholder="Search by title, description…"
              value={filters.searchTerm}
              onChange={(e) => onFilterChange('searchTerm', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="location"
              placeholder="Any location"
              value={filters.location}
              onChange={(e) => onFilterChange('location', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="sortBy">Sort By</Label>
          <Select value={filters.sortBy} onValueChange={(value) => onFilterChange('sortBy', value)}>
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
          <Select value={filters.sortOrder} onValueChange={(value) => onFilterChange('sortOrder', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Newest First</SelectItem>
              <SelectItem value="asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {filters.platforms.map((platform) => (
            <Badge key={platform} variant="default" className="cursor-pointer">
              {platform}
              <X 
                className="ml-1 h-3 w-3" 
                onClick={() => removePlatform(platform)}
              />
            </Badge>
          ))}
        </div>
        <Select onValueChange={addPlatform}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Add platform filter" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.filter(p => !filters.platforms.includes(p)).map((platform) => (
              <SelectItem key={platform} value={platform}>
                {platform}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="budgetMin">Min Budget</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="budgetMin"
              type="number"
              placeholder="0"
              value={filters.budgetMin || ''}
              onChange={(e) => onFilterChange('budgetMin', e.target.value ? Number(e.target.value) : null)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="budgetMax">Max Budget</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              id="budgetMax"
              type="number"
              placeholder="Any"
              value={filters.budgetMax || ''}
              onChange={(e) => onFilterChange('budgetMax', e.target.value ? Number(e.target.value) : null)}
              className="pl-10"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignMarketplaceFilters;
