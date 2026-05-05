import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Search } from 'lucide-react';

export interface BrandCampaignFilters {
  searchTerm: string;
  location: string;
  industry: string;
  platforms: string[];
  budgetMin: string;
  budgetMax: string;
  sortBy: 'created_at' | 'budget_min' | 'deadline';
  sortOrder: 'asc' | 'desc';
}

interface BrandCampaignFiltersProps {
  filters: BrandCampaignFilters;
  onFilterChange: (key: keyof BrandCampaignFilters, value: string | string[] | boolean) => void;
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
];

const INDUSTRY_OPTIONS = [
  'Fast Food',
  'Fine Dining',
  'Casual Dining',
  'Cafe/Coffee Shop',
  'Bar/Pub',
  'Food Truck',
  'Catering',
  'Other',
];

const BrandCampaignFilters: React.FC<BrandCampaignFiltersProps> = ({
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
    onFilterChange(
      'platforms',
      filters.platforms.filter((p) => p !== platform)
    );
  };

  return (
    <div className="border-2 border-dc-teal rounded-2xl bg-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Filter Campaigns</h2>
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      </div>

      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Search campaigns…"
            value={filters.searchTerm}
            onChange={(e) => onFilterChange('searchTerm', e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          placeholder="City, State, or Country"
          value={filters.location}
          onChange={(e) => onFilterChange('location', e.target.value)}
        />
      </div>

      {/* Industry */}
      <div className="space-y-2">
        <Label htmlFor="industry">Industry</Label>
        <Select
          value={filters.industry}
          onValueChange={(value) => onFilterChange('industry', value)}
        >
          <SelectTrigger id="industry">
            <SelectValue placeholder="Select industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {INDUSTRY_OPTIONS.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Platforms */}
      <div className="space-y-2">
        <Label>Platforms</Label>
        <Select onValueChange={addPlatform}>
          <SelectTrigger>
            <SelectValue placeholder="Select platforms" />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((platform) => (
              <SelectItem key={platform} value={platform}>
                {platform}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filters.platforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {filters.platforms.map((platform) => (
              <Badge key={platform} variant="secondary" className="gap-1">
                {platform}
                <button
                  onClick={() => removePlatform(platform)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Budget Range */}
      <div className="space-y-2">
        <Label>Budget Range</Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Input
              placeholder="Min"
              type="number"
              value={filters.budgetMin}
              onChange={(e) => onFilterChange('budgetMin', e.target.value)}
            />
          </div>
          <div>
            <Input
              placeholder="Max"
              type="number"
              value={filters.budgetMax}
              onChange={(e) => onFilterChange('budgetMax', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-2">
        <Label htmlFor="sort">Sort By</Label>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={filters.sortBy}
            onValueChange={(value) => onFilterChange('sortBy', value)}
          >
            <SelectTrigger id="sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Date Posted</SelectItem>
              <SelectItem value="budget_min">Budget</SelectItem>
              <SelectItem value="deadline">Deadline</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.sortOrder}
            onValueChange={(value) => onFilterChange('sortOrder', value)}
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
      </div>

      {/* Results Count */}
      <div className="pt-4 border-t text-sm text-muted-foreground">
        Showing {filteredCount} of {totalCount} campaigns
      </div>
    </div>
  );
};

export default BrandCampaignFilters;
