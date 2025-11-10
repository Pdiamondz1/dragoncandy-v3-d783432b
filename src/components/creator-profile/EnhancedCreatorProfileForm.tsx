
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface EnhancedCreatorProfileFormProps {
  formData: {
    creator_name: string;
    bio: string;
    location: string;
    city: string;
    country: string;
    postal_code: string;
    availability: string;
    base_rate_per_hour: string;
    years_of_experience: string;
    languages_spoken: string;
    timezone: string;
    response_time: string;
    min_project_budget: string;
    max_projects_per_month: string;
    preferred_project_duration: string;
    collaboration_preferences: string;
    profile_visibility: string;
    allow_portfolio_in_feed: boolean;
  };
  onInputChange: (field: string, value: string | boolean) => void;
}

export const EnhancedCreatorProfileForm = ({ formData, onInputChange }: EnhancedCreatorProfileFormProps) => {
  return (
    <>
      {/* Basic Creator Information */}
      <div>
        <Label htmlFor="creator_name">Creator Name *</Label>
        <Input
          id="creator_name"
          value={formData.creator_name}
          onChange={(e) => onInputChange('creator_name', e.target.value)}
          placeholder="Your creative name or real name"
          required
        />
      </div>

      {/* Bio */}
      <div>
        <Label htmlFor="bio">Bio *</Label>
        <Textarea
          id="bio"
          value={formData.bio}
          onChange={(e) => onInputChange('bio', e.target.value)}
          placeholder="Tell brands about yourself, your experience, and what makes you unique..."
          rows={4}
          required
        />
      </div>

      {/* Experience & Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="years_of_experience">Years of Experience</Label>
          <Select value={formData.years_of_experience} onValueChange={(value) => onInputChange('years_of_experience', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select experience level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Just starting out</SelectItem>
              <SelectItem value="1">1 year</SelectItem>
              <SelectItem value="2">2 years</SelectItem>
              <SelectItem value="3">3 years</SelectItem>
              <SelectItem value="4">4 years</SelectItem>
              <SelectItem value="5">5 years</SelectItem>
              <SelectItem value="6-10">6-10 years</SelectItem>
              <SelectItem value="10+">10+ years</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="response_time">Typical Response Time</Label>
          <Select value={formData.response_time} onValueChange={(value) => onInputChange('response_time', value)}>
            <SelectTrigger>
              <SelectValue placeholder="How quickly do you respond?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="within-1-hour">Within 1 hour</SelectItem>
              <SelectItem value="within-2-hours">Within 2 hours</SelectItem>
              <SelectItem value="within-4-hours">Within 4 hours</SelectItem>
              <SelectItem value="same-day">Same day</SelectItem>
              <SelectItem value="within-24-hours">Within 24 hours</SelectItem>
              <SelectItem value="within-48-hours">Within 48 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Languages */}
      <div>
        <Label htmlFor="languages_spoken">Languages Spoken</Label>
        <Input
          id="languages_spoken"
          value={formData.languages_spoken}
          onChange={(e) => onInputChange('languages_spoken', e.target.value)}
          placeholder="e.g., English, Spanish, French (comma-separated)"
        />
      </div>

      {/* Location - Structured International Format */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Location</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="postal_code">Postal/Zip Code</Label>
            <Input
              id="postal_code"
              value={formData.postal_code}
              onChange={(e) => onInputChange('postal_code', e.target.value)}
              placeholder="e.g., 10001, SW1A 1AA"
            />
          </div>
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => onInputChange('city', e.target.value)}
              placeholder="e.g., New York, London"
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => onInputChange('country', e.target.value)}
              placeholder="e.g., United States, United Kingdom"
            />
          </div>
        </div>
        
        {/* Legacy location field - hidden but kept for backward compatibility */}
        <input
          type="hidden"
          id="location"
          value={formData.location}
        />
        
        <p className="text-xs text-muted-foreground">
          💡 Your location helps brands find creators in their target area
        </p>
      </div>

      {/* Timezone */}
      <div>
        <Label htmlFor="timezone">Timezone</Label>
        <Select value={formData.timezone} onValueChange={(value) => onInputChange('timezone', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UTC-12">UTC-12 (Baker Island)</SelectItem>
            <SelectItem value="UTC-11">UTC-11 (Hawaii)</SelectItem>
            <SelectItem value="UTC-10">UTC-10 (Alaska)</SelectItem>
            <SelectItem value="UTC-9">UTC-9 (Pacific)</SelectItem>
            <SelectItem value="UTC-8">UTC-8 (PST)</SelectItem>
            <SelectItem value="UTC-7">UTC-7 (MST)</SelectItem>
            <SelectItem value="UTC-6">UTC-6 (CST)</SelectItem>
            <SelectItem value="UTC-5">UTC-5 (EST)</SelectItem>
            <SelectItem value="UTC-4">UTC-4 (Atlantic)</SelectItem>
            <SelectItem value="UTC-3">UTC-3 (Argentina)</SelectItem>
            <SelectItem value="UTC-2">UTC-2 (South Georgia)</SelectItem>
            <SelectItem value="UTC-1">UTC-1 (Azores)</SelectItem>
            <SelectItem value="UTC+0">UTC+0 (GMT/London)</SelectItem>
            <SelectItem value="UTC+1">UTC+1 (Central European)</SelectItem>
            <SelectItem value="UTC+2">UTC+2 (Eastern European)</SelectItem>
            <SelectItem value="UTC+3">UTC+3 (Moscow)</SelectItem>
            <SelectItem value="UTC+4">UTC+4 (Gulf)</SelectItem>
            <SelectItem value="UTC+5">UTC+5 (Pakistan)</SelectItem>
            <SelectItem value="UTC+6">UTC+6 (Bangladesh)</SelectItem>
            <SelectItem value="UTC+7">UTC+7 (Thailand)</SelectItem>
            <SelectItem value="UTC+8">UTC+8 (China/Singapore)</SelectItem>
            <SelectItem value="UTC+9">UTC+9 (Japan/Korea)</SelectItem>
            <SelectItem value="UTC+10">UTC+10 (Australia East)</SelectItem>
            <SelectItem value="UTC+11">UTC+11 (Solomon Islands)</SelectItem>
            <SelectItem value="UTC+12">UTC+12 (New Zealand)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Rates & Budget */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="base_rate_per_hour">Base Rate ($/hour)</Label>
          <Input
            id="base_rate_per_hour"
            type="number"
            value={formData.base_rate_per_hour}
            onChange={(e) => onInputChange('base_rate_per_hour', e.target.value)}
            placeholder="50"
          />
        </div>
        <div>
          <Label htmlFor="min_project_budget">Minimum Project Budget ($)</Label>
          <Input
            id="min_project_budget"
            type="number"
            value={formData.min_project_budget}
            onChange={(e) => onInputChange('min_project_budget', e.target.value)}
            placeholder="500"
          />
        </div>
      </div>

      {/* Project Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="max_projects_per_month">Max Projects per Month</Label>
          <Select value={formData.max_projects_per_month} onValueChange={(value) => onInputChange('max_projects_per_month', value)}>
            <SelectTrigger>
              <SelectValue placeholder="How many projects?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 project</SelectItem>
              <SelectItem value="2">2 projects</SelectItem>
              <SelectItem value="3">3 projects</SelectItem>
              <SelectItem value="4">4 projects</SelectItem>
              <SelectItem value="5">5 projects</SelectItem>
              <SelectItem value="6+">6+ projects</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="preferred_project_duration">Preferred Project Duration</Label>
          <Select value={formData.preferred_project_duration} onValueChange={(value) => onInputChange('preferred_project_duration', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Project length preference" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-week">1 week or less</SelectItem>
              <SelectItem value="1-2-weeks">1-2 weeks</SelectItem>
              <SelectItem value="2-4-weeks">2-4 weeks</SelectItem>
              <SelectItem value="1-2-months">1-2 months</SelectItem>
              <SelectItem value="2-3-months">2-3 months</SelectItem>
              <SelectItem value="3-months+">3+ months</SelectItem>
              <SelectItem value="ongoing">Ongoing relationships</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Availability */}
      <div>
        <Label htmlFor="availability">Availability</Label>
        <Textarea
          id="availability"
          value={formData.availability}
          onChange={(e) => onInputChange('availability', e.target.value)}
          placeholder="e.g., Available weekdays, 2-3 projects per month, etc."
          rows={2}
        />
      </div>

      {/* Collaboration Preferences */}
      <div>
        <Label htmlFor="collaboration_preferences">Collaboration Preferences</Label>
        <Textarea
          id="collaboration_preferences"
          value={formData.collaboration_preferences}
          onChange={(e) => onInputChange('collaboration_preferences', e.target.value)}
          placeholder="Describe your preferred working style, communication frequency, feedback process, etc."
          rows={3}
        />
      </div>

      {/* Profile Visibility */}
      <div>
        <Label htmlFor="profile_visibility">Profile Visibility</Label>
        <Select value={formData.profile_visibility} onValueChange={(value) => onInputChange('profile_visibility', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Who can see your profile?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public - Anyone can view</SelectItem>
            <SelectItem value="private">Private - Only you can view</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* DragonFeed Showcase */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="allow_portfolio_in_feed"
            checked={formData.allow_portfolio_in_feed}
            onChange={(e) => onInputChange('allow_portfolio_in_feed', e.target.checked)}
            className="rounded border-border focus:ring-primary focus:ring-2"
          />
          <Label htmlFor="allow_portfolio_in_feed" className="text-sm font-medium">
            Display my portfolio in DragonFeed
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Allow your portfolio content to be featured in the public showcase on our landing page. 
          This helps you gain visibility and attract potential clients.
        </p>
      </div>
    </>
  );
};
