
import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { X, MapPin, DollarSign, Star, Loader2 } from 'lucide-react';
import { geocodingService } from '@/lib/geocoding';

interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  city: string;
  country: string;
  postal_code: string;
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
  _isLocationAutoFilled?: boolean;
}

interface AdvancedCreatorFiltersProps {
  filters: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
}

const AdvancedCreatorFilters: React.FC<AdvancedCreatorFiltersProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
}) => {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const lastLookedUpPostalRef = useRef('');
  const userEditedCityRef = useRef(false);

  // Track if user manually edited city/country to prevent overwriting
  useEffect(() => {
    if (filters.city && lastLookedUpPostalRef.current === filters.postal_code) {
      userEditedCityRef.current = true;
    }
  }, [filters.city, filters.postal_code]);

  // Auto-fill city and country based on postal code
  useEffect(() => {
    const postalCode = filters.postal_code?.trim();

    // Skip if invalid, already looked up, or user manually edited
    if (!postalCode ||
        postalCode.length < 3 ||
        postalCode === lastLookedUpPostalRef.current ||
        (userEditedCityRef.current && filters.postal_code === lastLookedUpPostalRef.current)) {
      setIsLookingUp(false);
      return;
    }

    setIsLookingUp(true);

    // Debounce the lookup by 500ms
    const debounceTimer = setTimeout(async () => {
      try {
        const result = await geocodingService.lookupPostalCode(postalCode);

        if (result) {
          lastLookedUpPostalRef.current = postalCode;
          userEditedCityRef.current = false;
          // Auto-fill city and country
          onFilterChange('city', result.city);
          onFilterChange('country', result.country);
          // Mark location as auto-filled so filtering uses postal code only
          onFilterChange('_isLocationAutoFilled', true);
        }
      } catch (error) {
        console.error('Failed to lookup postal code:', error);
      } finally {
        setIsLookingUp(false);
      }
    }, 500);

    // Cleanup on unmount
    return () => clearTimeout(debounceTimer);
  }, [filters.postal_code, onFilterChange]);

  const availableSkills = [
    'Video Editing',
    'Photography',
    'Graphic Design',
    'Copywriting',
    'Social Media Management',
    'UGC Creation',
    'Animation',
    'Influencer Marketing',
    'Content Strategy',
    'Illustration'
  ];

  const availablePlatforms = [
    'Instagram',
    'TikTok',
    'YouTube',
    'Facebook',
    'LinkedIn',
    'X (Twitter)'
  ];

  const toggleSkill = (skill: string) => {
    const currentSkills = filters.skills || [];
    const updatedSkills = currentSkills.includes(skill)
      ? currentSkills.filter(s => s !== skill)
      : [...currentSkills, skill];
    onFilterChange('skills', updatedSkills);
  };

  const togglePlatform = (platform: string) => {
    const currentPlatforms = filters.platforms || [];
    const updatedPlatforms = currentPlatforms.includes(platform)
      ? currentPlatforms.filter(p => p !== platform)
      : [...currentPlatforms, platform];
    onFilterChange('platforms', updatedPlatforms);
  };

  return (
    <div className="space-y-6">
      {/* Location */}
      <div className="space-y-3">
        <Label className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="h-5 w-5" />
          Location
        </Label>

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
                // Clear auto-fill flag when postal code is cleared
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
              // Mark as user-edited so auto-fill doesn't override
              userEditedCityRef.current = true;
              // Clear auto-fill flag so city filter becomes active
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
              // Mark as user-edited so auto-fill doesn't override
              userEditedCityRef.current = true;
              // Clear auto-fill flag so country filter becomes active
              onFilterChange('_isLocationAutoFilled', false);
            }}
          />
        </div>
      </div>

      <Separator />

      {/* Skills */}
      <div>
        <Label className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4" />
          Skills & Expertise
        </Label>
        <div className="flex flex-wrap gap-2">
          {availableSkills.map(skill => (
            <Badge
              key={skill}
              variant={filters.skills?.includes(skill) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSkill(skill)}
            >
              {skill}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      {/* Platforms */}
      <div>
        <Label className="flex items-center gap-2 mb-3">
          Social Media Platforms
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

      {/* Availability */}
      <div>
        <Label htmlFor="availability">Availability</Label>
        <Select value={filters.availability || "any"} onValueChange={(value) => onFilterChange('availability', value === "any" ? "" : value)}>
          <SelectTrigger>
            <SelectValue placeholder="Any availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any availability</SelectItem>
            <SelectItem value="Available">Available</SelectItem>
            <SelectItem value="Busy">Busy</SelectItem>
            <SelectItem value="Booked">Booked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Rate Range */}
      <div>
        <Label className="flex items-center gap-2 mb-3">
          <DollarSign className="h-4 w-4" />
          Hourly Rate Range: ${filters.minRate} - ${filters.maxRate}
        </Label>
        <div className="px-2">
          <Slider
            value={[filters.minRate, filters.maxRate]}
            onValueChange={([min, max]) => {
              onFilterChange('minRate', min);
              onFilterChange('maxRate', max);
            }}
            max={500}
            min={0}
            step={10}
            className="w-full"
          />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground mt-1">
          <span>$0</span>
          <span>$500+</span>
        </div>
      </div>

      <Separator />

      {/* Experience Level */}
      <div>
        <Label htmlFor="experience">Experience Level</Label>
        <Select value={filters.experienceLevel || "any"} onValueChange={(value) => onFilterChange('experienceLevel', value === "any" ? "" : value)}>
          <SelectTrigger>
            <SelectValue placeholder="Any experience level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any experience level</SelectItem>
            <SelectItem value="beginner">Beginner (0-1 years)</SelectItem>
            <SelectItem value="intermediate">Intermediate (2-4 years)</SelectItem>
            <SelectItem value="expert">Expert (5+ years)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Reset All Filters */}
      <Button variant="outline" className="w-full" onClick={onResetFilters}>
        <X className="h-4 w-4 mr-2" />
        Reset All Filters
      </Button>
    </div>
  );
};

export default AdvancedCreatorFilters;
