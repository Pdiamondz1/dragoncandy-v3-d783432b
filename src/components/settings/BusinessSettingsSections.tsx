import { Accordion } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSection } from './SettingsSection';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import { ToastConnectionCard } from '@/features/settings/ToastConnectionCard';
import type { BusinessProfileFormData } from '@/hooks/useBusinessProfileForm';
import type { CompletionResult } from '@/hooks/useProfileCompletion';

const INDUSTRY_OPTIONS = [
  { value: 'food', label: 'Food & Beverage' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'technology', label: 'Technology' },
  { value: 'travel', label: 'Travel' },
  { value: 'health', label: 'Health' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'education', label: 'Education' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'finance', label: 'Finance' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

const COLLABORATION_STYLES = [
  { value: 'hands-on', label: 'Hands-on — close collaboration' },
  { value: 'minimal-oversight', label: 'Minimal oversight — creator-led' },
  { value: 'regular-checkins', label: 'Regular check-ins' },
  { value: 'milestone-based', label: 'Milestone-based reviews' },
  { value: 'flexible', label: 'Flexible — varies by project' },
];

const BUDGET_RANGE_OPTIONS = [
  { value: 'under_1k', label: 'Under $1,000' },
  { value: '1k_5k', label: '$1,000 – $5,000' },
  { value: '5k_10k', label: '$5,000 – $10,000' },
  { value: '10k_25k', label: '$10,000 – $25,000' },
  { value: '25k_50k', label: '$25,000 – $50,000' },
  { value: '50k_plus', label: '$50,000+' },
];

interface BusinessSettingsSectionsProps {
  formData: BusinessProfileFormData;
  logoFile: File | null;
  completion: CompletionResult;
  onInputChange: (field: string, value: string) => void;
  onLogoChange: (file: File | null) => void;
  onFieldBlur: () => void;
  defaultSection?: string;
}

export function BusinessSettingsSections({
  formData,
  logoFile,
  completion,
  onInputChange,
  onLogoChange,
  onFieldBlur,
  defaultSection,
}: BusinessSettingsSectionsProps) {
  const hasDescription = !!formData.description;

  const socialFormData = {
    instagram_url: formData.instagram_url,
    tiktok_url: formData.tiktok_url,
    youtube_url: formData.youtube_url,
    facebook_url: formData.facebook_url,
    linkedin_url: formData.linkedin_url,
    x_url: formData.x_url,
    other_social_url: formData.other_social_url,
  };

  return (
    <Accordion type="single" collapsible defaultValue={defaultSection}>
      {/* 1. Business Info */}
      <SettingsSection
        value="business-info"
        icon="🏢"
        title="Business Info"
        subtitle="Name, industry, and location"
      >
        <FileUploadSection
          logoFile={logoFile}
          sampleFiles={[]}
          onLogoChange={onLogoChange}
          onSampleFilesChange={() => undefined}
          logoUrl={formData.logo_url}
          logoOnly
        />

        <div>
          <Label htmlFor="business_name">Business Name</Label>
          <Input
            id="business_name"
            value={formData.business_name}
            onChange={(e) => onInputChange('business_name', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Your business name"
          />
        </div>

        <div>
          <Label htmlFor="industry">Industry</Label>
          <Select
            value={formData.industry}
            onValueChange={(value) => {
              onInputChange('industry', value);
              onFieldBlur();
            }}
          >
            <SelectTrigger id="industry" className="mt-1">
              <SelectValue placeholder="Select industry" />
            </SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => onInputChange('city', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="City"
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={formData.country}
              onChange={(e) => onInputChange('country', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="Country"
            />
          </div>
        </div>

      </SettingsSection>

      {/* 2. About & Goals */}
      <SettingsSection
        value="about"
        icon="📝"
        title="About & Goals"
        subtitle="Description, category, and objectives"
        nudge={hasDescription ? undefined : "Tell creators what you're looking for →"}
      >
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => onInputChange('description', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Tell creators about your business and what you're looking for..."
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="brandCategory">Brand Category</Label>
          <Input
            id="brandCategory"
            value={formData.brandCategory ?? ''}
            onChange={(e) => onInputChange('brandCategory', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="e.g. Restaurant, Boutique, Tech Startup"
          />
        </div>

        <div>
          <Label htmlFor="marketingObjectives">Marketing Objectives</Label>
          <Textarea
            id="marketingObjectives"
            value={formData.marketingObjectives ?? ''}
            onChange={(e) => onInputChange('marketingObjectives', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="What are your key marketing goals? (e.g. brand awareness, foot traffic, online sales)"
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="preferred_collaboration_style">Collaboration Style</Label>
          <Select
            value={formData.preferred_collaboration_style}
            onValueChange={(value) => {
              onInputChange('preferred_collaboration_style', value);
              onFieldBlur();
            }}
          >
            <SelectTrigger id="preferred_collaboration_style" className="mt-1">
              <SelectValue placeholder="Select collaboration style" />
            </SelectTrigger>
            <SelectContent>
              {COLLABORATION_STYLES.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="sponsorshipBudget">Sponsorship Budget ($)</Label>
          <Input
            id="sponsorshipBudget"
            type="number"
            value={formData.sponsorshipBudget ?? ''}
            onChange={(e) => onInputChange('sponsorshipBudget', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="0"
            min="0"
          />
        </div>
      </SettingsSection>

      {/* 3. Sample Content */}
      <SettingsSection
        value="samples"
        icon="📷"
        title="Sample Content"
        subtitle="Logo and brand content examples"
      >
        <FileUploadSection
          logoFile={logoFile}
          sampleFiles={[]}
          onLogoChange={onLogoChange}
          onSampleFilesChange={() => undefined}
          logoUrl={formData.logo_url}
        />
      </SettingsSection>

      {/* 4. Social Links */}
      <SettingsSection
        value="social"
        icon="🔗"
        title="Social Links"
        subtitle="Connect your brand's social accounts"
      >
        <SocialMediaLinks
          formData={socialFormData}
          onInputChange={onInputChange}
        />
      </SettingsSection>

      {/* 5. Payments */}
      <SettingsSection
        value="payments"
        icon="💳"
        title="Payments"
        subtitle="Budget range and payment settings"
      >
        <div>
          <Label htmlFor="budget_range">Budget Range</Label>
          <Select
            value={formData.budget_range}
            onValueChange={(value) => {
              onInputChange('budget_range', value);
              onFieldBlur();
            }}
          >
            <SelectTrigger id="budget_range" className="mt-1">
              <SelectValue placeholder="Select budget range" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-sm text-gray-500">
          Stripe payment setup lets you pay creators directly through the platform.
        </p>
        <p className="text-xs text-gray-400">
          Stripe Connect for businesses coming soon.
        </p>
      </SettingsSection>

      {/* 6. Integrations */}
      <SettingsSection
        value="integrations"
        icon="🔌"
        title="Integrations"
        subtitle="Connect your POS and third-party tools"
      >
        <ToastConnectionCard />
      </SettingsSection>

      {/* 7. Privacy */}
      <SettingsSection
        value="privacy"
        icon="🔒"
        title="Privacy"
        subtitle="Control who sees your business profile"
      >
        <div>
          <Label htmlFor="profile_visibility">Profile Visibility</Label>
          <Select
            value={formData.profile_visibility}
            onValueChange={(value) => {
              onInputChange('profile_visibility', value);
              onFieldBlur();
            }}
          >
            <SelectTrigger id="profile_visibility" className="mt-1">
              <SelectValue placeholder="Select visibility" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public — visible to all creators</SelectItem>
              <SelectItem value="private">Private — hidden from search</SelectItem>
              <SelectItem value="invite_only">Invite Only — you invite creators</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>
    </Accordion>
  );
}
