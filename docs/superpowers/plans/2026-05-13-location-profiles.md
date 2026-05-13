# Location Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each org_unit (location) its own profile — name, logo, description, social URLs, sample content — editable from the settings page when that location is selected.

**Architecture:** Extend the `org_units` table with 11 new nullable columns via migration. New `useLocationProfileForm` and `useLocationProfileSubmit` hooks handle location data. The settings page splits into `LocationSettingsSections` (top, teal) and `BusinessSettingsSections` (bottom, business-wide) when a location is selected.

**Tech Stack:** React/TypeScript, Supabase (Postgres + Storage), React Query, Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-05-13-location-profiles-design.md`

---

## File Map

### New files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260513100000_org_unit_profile_fields.sql` | Add 11 profile columns to `org_units` |
| `src/hooks/useLocationProfileForm.ts` | Location form state + React Query data fetching |
| `src/hooks/useLocationProfileSubmit.ts` | Save location profile fields to `org_units` |
| `src/components/settings/LocationSettingsSections.tsx` | Four location-specific accordion sections |

### Modified files

| File | Change |
|------|--------|
| `src/types/org.ts` | Extend `OrgUnit` interface with 11 new fields |
| `src/integrations/supabase/types.ts` | Add new columns to `org_units` Row/Insert/Update types |
| `src/hooks/useOrgData.ts` | Add new fields to `.select()` in all org_unit queries + extend `CreateOrgUnitInput` for clone |
| `src/hooks/useProfileCompletion.ts` | Add `LocationCompletionInput` type and `calculateLocationCompletion` function |
| `src/components/settings/ProfileCompletionBar.tsx` | Add `isLocation` prop, teal gradient, parent name subtitle |
| `src/components/settings/BusinessSettingsSections.tsx` | Remove Social Media, Payments, Sample Content sections; keep Business Info (sans city/country), Integrations, Privacy |
| `src/pages/BusinessSettings.tsx` | Orchestrate location mode vs business mode based on `activeOrgUnit` |
| `src/components/org/AddEditUnitModal.tsx` | Add "Clone from" dropdown for create mode |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260513100000_org_unit_profile_fields.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add profile fields to org_units so each location can have its own identity
ALTER TABLE org_units
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS brand_category TEXT,
  ADD COLUMN IF NOT EXISTS sample_content_urls JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_parent_brand BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS x_url TEXT,
  ADD COLUMN IF NOT EXISTS other_social_url TEXT;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `apply_migration`:
- Name: `org_unit_profile_fields`
- SQL: the statement from Step 1

- [ ] **Step 3: Verify migration applied**

Use the Supabase MCP tool `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'org_units'
  AND column_name IN ('description', 'brand_category', 'sample_content_urls',
    'show_parent_brand', 'instagram_url', 'tiktok_url', 'youtube_url',
    'facebook_url', 'linkedin_url', 'x_url', 'other_social_url')
ORDER BY column_name;
```

Expected: 11 rows, all nullable (except `show_parent_brand` which has a default).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513100000_org_unit_profile_fields.sql
git commit -m "feat: add profile columns to org_units for location profiles"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/org.ts:20-34`
- Modify: `src/integrations/supabase/types.ts` (org_units Row/Insert/Update sections)
- Modify: `src/hooks/useOrgData.ts:89-91,112-113,178-180,210-212`
- Modify: `src/contexts/AuthContext.tsx` (two `.select()` calls that load org_units)

- [ ] **Step 1: Extend the OrgUnit interface**

In `src/types/org.ts`, replace the `OrgUnit` interface (lines 20-34) with:

```typescript
export interface OrgUnit {
  id: string;
  org_id: string;
  unit_type: 'location' | 'product';
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  logo_url: string | null;
  is_primary: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Stripe fields (already on table)
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  pending_balance: number | null;
  // Profile fields (new)
  description: string | null;
  brand_category: string | null;
  sample_content_urls: string[] | null;
  show_parent_brand: boolean;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  other_social_url: string | null;
}
```

- [ ] **Step 2: Update Supabase generated types**

In `src/integrations/supabase/types.ts`, find the `org_units` table definition. Add these fields to the `Row`, `Insert`, and `Update` types:

**Row** (all required with nullable types):
```typescript
description: string | null
brand_category: string | null
sample_content_urls: Json | null
show_parent_brand: boolean
instagram_url: string | null
tiktok_url: string | null
youtube_url: string | null
facebook_url: string | null
linkedin_url: string | null
x_url: string | null
other_social_url: string | null
```

**Insert** and **Update** (all optional):
```typescript
description?: string | null
brand_category?: string | null
sample_content_urls?: Json | null
show_parent_brand?: boolean
instagram_url?: string | null
tiktok_url?: string | null
youtube_url?: string | null
facebook_url?: string | null
linkedin_url?: string | null
x_url?: string | null
other_social_url?: string | null
```

- [ ] **Step 3: Update `.select()` calls in useOrgData.ts**

Every hook that queries `org_units` uses an explicit `.select()` field list. Add the new fields to each one. There are four locations:

**`useOrgUnits`** (line ~91) — update the select string:
```typescript
.select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, stripe_account_id, stripe_onboarding_complete, pending_balance, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
```

**`useActiveOrgUnit`** (line ~113) — same select string as above.

**`useCreateOrgUnit`** (line ~180) — same select string on the `.select()` after insert.

**`useUpdateOrgUnit`** (line ~212) — same select string on the `.select()` after update.

- [ ] **Step 4: Extend CreateOrgUnitInput for clone support**

In `src/hooks/useOrgData.ts`, extend the `CreateOrgUnitInput` interface:

```typescript
interface CreateOrgUnitInput {
  name: string;
  unit_type: 'location' | 'product';
  is_primary?: boolean;
  address?: string | null;
  website_url?: string | null;
  // Profile fields (used by clone)
  description?: string | null;
  brand_category?: string | null;
  logo_url?: string | null;
  sample_content_urls?: string[] | null;
  show_parent_brand?: boolean;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  other_social_url?: string | null;
}
```

Update the `mutationFn` in `useCreateOrgUnit` to pass the new fields through to the insert:

```typescript
mutationFn: async (input: CreateOrgUnitInput) => {
  if (!orgId) throw new Error('orgId is required');

  const { data, error } = await supabase
    .from('org_units')
    .insert({
      org_id: orgId,
      unit_type: input.unit_type,
      name: input.name,
      is_primary: input.is_primary ?? false,
      address: input.address ?? null,
      website_url: input.website_url ?? null,
      description: input.description ?? null,
      brand_category: input.brand_category ?? null,
      logo_url: input.logo_url ?? null,
      sample_content_urls: input.sample_content_urls ?? [],
      show_parent_brand: input.show_parent_brand ?? true,
      instagram_url: input.instagram_url ?? null,
      tiktok_url: input.tiktok_url ?? null,
      youtube_url: input.youtube_url ?? null,
      facebook_url: input.facebook_url ?? null,
      linkedin_url: input.linkedin_url ?? null,
      x_url: input.x_url ?? null,
      other_social_url: input.other_social_url ?? null,
    })
    .select('id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, stripe_account_id, stripe_onboarding_complete, pending_balance, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url')
    .single();

  if (error) throw error;
  return data as unknown as OrgUnit;
},
```

- [ ] **Step 5: Update AuthContext.tsx `.select()` calls**

`src/contexts/AuthContext.tsx` has two hardcoded `.select()` calls that load org_units data for `activeOrgUnit`. Find both (search for `.from('org_units')` in that file) and replace their `.select()` strings with the same full field list used in `useOrgData.ts`:

```
'id, org_id, unit_type, name, address, lat, lng, website_url, logo_url, is_primary, deleted_at, created_at, updated_at, stripe_account_id, stripe_onboarding_complete, pending_balance, description, brand_category, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url'
```

This ensures `activeOrgUnit.stripe_onboarding_complete` and the profile fields are available at runtime, not just at compile time.

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Clean build, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/org.ts src/integrations/supabase/types.ts src/hooks/useOrgData.ts src/contexts/AuthContext.tsx
git commit -m "feat: extend OrgUnit types and queries with profile + Stripe fields"
```

---

## Task 3: Location Profile Form Hook

**Files:**
- Create: `src/hooks/useLocationProfileForm.ts`

This hook is self-contained — it fetches location data via React Query AND manages local form state. This is different from `useBusinessProfileForm` which only manages state (the page fetches data separately).

- [ ] **Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LocationProfileFormData {
  name: string;
  description: string;
  brand_category: string;
  logo_url: string;
  sample_content_urls: string[];
  show_parent_brand: boolean;
  instagram_url: string;
  tiktok_url: string;
  youtube_url: string;
  facebook_url: string;
  linkedin_url: string;
  x_url: string;
  other_social_url: string;
}

const EMPTY_FORM: LocationProfileFormData = {
  name: '',
  description: '',
  brand_category: '',
  logo_url: '',
  sample_content_urls: [],
  show_parent_brand: true,
  instagram_url: '',
  tiktok_url: '',
  youtube_url: '',
  facebook_url: '',
  linkedin_url: '',
  x_url: '',
  other_social_url: '',
};

const SELECT_FIELDS = 'name, description, brand_category, logo_url, sample_content_urls, show_parent_brand, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url';

export function useLocationProfileForm(orgUnitId: string | undefined) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [formData, setFormData] = useState<LocationProfileFormData>(EMPTY_FORM);
  const [hasLoaded, setHasLoaded] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['location-profile', orgUnitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_units')
        .select(SELECT_FIELDS)
        .eq('id', orgUnitId!)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!orgUnitId,
  });

  // Populate form when data arrives (or orgUnitId changes)
  if (query.data && hasLoaded !== orgUnitId) {
    const d = query.data;
    setFormData({
      name: d.name || '',
      description: d.description || '',
      brand_category: d.brand_category || '',
      logo_url: d.logo_url || '',
      sample_content_urls: (d.sample_content_urls as string[]) || [],
      show_parent_brand: d.show_parent_brand ?? true,
      instagram_url: d.instagram_url || '',
      tiktok_url: d.tiktok_url || '',
      youtube_url: d.youtube_url || '',
      facebook_url: d.facebook_url || '',
      linkedin_url: d.linkedin_url || '',
      x_url: d.x_url || '',
      other_social_url: d.other_social_url || '',
    });
    setLogoFile(null);
    setHasLoaded(orgUnitId!);
  }

  const handleInputChange = useCallback((field: string, value: string | boolean | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    formData,
    logoFile,
    setLogoFile,
    handleInputChange,
    isLoading: query.isLoading,
  };
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLocationProfileForm.ts
git commit -m "feat: add useLocationProfileForm hook for location profile editing"
```

---

## Task 4: Location Profile Submit Hook

**Files:**
- Create: `src/hooks/useLocationProfileSubmit.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  uploadProfileAsset,
  UploadError,
} from '@/lib/storage/uploadProfileAsset';
import type { LocationProfileFormData } from './useLocationProfileForm';

export function useLocationProfileSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const submitProfile = async (
    orgUnitId: string,
    formData: LocationProfileFormData,
    logoFile: File | null,
    userId: string,
  ) => {
    setIsSubmitting(true);

    try {
      let logoUrl = formData.logo_url;

      if (logoFile) {
        const result = await uploadProfileAsset({
          file: logoFile,
          userId,
          kind: 'logo',
        });
        logoUrl = result.path;
      }

      const { error } = await supabase
        .from('org_units')
        .update({
          name: formData.name,
          description: formData.description || null,
          brand_category: formData.brand_category || null,
          logo_url: logoUrl || null,
          sample_content_urls: formData.sample_content_urls,
          show_parent_brand: formData.show_parent_brand,
          instagram_url: formData.instagram_url || null,
          tiktok_url: formData.tiktok_url || null,
          youtube_url: formData.youtube_url || null,
          facebook_url: formData.facebook_url || null,
          linkedin_url: formData.linkedin_url || null,
          x_url: formData.x_url || null,
          other_social_url: formData.other_social_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgUnitId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['location-profile', orgUnitId] });
      queryClient.invalidateQueries({ queryKey: ['org-units'] });

      return true;
    } catch (error: unknown) {
      console.error('Error updating location profile:', error);
      const msg = error instanceof UploadError
        ? `Upload failed: ${error.message}`
        : error instanceof Error ? error.message : 'Please try again.';
      toast.error(msg);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitProfile, isSubmitting };
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLocationProfileSubmit.ts
git commit -m "feat: add useLocationProfileSubmit hook for saving location profiles"
```

---

## Task 5: Location Completion Calculation

**Files:**
- Modify: `src/hooks/useProfileCompletion.ts`

- [ ] **Step 1: Add LocationCompletionInput and calculateLocationCompletion**

At the bottom of `src/hooks/useProfileCompletion.ts`, before the `useProfileCompletion` hook, add:

```typescript
interface LocationCompletionInput {
  name?: string;
  logo_url?: string | null;
  description?: string | null;
  has_social_presence: boolean; // true if OAuth OR manual social URL exists
  stripe_onboarding_complete?: boolean | null;
}

const LOCATION_SECTIONS: Section<LocationCompletionInput>[] = [
  {
    key: 'name',
    weight: 20,
    section: 'location-profile',
    nudge: 'Add your location name',
    check: (p) => !!p.name,
  },
  {
    key: 'logo',
    weight: 20,
    section: 'location-profile',
    nudge: 'Add a logo for this location',
    check: (p) => !!p.logo_url,
  },
  {
    key: 'description',
    weight: 20,
    section: 'location-profile',
    nudge: 'Describe this location for creators',
    check: (p) => !!p.description,
  },
  {
    key: 'social',
    weight: 20,
    section: 'social',
    nudge: 'Connect a social account for this location',
    check: (p) => p.has_social_presence,
  },
  {
    key: 'payments',
    weight: 20,
    section: 'payments',
    nudge: 'Set up Stripe for this location to receive payments',
    check: (p) => !!p.stripe_onboarding_complete,
  },
];

export function calculateLocationCompletion(profile: LocationCompletionInput): CompletionResult {
  return calculate(LOCATION_SECTIONS, profile);
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useProfileCompletion.ts
git commit -m "feat: add calculateLocationCompletion for location setup progress"
```

---

## Task 6: ProfileCompletionBar Location Mode

**Files:**
- Modify: `src/components/settings/ProfileCompletionBar.tsx`

The bar needs to show teal gradient and a parent brand subtitle when viewing a location.

- [ ] **Step 1: Add isLocation prop and parentName prop**

Replace the current `ProfileCompletionBar` component in `src/components/settings/ProfileCompletionBar.tsx`:

```typescript
import type { CompletionResult } from '@/hooks/useProfileCompletion';

interface ProfileCompletionBarProps {
  avatarUrl: string | null;
  displayName: string;
  roleLabel: string;
  completion: CompletionResult;
  isCreator: boolean;
  onNudgeClick: () => void;
  isLocation?: boolean;
  parentName?: string;
}

export function ProfileCompletionBar({
  avatarUrl,
  displayName,
  roleLabel,
  completion,
  isCreator,
  onNudgeClick,
  isLocation,
  parentName,
}: ProfileCompletionBarProps) {
  const gradientClass = isLocation
    ? 'from-dc-teal to-dc-teal-dark'
    : isCreator
      ? 'from-dc-teal to-dc-teal-dark'
      : 'from-dc-pink to-dc-pink-accent';

  const subtitle = isLocation && parentName
    ? `Location · ${parentName}`
    : roleLabel;

  const completionLabel = isLocation ? 'Location setup' : 'Profile';

  return (
    <div className={`bg-gradient-to-br ${gradientClass} p-5 rounded-2xl text-white mb-4`}>
      <div className="flex items-center gap-3 mb-3">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className={`w-12 h-12 object-cover ${isCreator ? 'rounded-full' : 'rounded-xl'}`}
          />
        ) : (
          <div className={`w-12 h-12 bg-white/30 flex items-center justify-center text-lg font-bold ${
            isCreator ? 'rounded-full' : 'rounded-xl'
          }`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-bold text-base">{displayName}</div>
          <div className="text-xs opacity-80">{subtitle}</div>
        </div>
      </div>

      <div className="bg-white/20 rounded-full h-2 overflow-hidden">
        <div
          className="bg-white h-full rounded-full transition-all duration-500"
          style={{ width: `${completion.percentage}%` }}
        />
      </div>

      {completion.percentage < 100 && (
        <button
          onClick={onNudgeClick}
          className="text-xs mt-2 opacity-90 hover:opacity-100 underline-offset-2 hover:underline transition-opacity text-left"
        >
          {completionLabel} {completion.percentage}% complete — {completion.nextNudge}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build. Existing callers pass neither `isLocation` nor `parentName`, so they render as before.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/ProfileCompletionBar.tsx
git commit -m "feat: add location mode to ProfileCompletionBar with teal gradient"
```

---

## Task 7: LocationSettingsSections Component

**Files:**
- Create: `src/components/settings/LocationSettingsSections.tsx`

This is the top zone — four accordion sections for location-specific settings.

- [ ] **Step 1: Create the component**

```typescript
import { Accordion } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SettingsSection } from './SettingsSection';
import { StripeConnectSetup } from './StripeConnectSetup';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import type { LocationProfileFormData } from '@/hooks/useLocationProfileForm';

interface LocationSettingsSectionsProps {
  formData: LocationProfileFormData;
  logoFile: File | null;
  onInputChange: (field: string, value: string | boolean | string[]) => void;
  onLogoChange: (file: File | null) => void;
  onFieldBlur: () => void;
  defaultSection?: string;
}

export function LocationSettingsSections({
  formData,
  logoFile,
  onInputChange,
  onLogoChange,
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
      {/* 1. Location Profile */}
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

        <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
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

      {/* 2. Sample Content */}
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

      {/* 3. Social Media */}
      <SettingsSection
        value="social"
        icon="📡"
        title="Social Media"
        subtitle="This location's accounts"
      >
        <ConnectedAccountsList role="business" />

        <div className="border-t border-gray-100 pt-4 mt-4">
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

      {/* 4. Payments */}
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
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/LocationSettingsSections.tsx
git commit -m "feat: add LocationSettingsSections component for location-specific settings"
```

---

## Task 8: Refactor BusinessSettingsSections + Orchestrate BusinessSettings

This is the big integration task. Two changes in one:
1. Strip location-specific sections from `BusinessSettingsSections` (keep business-wide only)
2. Update `BusinessSettings.tsx` to switch between location mode and business mode

**Files:**
- Modify: `src/components/settings/BusinessSettingsSections.tsx`
- Modify: `src/pages/BusinessSettings.tsx`

- [ ] **Step 1: Refactor BusinessSettingsSections to business-wide only**

Replace the full content of `src/components/settings/BusinessSettingsSections.tsx` with:

```typescript
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
import { StripeConnectSetup } from './StripeConnectSetup';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { ConnectedAccountsList } from '@/components/outstand/ConnectedAccountsList';
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
  locationMode?: boolean;
}

export function BusinessSettingsSections({
  formData,
  logoFile,
  completion: _completion,
  onInputChange,
  onLogoChange,
  onFieldBlur,
  defaultSection,
  locationMode,
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

  // In location mode, only show business-wide sections
  if (locationMode) {
    return (
      <Accordion type="single" collapsible defaultValue={defaultSection}>
        {/* Business Info (business-wide fields only) */}
        <SettingsSection
          value="business-info"
          icon="🏢"
          title="Business Info"
          subtitle="Industry and collaboration style"
        >
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
        </SettingsSection>

        {/* About & Goals (business-wide fields that aren't on the location) */}
        <SettingsSection
          value="about"
          icon="📝"
          title="About & Goals"
          subtitle="Marketing objectives and sponsorship budget"
        >
          <div>
            <Label htmlFor="marketingObjectives">Marketing Objectives</Label>
            <Textarea
              id="marketingObjectives"
              value={formData.marketingObjectives ?? ''}
              onChange={(e) => onInputChange('marketingObjectives', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="What are your key marketing goals?"
              rows={3}
            />
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

        {/* Integrations */}
        <SettingsSection
          value="integrations"
          icon="🔌"
          title="Integrations"
          subtitle="Connect your POS and third-party tools"
        >
          <ToastConnectionCard />
        </SettingsSection>

        {/* Privacy */}
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

  // Full mode (All Locations selected) — show everything as before
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

      {/* 4. Social Media */}
      <SettingsSection
        value="social"
        icon="📡"
        title="Social Media"
        subtitle="Manage connected accounts & posting"
      >
        <ConnectedAccountsList role="business" />

        <div className="border-t border-gray-100 pt-4 mt-4">
          <details className="group">
            <summary className="text-xs font-semibold text-gray-400 cursor-pointer hover:text-gray-600">
              Profile Links (for public profile display)
            </summary>
            <div className="mt-3">
              <SocialMediaLinks
                formData={socialFormData}
                onInputChange={onInputChange}
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

        <StripeConnectSetup role="business" />
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
```

- [ ] **Step 2: Update BusinessSettings.tsx for location mode**

Replace the full content of `src/pages/BusinessSettings.tsx` with:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { BusinessSettingsSections } from '@/components/settings/BusinessSettingsSections';
import { LocationSettingsSections } from '@/components/settings/LocationSettingsSections';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { useLocationProfileForm } from '@/hooks/useLocationProfileForm';
import { useLocationProfileSubmit } from '@/hooks/useLocationProfileSubmit';
import {
  calculateBusinessCompletion,
  calculateLocationCompletion,
} from '@/hooks/useProfileCompletion';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { DeleteOrgSheet } from '@/components/org/DeleteOrgSheet';
import { LeaveOrgSheet } from '@/components/org/LeaveOrgSheet';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
import { Coachmark } from '@/components/guidance/Coachmark';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { PageHeader } from '@/components/ui/PageHeader';

const BusinessSettings = () => {
  const { user, activeOrg, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { submitProfile: submitBusinessProfile } = useBusinessProfileSubmit();
  const { submitProfile: submitLocationProfile } = useLocationProfileSubmit();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<string | undefined>(
    searchParams.get('section') ?? undefined
  );
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
  const [leaveOrgOpen, setLeaveOrgOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const isOwner = myRole?.role === 'owner';

  const isBrand = user?.user_metadata?.role === 'brand';
  const isLocationMode = !!activeOrgUnit;

  // Business profile form (always loaded — used in both modes)
  const {
    formData: businessFormData,
    logoFile: businessLogoFile,
    handleInputChange: handleBusinessInputChange,
    setLogoFile: setBusinessLogoFile,
    setFormDataFromProfile,
  } = useBusinessProfileForm();

  // Location profile form (only active when a location is selected)
  const {
    formData: locationFormData,
    logoFile: locationLogoFile,
    handleInputChange: handleLocationInputChange,
    setLogoFile: setLocationLogoFile,
    isLoading: locationLoading,
  } = useLocationProfileForm(activeOrgUnit?.id);

  // Social accounts for location completion
  const { data: locationSocialAccounts } = useLocationSocialAccounts(
    user?.id,
    activeOrgUnit?.id
  );

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('business_name, industry, website_url, location, postal_code, city, country, description, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, logo_url, company_size, founded_year, employee_count_range, budget_range, preferred_collaboration_style, timezone, profile_visibility')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading profile:', error);
          return;
        }

        if (data) {
          setFormDataFromProfile(data);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    };

    loadProfile();
  }, [user?.id, navigate, setFormDataFromProfile]);

  const handleBusinessFieldBlur = async () => {
    if (!user) return;
    const success = await submitBusinessProfile(businessFormData, businessLogoFile, user.id, isBrand);
    if (success) {
      setBusinessLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const handleLocationFieldBlur = async () => {
    if (!user || !activeOrgUnit) return;
    const success = await submitLocationProfile(
      activeOrgUnit.id,
      locationFormData,
      locationLogoFile,
      user.id,
    );
    if (success) {
      setLocationLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  // Completion calculation
  const hasSocialPresence = !!(
    (locationSocialAccounts && locationSocialAccounts.length > 0) ||
    locationFormData.instagram_url ||
    locationFormData.tiktok_url ||
    locationFormData.youtube_url ||
    locationFormData.facebook_url ||
    locationFormData.linkedin_url ||
    locationFormData.x_url ||
    locationFormData.other_social_url
  );

  const completion = isLocationMode
    ? calculateLocationCompletion({
        name: locationFormData.name || undefined,
        logo_url: locationFormData.logo_url || null,
        description: locationFormData.description || null,
        has_social_presence: hasSocialPresence,
        stripe_onboarding_complete: activeOrgUnit?.stripe_onboarding_complete ?? null,
      })
    : calculateBusinessCompletion({
        business_name: businessFormData.business_name || undefined,
        industry: businessFormData.industry || null,
        logo_url: businessFormData.logo_url || null,
        description: businessFormData.description || null,
        sample_content_urls: null,
        instagram_url: businessFormData.instagram_url || null,
        tiktok_url: businessFormData.tiktok_url || null,
        youtube_url: businessFormData.youtube_url || null,
        facebook_url: businessFormData.facebook_url || null,
        linkedin_url: businessFormData.linkedin_url || null,
        x_url: businessFormData.x_url || null,
        other_social_url: businessFormData.other_social_url || null,
        budget_range: businessFormData.budget_range || null,
      });

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const roleLabel = isBrand ? 'Brand' : 'Business';
  const displayName = isLocationMode
    ? (locationFormData.name || activeOrgUnit?.name || 'Location')
    : (businessFormData.business_name || roleLabel);

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageHeader>
          <div className="max-w-lg mx-auto">
            <ProfileCompletionBar
              avatarUrl={isLocationMode ? (locationFormData.logo_url || null) : (businessFormData.logo_url || null)}
              displayName={displayName}
              roleLabel={roleLabel}
              completion={completion}
              isCreator={false}
              onNudgeClick={handleNudgeClick}
              isLocation={isLocationMode}
              parentName={activeOrg?.name}
            />
          </div>
        </PageHeader>
        <div className="max-w-lg mx-auto p-4">
          {isLocationMode ? (
            <>
              {/* Top zone: Location settings */}
              <div className="mb-2">
                <p className="text-[10px] font-bold text-teal-500 uppercase tracking-wider px-1 mb-2">
                  📍 {locationFormData.name || activeOrgUnit?.name} Settings
                </p>
              </div>

              {locationLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading location...</div>
              ) : (
                <LocationSettingsSections
                  formData={locationFormData}
                  logoFile={locationLogoFile}
                  onInputChange={handleLocationInputChange}
                  onLogoChange={setLocationLogoFile}
                  onFieldBlur={handleLocationFieldBlur}
                  defaultSection={activeSection}
                />
              )}

              {/* Divider */}
              <div className="my-6 border-t-2 border-dashed border-gray-200" />

              {/* Bottom zone: Business-wide settings */}
              <div className="mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">
                  🏢 {activeOrg?.name || roleLabel} · Business-Wide
                </p>
              </div>

              <BusinessSettingsSections
                formData={businessFormData}
                logoFile={businessLogoFile}
                completion={completion}
                onInputChange={handleBusinessInputChange}
                onLogoChange={setBusinessLogoFile}
                onFieldBlur={handleBusinessFieldBlur}
                defaultSection={undefined}
                locationMode
              />
            </>
          ) : (
            <BusinessSettingsSections
              formData={businessFormData}
              logoFile={businessLogoFile}
              completion={completion}
              onInputChange={handleBusinessInputChange}
              onLogoChange={setBusinessLogoFile}
              onFieldBlur={handleBusinessFieldBlur}
              defaultSection={activeSection}
            />
          )}

          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="danger" className="border-red-200">
              <AccordionTrigger className="text-red-600 hover:text-red-700">
                <Coachmark coachmarkKey="delete_org_danger" title="Destructive actions" body="Read carefully. Deletion is permanent after 30 days.">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Danger Zone
                  </div>
                </Coachmark>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                {isOwner ? (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOrgOpen(true)}
                    className="w-full justify-start gap-2 border-red-300 text-red-600 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete this organization
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setLeaveOrgOpen(true)}
                    className="w-full justify-start gap-2 rounded-full"
                  >
                    <LogOut className="h-4 w-4" />
                    Leave this organization
                  </Button>
                )}
                <button
                  onClick={() => setDeleteUserOpen(true)}
                  className="text-sm text-red-500 hover:text-red-700 underline"
                >
                  Delete my user account
                </button>
                <div className="flex items-center gap-1">
                  <a
                    href="mailto:support@dragoncandy.io?subject=GDPR%20Data%20Erasure%20Request"
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Request full data erasure (GDPR/CCPA)
                  </a>
                  <WhyExpander expanderKey="soft_delete_vs_gdpr" title="What's the difference?" body="Soft delete preserves your data for 30 days in case you change your mind. GDPR erasure permanently removes everything." />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DeleteOrgSheet open={deleteOrgOpen} onOpenChange={setDeleteOrgOpen} />
          <LeaveOrgSheet open={leaveOrgOpen} onOpenChange={setLeaveOrgOpen} />
          <DeleteUserSheet open={deleteUserOpen} onOpenChange={setDeleteUserOpen} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessSettings;
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build. The page now shows location settings when a location is selected, business settings when "All Locations" is selected.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`
Test in browser:
1. Navigate to `/dashboard/business/settings` with "All Locations" selected → should look identical to before
2. Switch to a specific location in the OrgUnitSwitcher → should see teal ProfileCompletionBar with location name, four location sections (Location Profile, Sample Content, Social Media, Payments), dashed divider, then three business-wide sections
3. Edit a field in the location zone → should auto-save on blur with "Saved" toast
4. Edit a field in the business-wide zone → should also auto-save

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/BusinessSettingsSections.tsx src/pages/BusinessSettings.tsx
git commit -m "feat: make settings page location-aware with split location/business zones"
```

---

## Task 9: Clone Flow in AddEditUnitModal

**Files:**
- Modify: `src/components/org/AddEditUnitModal.tsx`

- [ ] **Step 1: Add clone dropdown to the modal**

Replace the full content of `src/components/org/AddEditUnitModal.tsx`:

```typescript
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateOrgUnit, useUpdateOrgUnit, useOrgUnits } from '@/hooks/useOrgData';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org';

export interface AddEditUnitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  unitType: 'location' | 'product';
  editUnit?: OrgUnit | null;
}

interface FormState {
  name: string;
  secondaryField: string;
  isPrimary: boolean;
  cloneFromId: string;
}

function buildInitialForm(editUnit?: OrgUnit | null): FormState {
  if (!editUnit) return { name: '', secondaryField: '', isPrimary: false, cloneFromId: '' };
  const secondaryField = editUnit.unit_type === 'location'
    ? (editUnit.address ?? '')
    : (editUnit.website_url ?? '');
  return { name: editUnit.name, secondaryField, isPrimary: editUnit.is_primary, cloneFromId: '' };
}

export function AddEditUnitModal({
  open,
  onOpenChange,
  orgId,
  unitType,
  editUnit,
}: AddEditUnitModalProps) {
  const { toast } = useToast();
  const createUnit = useCreateOrgUnit(orgId);
  const updateUnit = useUpdateOrgUnit();
  const { data: existingUnits } = useOrgUnits(orgId);

  const isLocation = unitType === 'location';
  const [form, setForm] = useState<FormState>(() => buildInitialForm(editUnit));

  useEffect(() => {
    setForm(buildInitialForm(editUnit));
  }, [editUnit, open]);

  const isEditing = !!editUnit;
  const isSaving = createUnit.isPending || updateUnit.isPending;
  const canSave = form.name.trim().length > 0 && !isSaving;

  const secondaryLabel = unitType === 'location' ? 'Address' : 'Website URL';
  const secondaryPlaceholder =
    unitType === 'location' ? '123 Main St, City, State' : 'https://example.com';

  function handleField(field: keyof FormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    const name = form.name.trim();
    const secondary = form.secondaryField.trim() || null;

    try {
      const fieldPayload = isLocation
        ? { address: secondary }
        : { website_url: secondary };

      if (isEditing) {
        await updateUnit.mutateAsync({
          id: editUnit!.id,
          name,
          is_primary: form.isPrimary,
          ...fieldPayload,
        });
      } else {
        // Clone profile fields from source if selected
        const cloneSource = form.cloneFromId
          ? existingUnits?.find(u => u.id === form.cloneFromId)
          : null;

        const cloneFields = cloneSource
          ? {
              description: cloneSource.description,
              brand_category: cloneSource.brand_category,
              logo_url: cloneSource.logo_url,
              sample_content_urls: cloneSource.sample_content_urls,
              show_parent_brand: cloneSource.show_parent_brand,
              instagram_url: cloneSource.instagram_url,
              tiktok_url: cloneSource.tiktok_url,
              youtube_url: cloneSource.youtube_url,
              facebook_url: cloneSource.facebook_url,
              linkedin_url: cloneSource.linkedin_url,
              x_url: cloneSource.x_url,
              other_social_url: cloneSource.other_social_url,
            }
          : {};

        await createUnit.mutateAsync({
          name,
          unit_type: unitType,
          is_primary: form.isPrimary,
          ...fieldPayload,
          ...cloneFields,
        });
      }
      toast({
        title: isEditing ? 'Unit updated' : 'Unit created',
        description: `"${name}" has been ${isEditing ? 'updated' : 'added'} successfully.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Something went wrong',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  }

  const title = `${isEditing ? 'Edit' : 'Add'} ${unitType === 'location' ? 'Location' : 'Product'}`;
  const cloneableUnits = existingUnits?.filter(u => u.id !== editUnit?.id) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900">{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-name">Name *</Label>
            <Input
              id="unit-name"
              placeholder={unitType === 'location' ? 'Downtown Branch' : 'Product Name'}
              value={form.name}
              onChange={(e) => handleField('name', e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit-secondary">{secondaryLabel}</Label>
            <Input
              id="unit-secondary"
              placeholder={secondaryPlaceholder}
              value={form.secondaryField}
              onChange={(e) => handleField('secondaryField', e.target.value)}
              disabled={isSaving}
            />
          </div>

          {!isEditing && cloneableUnits.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="clone-from">Clone profile from</Label>
              <Select
                value={form.cloneFromId}
                onValueChange={(value) => handleField('cloneFromId', value === 'none' ? '' : value)}
              >
                <SelectTrigger id="clone-from" className="mt-1">
                  <SelectValue placeholder="Start fresh" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Start fresh</SelectItem>
                  {cloneableUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                Copies description, logo, social links, and content. Stripe and connected accounts are not cloned.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
            <Label htmlFor="unit-primary" className="cursor-pointer text-sm font-medium">
              Set as default
            </Label>
            <Switch
              id="unit-primary"
              checked={form.isPrimary}
              onCheckedChange={(checked) => handleField('isPrimary', checked)}
              disabled={isSaving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-full bg-teal-400 text-white hover:bg-dc-teal-btn-hover disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`
Test: Navigate to Locations page → Add Location → "Clone from" dropdown should appear if there are existing locations. Select one, create → new location should have the cloned profile fields.

- [ ] **Step 4: Commit**

```bash
git add src/components/org/AddEditUnitModal.tsx
git commit -m "feat: add 'Clone from' dropdown when creating a new location"
```

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] **"All Locations" mode**: Settings page looks identical to before (pink gradient, all 7 sections)
- [ ] **Location mode**: Settings page shows teal header with location name, 4 location sections, dashed divider, 3 business-wide sections
- [ ] **Auto-save**: Edit a location field → "Saved" toast. Edit a business-wide field → "Saved" toast. Both persist on reload.
- [ ] **Location switching**: Switch between locations → form data updates to show that location's profile
- [ ] **Clone**: Create new location with "Clone from" → profile fields copied correctly
- [ ] **Completion bar**: Location mode shows location-specific completion (name, logo, description, social, Stripe)
- [ ] **Build**: `npm run build` passes clean
