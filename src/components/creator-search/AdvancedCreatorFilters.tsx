
import React from 'react';
import { SKILL_OPTIONS } from '@/lib/skillUtils';
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
import { X, DollarSign, Star } from 'lucide-react';

interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
}

interface AdvancedCreatorFiltersProps {
  filters: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: string | string[] | number) => void;
  onResetFilters: () => void;
}

export const AdvancedCreatorFilters: React.FC<AdvancedCreatorFiltersProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
}) => {
  const availableSkills = SKILL_OPTIONS.filter(s => s.value !== 'other');

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
      {/* Skills */}
      <div>
        <Label className="flex items-center gap-2 mb-3">
          <Star className="h-4 w-4" />
          Skills & Expertise
        </Label>
        <div className="flex flex-wrap gap-2">
          {availableSkills.map(({ value, label }) => (
            <Badge
              key={value}
              variant={filters.skills?.includes(value) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => toggleSkill(value)}
            >
              {label}
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

