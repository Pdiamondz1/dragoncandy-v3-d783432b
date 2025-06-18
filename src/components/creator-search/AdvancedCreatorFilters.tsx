
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Search, Filter, X, MapPin, DollarSign, Star } from 'lucide-react';

interface CreatorFilters {
  searchTerm: string;
  skills: string[];
  location: string;
  minRate: number;
  maxRate: number;
  platforms: string[];
  availability: string;
  experienceLevel: string;
}

interface AdvancedCreatorFiltersProps {
  filters: CreatorFilters;
  onFilterChange: (key: keyof CreatorFilters, value: any) => void;
  onResetFilters: () => void;
  resultCount: number;
}

const AdvancedCreatorFilters: React.FC<AdvancedCreatorFiltersProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  resultCount,
}) => {
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Advanced Filters
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{resultCount} creators found</span>
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              <X className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search */}
        <div>
          <Label htmlFor="search">Search Creators</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="search"
              placeholder="Search by name, bio, or skills..."
              value={filters.searchTerm}
              onChange={(e) => onFilterChange('searchTerm', e.target.value)}
              className="pl-10"
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
            <Search className="h-4 w-4" />
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

        {/* Location and Availability */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="location" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Location
            </Label>
            <Input
              id="location"
              placeholder="City, State, or Country"
              value={filters.location}
              onChange={(e) => onFilterChange('location', e.target.value)}
            />
          </div>

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
          <div className="flex justify-between text-sm text-gray-500 mt-1">
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
      </CardContent>
    </Card>
  );
};

export default AdvancedCreatorFilters;
