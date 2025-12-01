import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { usePostalCodeAutoFill } from '@/hooks/usePostalCodeAutoFill';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

interface BrandEnhancedProfileFormProps {
  formData: {
    business_name: string;
    industry: IndustryType | '';
    website_url: string;
    location: string;
    postal_code: string;
    city: string;
    country: string;
    description: string;
    founded_year: string;
    budget_range: string;
    preferred_collaboration_style: string;
    timezone: string;
    profile_visibility: string;
  };
  onInputChange: (field: string, value: string) => void;
}

export const BrandEnhancedProfileForm = ({ formData, onInputChange }: BrandEnhancedProfileFormProps) => {
  const handleCityChange = useCallback((city: string) => {
    onInputChange('city', city);
  }, [onInputChange]);

  const handleCountryChange = useCallback((country: string) => {
    onInputChange('country', country);
  }, [onInputChange]);

  const { isLoading: isLookingUpPostalCode } = usePostalCodeAutoFill({
    postalCode: formData.postal_code,
    onCityChange: handleCityChange,
    onCountryChange: handleCountryChange,
  });

  return (
    <>
      {/* Basic Brand Information */}
      <div>
        <Label htmlFor="business_name">Brand Name *</Label>
        <Input
          id="business_name"
          value={formData.business_name}
          onChange={(e) => onInputChange('business_name', e.target.value)}
          placeholder="Your Brand Name"
          required
        />
      </div>

      {/* Industry */}
      <div>
        <Label htmlFor="industry">Industry *</Label>
        <Select value={formData.industry} onValueChange={(value) => onInputChange('industry', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Select your industry" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="technology">Technology</SelectItem>
            <SelectItem value="fashion">Fashion</SelectItem>
            <SelectItem value="beauty">Beauty</SelectItem>
            <SelectItem value="fitness">Fitness</SelectItem>
            <SelectItem value="food">Food</SelectItem>
            <SelectItem value="travel">Travel</SelectItem>
            <SelectItem value="lifestyle">Lifestyle</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="education">Education</SelectItem>
            <SelectItem value="entertainment">Entertainment</SelectItem>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="automotive">Automotive</SelectItem>
            <SelectItem value="real_estate">Real Estate</SelectItem>
            <SelectItem value="finance">Finance</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Founded Year & Budget Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="founded_year">Founded Year</Label>
          <Input
            id="founded_year"
            type="number"
            value={formData.founded_year}
            onChange={(e) => onInputChange('founded_year', e.target.value)}
            placeholder="2020"
            min="1900"
            max={new Date().getFullYear()}
          />
        </div>
        <div>
          <Label htmlFor="budget_range">Typical Project Budget</Label>
          <Select value={formData.budget_range} onValueChange={(value) => onInputChange('budget_range', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select budget range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="under-1k">Under $1,000</SelectItem>
              <SelectItem value="1k-5k">$1,000 - $5,000</SelectItem>
              <SelectItem value="5k-10k">$5,000 - $10,000</SelectItem>
              <SelectItem value="10k-25k">$10,000 - $25,000</SelectItem>
              <SelectItem value="25k-50k">$25,000 - $50,000</SelectItem>
              <SelectItem value="50k+">$50,000+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Location - Structured International Format */}
      <div className="space-y-4">
        <Label className="text-base font-semibold">Location</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="postal_code">Postal/Zip Code</Label>
            <div className="relative">
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => onInputChange('postal_code', e.target.value)}
                placeholder="e.g., 10001, SW1A 1AA"
              />
              {isLookingUpPostalCode && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
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
          💡 Your location helps creators and partners find you
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

      {/* Website URL */}
      <div>
        <Label htmlFor="website_url">Website URL</Label>
        <Input
          id="website_url"
          value={formData.website_url}
          onChange={(e) => onInputChange('website_url', e.target.value)}
          placeholder="https://yourwebsite.com"
        />
      </div>

      {/* Collaboration Preferences */}
      <div>
        <Label htmlFor="preferred_collaboration_style">Preferred Collaboration Style</Label>
        <Select value={formData.preferred_collaboration_style} onValueChange={(value) => onInputChange('preferred_collaboration_style', value)}>
          <SelectTrigger>
            <SelectValue placeholder="How do you prefer to work?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hands-on">Hands-on collaboration</SelectItem>
            <SelectItem value="minimal-oversight">Minimal oversight</SelectItem>
            <SelectItem value="regular-checkins">Regular check-ins</SelectItem>
            <SelectItem value="milestone-based">Milestone-based reviews</SelectItem>
            <SelectItem value="flexible">Flexible approach</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Brand Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => onInputChange('description', e.target.value)}
          placeholder="Tell us about your brand..."
          rows={4}
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
    </>
  );
};
