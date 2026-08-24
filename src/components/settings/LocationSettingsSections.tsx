import { Accordion } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from './SettingsSection';
import { StripeConnectSetup } from './StripeConnectSetup';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';
import { YouTubeAnalyticsCard } from '@/features/settings/YouTubeAnalyticsCard';
import { InstagramInsightsCard } from '@/features/settings/InstagramInsightsCard';
import { FacebookPageInsightsCard } from '@/features/settings/FacebookPageInsightsCard';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import type { LocationProfileFormData } from '@/hooks/useLocationProfileForm';

interface LocationSettingsSectionsProps {
  formData: LocationProfileFormData;
  logoFile: File | null;
  onInputChange: (field: string, value: string | boolean | string[]) => void;
  onLogoChange: (file: File | null) => void;
  onPersistLogo?: (path: string) => Promise<void> | void;
  logoLabel?: string;
  onFieldBlur: () => void;
  defaultSection?: string;
}

export function LocationSettingsSections({
  formData,
  logoFile,
  onInputChange,
  onLogoChange,
  onPersistLogo,
  logoLabel,
  onFieldBlur,
  defaultSection,
}: LocationSettingsSectionsProps) {
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
      <SettingsSection
        value="location-profile"
        icon="📍"
        title="Location Profile"
        subtitle="Name, logo, and description"
      >
        <FileUploadSection
          logoFile={logoFile}
          sampleFiles={[]}
          onLogoChange={onLogoChange}
          onSampleFilesChange={() => undefined}
          logoUrl={formData.logo_url}
          onPersistLogo={onPersistLogo}
          logoLabel={logoLabel}
          logoOnly
        />

        <div>
          <Label htmlFor="loc_name">Location Name</Label>
          <Input
            id="loc_name"
            value={formData.name}
            onChange={(e) => onInputChange('name', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="e.g. South Philly"
          />
        </div>

        <div>
          <Label htmlFor="loc_description">Description</Label>
          <Textarea
            id="loc_description"
            value={formData.description}
            onChange={(e) => onInputChange('description', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Tell creators about this location's vibe and content needs..."
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="loc_brand_category">Category</Label>
          <Input
            id="loc_brand_category"
            value={formData.brand_category}
            onChange={(e) => onInputChange('brand_category', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="e.g. Fast Casual, Fine Dining"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-dc-teal/15 px-4 py-3">
          <div>
            <Label htmlFor="show_parent_brand" className="cursor-pointer text-sm font-medium">
              Show parent brand to creators
            </Label>
            <p className="text-xs text-gray-500 mt-0.5">
              Display your business name alongside this location
            </p>
          </div>
          <Switch
            id="show_parent_brand"
            checked={formData.show_parent_brand}
            onCheckedChange={(checked) => {
              onInputChange('show_parent_brand', checked);
              onFieldBlur();
            }}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        value="samples"
        icon="📷"
        title="Sample Content"
        subtitle="This location's brand content"
      >
        <FileUploadSection
          logoFile={null}
          sampleFiles={[]}
          onLogoChange={() => undefined}
          onSampleFilesChange={() => undefined}
          sampleUrls={formData.sample_content_urls}
          onSampleUrlsChange={(urls) => {
            onInputChange('sample_content_urls', urls);
            onFieldBlur();
          }}
        />
      </SettingsSection>

      <SettingsSection
        value="social"
        icon="📡"
        title="Social Media"
        subtitle="This location's accounts"
      >
        <ConnectedAccountsList role="business" />

        {/* The analytics connectors live here as well as on the main settings page,
            because a business with locations manages social PER LOCATION — this is the
            page an owner actually lands on. Without them the only Instagram button on
            this screen was Outstand's, which is a different integration doing a
            different job; the founder connected the wrong one on 2026-08-24 and the
            resulting grant went to Outstand-IG.

            They are grouped under their own heading and labelled account-wide because
            they ARE: `instagram_account_connections` / `youtube_channel_connections`
            key on `user_id`, not on an org unit. Dropping the bare cards under a
            heading that reads "This location's accounts" would assert a per-location
            relationship the schema does not have, and a three-location business would
            see the same account on all three with nothing explaining why. */}
        <div className="border-t border-dc-teal/10 pt-4 mt-4 space-y-3">
          <div>
            <h4 className="font-bold text-dc-text">Analytics connections</h4>
            <p className="text-sm text-dc-text-muted">
              These read performance data and never post. They belong to your DragonCandy
              account rather than to this location, so the same connection appears on every
              location you manage.
            </p>
          </div>

          <YouTubeAnalyticsCard />

          <InstagramInsightsCard />
          <FacebookPageInsightsCard />
        </div>

        <div className="border-t border-dc-teal/10 pt-4 mt-4">
          <details className="group">
            <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
              Profile Links (for public profile display)
            </summary>
            <div className="mt-3">
              <SocialMediaLinks
                formData={socialFormData}
                onInputChange={(field, value) => onInputChange(field, value)}
              />
            </div>
          </details>
        </div>
      </SettingsSection>

      <SettingsSection
        value="payments"
        icon="💳"
        title="Payments"
        subtitle="Stripe for this location"
      >
        <StripeConnectSetup role="business" />
      </SettingsSection>
    </Accordion>
  );
}
