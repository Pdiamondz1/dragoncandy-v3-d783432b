
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Database } from '@/integrations/supabase/types';

type IndustryType = Database['public']['Enums']['industry_type'];

interface BusinessProfileFormProps {
  formData: {
    business_name: string;
    industry: IndustryType | '';
    website_url: string;
    location: string;
    description: string;
  };
  onInputChange: (field: string, value: string) => void;
}

export const BusinessProfileForm = ({ formData, onInputChange }: BusinessProfileFormProps) => {
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

      {/* Website & Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="website_url">Website URL</Label>
          <Input
            id="website_url"
            value={formData.website_url}
            onChange={(e) => onInputChange('website_url', e.target.value)}
            placeholder="https://yourwebsite.com"
          />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => onInputChange('location', e.target.value)}
            placeholder="City, Country"
          />
        </div>
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
