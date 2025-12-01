
import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { usePostalCodeAutoFill } from '@/hooks/usePostalCodeAutoFill';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

interface BusinessProfileFormProps {
  formData: {
    business_name: string;
    industry: IndustryType | '';
    website_url: string;
    location: string;
    postal_code: string;
    city: string;
    country: string;
    description: string;
  };
  onInputChange: (field: string, value: string) => void;
}

export const BusinessProfileForm = ({ formData, onInputChange }: BusinessProfileFormProps) => {
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
      {/* Business Name */}
      <div>
        <Label htmlFor="business_name">Business Name *</Label>
        <Input
          id="business_name"
          value={formData.business_name}
          onChange={(e) => onInputChange('business_name', e.target.value)}
          placeholder="Your Business Name"
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

      {/* Website */}
      <div>
        <Label htmlFor="website_url">Website URL</Label>
        <Input
          id="website_url"
          value={formData.website_url}
          onChange={(e) => onInputChange('website_url', e.target.value)}
          placeholder="https://yourwebsite.com"
        />
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
          💡 Your location helps creators find you
        </p>
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Company Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => onInputChange('description', e.target.value)}
          placeholder="Tell us about your business..."
          rows={4}
        />
      </div>
    </>
  );
};
