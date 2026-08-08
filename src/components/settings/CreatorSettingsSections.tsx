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
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from './SettingsSection';
import { StripeConnectSetup } from './StripeConnectSetup';
import { sanitizeNumericInput } from '@/lib/inputUtils';
import { SkillsSelection } from '@/components/creator-profile/SkillsSelection';
import { CreatorSocialMediaLinks } from '@/components/creator-profile/CreatorSocialMediaLinks';
import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';
import { PortfolioUpload } from '@/components/creator-profile/PortfolioUpload';
import { AvatarUpload } from '@/components/creator-profile/AvatarUpload';
import type { CreatorProfileFormData } from '@/hooks/useCreatorProfileForm';
import type { CompletionResult } from '@/hooks/useProfileCompletion';
import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

interface CreatorSettingsSectionsProps {
  formData: CreatorProfileFormData;
  selectedSkills: CreatorSkill[];
  avatarFile: File | null;
  portfolioPaths: string[];
  completion: CompletionResult;
  onInputChange: (field: string, value: string | boolean) => void;
  onSkillChange: (skillId: CreatorSkill, checked: boolean) => void;
  onAvatarFileChange: (file: File | null) => void;
  onPortfolioPathsChange: (paths: string[]) => void;
  onFieldBlur: () => void;
  defaultSection?: string;
}

export function CreatorSettingsSections({
  formData,
  selectedSkills,
  avatarFile,
  portfolioPaths,
  completion: _completion,
  onInputChange,
  onSkillChange,
  onAvatarFileChange,
  onPortfolioPathsChange,
  onFieldBlur,
  defaultSection,
}: CreatorSettingsSectionsProps) {
  const hasRates = !!(formData.base_rate_per_hour || formData.min_project_budget);
  const hasPortfolio = portfolioPaths.length > 0;

  const socialFormData = {
    instagram_url: formData.instagram_url,
    tiktok_url: formData.tiktok_url,
    youtube_url: formData.youtube_url,
    facebook_url: formData.facebook_url,
    linkedin_url: formData.linkedin_url,
    x_url: formData.x_url,
    other_social_url: formData.other_social_url,
    website_url: formData.website_url,
  };

  const handleSocialChange = (field: string, value: string) => {
    onInputChange(field, value);
  };

  return (
    <Accordion type="single" collapsible defaultValue={defaultSection}>
      {/* 1. Profile */}
      <SettingsSection
        value="profile"
        icon="👤"
        title="Profile"
        subtitle="Name, bio, skills, and location"
      >
        <AvatarUpload
          avatarFile={avatarFile}
          onAvatarFileChange={onAvatarFileChange}
          avatarUrl={formData.avatar_url}
          onAvatarUrlChange={(url) => onInputChange('avatar_url', url)}
        />

        <div>
          <Label htmlFor="creator_name">Display Name</Label>
          <Input
            id="creator_name"
            value={formData.creator_name}
            onChange={(e) => onInputChange('creator_name', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Your creator name"
          />
        </div>

        <div>
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={formData.bio}
            onChange={(e) => onInputChange('bio', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Tell brands about yourself..."
            rows={3}
          />
        </div>

        <SkillsSelection
          selectedSkills={selectedSkills}
          onSkillChange={onSkillChange}
        />

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

      {/* 2. Rates & Availability */}
      <SettingsSection
        value="rates"
        icon="💰"
        title="Rates & Availability"
        subtitle="Hourly rate, budget, and schedule"
        nudge={hasRates ? undefined : 'Add your rates to get matched faster →'}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="base_rate_per_hour">Hourly Rate ($)</Label>
            <Input
              id="base_rate_per_hour"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.base_rate_per_hour}
              onChange={(e) => onInputChange('base_rate_per_hour', sanitizeNumericInput(e.target.value))}
              onBlur={onFieldBlur}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="min_project_budget">Min Budget ($)</Label>
            <Input
              id="min_project_budget"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={formData.min_project_budget}
              onChange={(e) => onInputChange('min_project_budget', sanitizeNumericInput(e.target.value))}
              onBlur={onFieldBlur}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="max_projects_per_month">Max Projects/Month</Label>
            <Input
              id="max_projects_per_month"
              type="number"
              value={formData.max_projects_per_month}
              onChange={(e) => onInputChange('max_projects_per_month', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="e.g. 5"
              min="0"
            />
          </div>
          <div>
            <Label htmlFor="preferred_project_duration">Project Duration</Label>
            <Input
              id="preferred_project_duration"
              value={formData.preferred_project_duration}
              onChange={(e) => onInputChange('preferred_project_duration', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="e.g. 2 weeks"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="availability">Availability</Label>
          <Input
            id="availability"
            value={formData.availability}
            onChange={(e) => onInputChange('availability', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="e.g. Weekdays, 20 hrs/week"
          />
        </div>
      </SettingsSection>

      {/* 3. Portfolio */}
      <SettingsSection
        value="portfolio"
        icon="🎨"
        title="Portfolio"
        subtitle="Work samples and where they appear"
        nudge={hasPortfolio ? undefined : 'Upload work samples to stand out →'}
      >
        <PortfolioUpload
          portfolioPaths={portfolioPaths}
          onPortfolioPathsChange={(paths) => {
            onPortfolioPathsChange(paths);
            onFieldBlur();
          }}
        />

        {/* Moved here from "Privacy". It was filed as a privacy toggle, but for a creator this is
            a discovery decision — and buried under Privacy is why most creators never found it
            and stayed invisible in the feed by default rather than by choice. */}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-dc-teal/15 pt-4">
          <div className="min-w-0">
            <Label htmlFor="allow_portfolio_in_feed" className="text-sm font-medium">
              Show my work in the Dragon Feed
            </Label>
            <p className="mt-0.5 text-xs text-dc-text-muted">
              This is how businesses browse creators' work to decide who to hire.
            </p>
          </div>
          <Switch
            id="allow_portfolio_in_feed"
            checked={formData.allow_portfolio_in_feed}
            onCheckedChange={(checked) => {
              onInputChange('allow_portfolio_in_feed', checked);
              onFieldBlur();
            }}
          />
        </div>
      </SettingsSection>

      {/* 4. Social Media */}
      <SettingsSection
        value="social"
        icon="📡"
        title="Social Media"
        subtitle="Manage connected accounts & posting"
      >
        <ConnectedAccountsList role="creator" />

        <div className="border-t border-dc-teal/10 pt-4 mt-4">
          <details className="group">
            <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
              Profile Links (for public profile display)
            </summary>
            <div className="mt-3">
              <CreatorSocialMediaLinks
                formData={socialFormData}
                onInputChange={handleSocialChange}
              />
            </div>
          </details>
        </div>
      </SettingsSection>

      {/* 5. Payments */}
      <SettingsSection
        value="payments"
        icon="💳"
        title="Payments"
        subtitle="Stripe Connect for payouts"
      >
        <StripeConnectSetup role="creator" />
      </SettingsSection>

      {/* 6. Privacy */}
      <SettingsSection
        value="privacy"
        icon="🔒"
        title="Privacy"
        subtitle="Control who sees your profile"
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
              <SelectItem value="public">Public — visible to all brands</SelectItem>
              <SelectItem value="private">Private — hidden from search</SelectItem>
              <SelectItem value="invite_only">Invite Only — brands must invite you</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* "Show my work in the Dragon Feed" moved to the Portfolio section — it is a discovery
            decision, and burying it here is why creators never found it. */}
      </SettingsSection>
    </Accordion>
  );
}
