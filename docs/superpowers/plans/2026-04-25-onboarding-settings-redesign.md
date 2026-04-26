# Onboarding & Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5-step tutorial wizard + 30-field form with a single-screen 3-4 field onboarding, and rewrite settings as a grouped accordion with profile completion nudges.

**Architecture:** New unified `/profile/setup` page reads user role and renders a minimal form (creator: 4 fields, business: 3 fields). Auto-detect timezone and location. Settings pages rewritten as accordion using existing shadcn/ui Accordion component, with a weighted profile completion bar at top. Old wizard components, brand-specific pages, and onboarding progress tracking are deleted.

**Tech Stack:** React 18 + TypeScript, React Router v6, Supabase JS v2, shadcn/ui (Radix Accordion), Tailwind CSS, Sonner toast, Vitest

**Spec:** `docs/superpowers/specs/2026-04-25-onboarding-settings-redesign.md`

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `src/hooks/useAutoDetect.ts` | Detect timezone via `Intl` API and location via browser geolocation |
| `src/hooks/useProfileCompletion.ts` | Weighted profile completion calculation with nudge logic |
| `src/pages/ProfileSetup.tsx` | Unified single-screen onboarding for both roles |
| `src/components/settings/ProfileCompletionBar.tsx` | Gradient header with avatar, progress bar, and nudge CTA |
| `src/components/settings/SettingsSection.tsx` | Single expandable accordion section with nudge styling |
| `src/components/settings/CreatorSettingsSections.tsx` | Creator-specific section content (6 sections) |
| `src/components/settings/BusinessSettingsSections.tsx` | Business-specific section content (7 sections) |

### Modified Files
| File | Change |
|---|---|
| `src/pages/CreatorSettings.tsx` | Rewrite to use accordion layout with ProfileCompletionBar |
| `src/pages/BusinessSettings.tsx` | Rewrite to use accordion layout, absorb brand fields |
| `src/App.tsx` | Update route table: add `/profile/setup`, add redirects, remove brand routes |

### Deleted Files
| File | Reason |
|---|---|
| `src/components/onboarding/OnboardingWizard.tsx` | Tutorial wizard replaced by ProfileSetup |
| `src/components/onboarding/OnboardingStep.tsx` | Tutorial step component no longer used |
| `src/components/onboarding/steps/WelcomeStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/ProfileTourStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/CampaignCreationStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/CreatorDiscoveryStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/MessagingStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/ApplicationStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/CampaignBrowsingStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/CreatorProfileStep.tsx` | Tutorial step deleted |
| `src/components/onboarding/steps/ProjectManagementStep.tsx` | Tutorial step deleted |
| `src/pages/ProfileOnboarding.tsx` | Old wizard router replaced by ProfileSetup |
| `src/pages/BrandProfileSetup.tsx` | Brand collapsed into Business |
| `src/pages/BrandSettings.tsx` | Brand collapsed into Business |
| `src/components/brand-profile/BrandProfileSetupForm.tsx` | Brand collapsed into Business |
| `src/hooks/useOnboardingProgress.ts` | localStorage wizard tracking no longer used |
| `src/pages/CreatorProfileSetup.tsx` | Replaced by ProfileSetup |
| `src/pages/BusinessProfileSetup.tsx` | Replaced by ProfileSetup |

### Reused As-Is
| File | Usage |
|---|---|
| `src/components/ui/accordion.tsx` | Radix Accordion for settings sections |
| `src/components/creator-profile/SkillsSelection.tsx` | Skills chip grid in ProfileSetup and CreatorSettings |
| `src/components/creator-profile/AvatarUpload.tsx` | Avatar upload in ProfileSetup and CreatorSettings |
| `src/components/creator-profile/PortfolioUpload.tsx` | Portfolio upload in CreatorSettings |
| `src/components/creator-profile/CreatorSocialMediaLinks.tsx` | Social links in CreatorSettings |
| `src/components/business-profile/SocialMediaLinks.tsx` | Social links in BusinessSettings |
| `src/components/business-profile/FileUploadSection.tsx` | Sample content in BusinessSettings |
| `src/components/payments/RestaurantPaymentSettings.tsx` | Payments section in both settings pages |
| `src/components/toast/ToastConnectionCard.tsx` | Integrations section in BusinessSettings |
| `src/lib/storage/uploadProfileAsset.ts` | File upload utility |
| `src/hooks/useCreatorProfileSubmit.ts` | Submit logic for creator profile |
| `src/hooks/useBusinessProfileSubmit.ts` | Submit logic for business profile |
| `src/hooks/usePostalCodeAutoFill.ts` | Postal code lookup in settings |

---

## Task 1: Create useAutoDetect Hook

**Files:**
- Create: `src/hooks/useAutoDetect.ts`
- Test: `tests/hooks/useAutoDetect.test.ts`

- [ ] **Step 1: Write the test for timezone detection**

```typescript
// tests/hooks/useAutoDetect.test.ts
import { describe, test, expect, vi } from 'vitest';
import { detectTimezone, detectLocation } from '../src/hooks/useAutoDetect';

describe('detectTimezone', () => {
  test('returns IANA timezone string from browser', () => {
    const tz = detectTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
    // Intl.DateTimeFormat always returns a valid IANA timezone
    expect(tz).toContain('/');
  });
});

describe('detectLocation', () => {
  test('returns null when geolocation is unavailable', async () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { geolocation: undefined },
      writable: true,
    });

    const result = await detectLocation();
    expect(result).toBeNull();

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hooks/useAutoDetect.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useAutoDetect.ts
import { useState, useEffect } from 'react';

interface AutoDetectResult {
  timezone: string;
  city: string;
  country: string;
  loading: boolean;
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export async function detectLocation(): Promise<{ city: string; country: string } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });

    const { latitude, longitude } = position.coords;
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      city: data.city || data.locality || '',
      country: data.countryName || '',
    };
  } catch {
    return null;
  }
}

export function useAutoDetect(): AutoDetectResult {
  const [state, setState] = useState<AutoDetectResult>({
    timezone: '',
    city: '',
    country: '',
    loading: true,
  });

  useEffect(() => {
    const timezone = detectTimezone();
    setState(prev => ({ ...prev, timezone }));

    detectLocation().then(location => {
      setState(prev => ({
        ...prev,
        city: location?.city ?? '',
        country: location?.country ?? '',
        loading: false,
      }));
    });
  }, []);

  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/hooks/useAutoDetect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAutoDetect.ts tests/hooks/useAutoDetect.test.ts
git commit -m "feat: add useAutoDetect hook for timezone and geolocation"
```

---

## Task 2: Create useProfileCompletion Hook

**Files:**
- Create: `src/hooks/useProfileCompletion.ts`
- Test: `tests/hooks/useProfileCompletion.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
// tests/hooks/useProfileCompletion.test.ts
import { describe, test, expect } from 'vitest';
import {
  calculateCreatorCompletion,
  calculateBusinessCompletion,
} from '../src/hooks/useProfileCompletion';

describe('calculateCreatorCompletion', () => {
  test('returns 0% for empty profile', () => {
    const result = calculateCreatorCompletion({});
    expect(result.percentage).toBe(0);
    expect(result.nextNudge).toBeTruthy();
    expect(result.nextSection).toBeTruthy();
  });

  test('returns 35% for name + bio + skills', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
    });
    expect(result.percentage).toBe(35);
  });

  test('returns 50% for name + bio + skills + avatar', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
    });
    expect(result.percentage).toBe(50);
  });

  test('returns 100% for fully complete profile', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
      base_rate_per_hour: 50,
      portfolio_urls: ['https://example.com/work.jpg'],
      instagram_url: 'https://instagram.com/jane',
      city: 'New York',
    });
    expect(result.percentage).toBe(100);
  });

  test('nudge targets highest-weight incomplete section', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
    });
    // Next highest incomplete: Rates & Availability (20%)
    expect(result.nextSection).toBe('rates');
  });
});

describe('calculateBusinessCompletion', () => {
  test('returns 0% for empty profile', () => {
    const result = calculateBusinessCompletion({});
    expect(result.percentage).toBe(0);
  });

  test('returns 30% for name + industry', () => {
    const result = calculateBusinessCompletion({
      business_name: 'Tasty Burger',
      industry: 'food',
    });
    expect(result.percentage).toBe(30);
  });

  test('returns 100% for fully complete profile', () => {
    const result = calculateBusinessCompletion({
      business_name: 'Tasty Burger',
      industry: 'food',
      logo_url: 'https://example.com/logo.jpg',
      description: 'Best burgers in town',
      sample_content_urls: ['https://example.com/sample.jpg'],
      instagram_url: 'https://instagram.com/tasty',
      budget_range: '$1K-$5K',
    });
    expect(result.percentage).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/hooks/useProfileCompletion.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useProfileCompletion.ts

interface CompletionResult {
  percentage: number;
  nextNudge: string;
  nextSection: string;
}

interface CreatorCompletionInput {
  creator_name?: string;
  bio?: string;
  skills?: string[];
  avatar_url?: string | null;
  base_rate_per_hour?: number | null;
  portfolio_urls?: string[] | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  other_social_url?: string | null;
  website_url?: string | null;
  city?: string | null;
  country?: string | null;
}

interface BusinessCompletionInput {
  business_name?: string;
  industry?: string | null;
  logo_url?: string | null;
  description?: string | null;
  sample_content_urls?: string[] | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  other_social_url?: string | null;
  budget_range?: string | null;
}

const CREATOR_SECTIONS = [
  {
    key: 'essentials',
    weight: 35,
    section: 'profile',
    nudge: 'Complete your name, bio, and skills to go live',
    check: (p: CreatorCompletionInput) => !!(p.creator_name && p.bio && p.skills?.length),
  },
  {
    key: 'rates',
    weight: 20,
    section: 'rates',
    nudge: 'Add your rates to appear in more searches',
    check: (p: CreatorCompletionInput) => p.base_rate_per_hour != null && p.base_rate_per_hour > 0,
  },
  {
    key: 'avatar',
    weight: 15,
    section: 'profile',
    nudge: 'Add a profile photo — profiles with photos get 3x more views',
    check: (p: CreatorCompletionInput) => !!p.avatar_url,
  },
  {
    key: 'portfolio',
    weight: 15,
    section: 'portfolio',
    nudge: 'Upload work samples to stand out',
    check: (p: CreatorCompletionInput) => !!(p.portfolio_urls && p.portfolio_urls.length > 0),
  },
  {
    key: 'social',
    weight: 10,
    section: 'social',
    nudge: 'Link a social account to build trust with brands',
    check: (p: CreatorCompletionInput) =>
      !!(p.instagram_url || p.tiktok_url || p.youtube_url || p.facebook_url ||
         p.linkedin_url || p.x_url || p.other_social_url || p.website_url),
  },
  {
    key: 'location',
    weight: 5,
    section: 'profile',
    nudge: 'Add your location to get local campaign matches',
    check: (p: CreatorCompletionInput) => !!(p.city || p.country),
  },
];

const BUSINESS_SECTIONS = [
  {
    key: 'essentials',
    weight: 30,
    section: 'business-info',
    nudge: 'Add your business name and industry to get started',
    check: (p: BusinessCompletionInput) => !!(p.business_name && p.industry),
  },
  {
    key: 'about',
    weight: 20,
    section: 'about',
    nudge: 'Tell creators what you\'re looking for',
    check: (p: BusinessCompletionInput) => !!p.description,
  },
  {
    key: 'logo',
    weight: 15,
    section: 'business-info',
    nudge: 'Add your logo — branded profiles attract top creators',
    check: (p: BusinessCompletionInput) => !!p.logo_url,
  },
  {
    key: 'samples',
    weight: 15,
    section: 'samples',
    nudge: 'Show creators your brand style with sample content',
    check: (p: BusinessCompletionInput) =>
      !!(p.sample_content_urls && p.sample_content_urls.length > 0),
  },
  {
    key: 'social',
    weight: 10,
    section: 'social',
    nudge: 'Link a social account so creators can see your brand',
    check: (p: BusinessCompletionInput) =>
      !!(p.instagram_url || p.tiktok_url || p.youtube_url || p.facebook_url ||
         p.linkedin_url || p.x_url || p.other_social_url),
  },
  {
    key: 'payments',
    weight: 10,
    section: 'payments',
    nudge: 'Set up payments to start hiring creators',
    check: (p: BusinessCompletionInput) => !!p.budget_range,
  },
];

function calculate<T>(sections: Array<{ weight: number; section: string; nudge: string; check: (p: T) => boolean }>, profile: T): CompletionResult {
  let percentage = 0;
  let nextNudge = '';
  let nextSection = '';
  let highestIncompleteWeight = 0;

  for (const s of sections) {
    if (s.check(profile)) {
      percentage += s.weight;
    } else if (s.weight > highestIncompleteWeight) {
      highestIncompleteWeight = s.weight;
      nextNudge = s.nudge;
      nextSection = s.section;
    }
  }

  return { percentage, nextNudge, nextSection };
}

export function calculateCreatorCompletion(profile: CreatorCompletionInput): CompletionResult {
  return calculate(CREATOR_SECTIONS, profile);
}

export function calculateBusinessCompletion(profile: BusinessCompletionInput): CompletionResult {
  return calculate(BUSINESS_SECTIONS, profile);
}

export function useProfileCompletion(
  role: 'content_creator' | 'business_client' | 'brand',
  profileData: CreatorCompletionInput | BusinessCompletionInput
): CompletionResult {
  if (role === 'content_creator') {
    return calculateCreatorCompletion(profileData as CreatorCompletionInput);
  }
  return calculateBusinessCompletion(profileData as BusinessCompletionInput);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/hooks/useProfileCompletion.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProfileCompletion.ts tests/hooks/useProfileCompletion.test.ts
git commit -m "feat: add useProfileCompletion hook with weighted calculation"
```

---

## Task 3: Create ProfileSetup Page

**Files:**
- Create: `src/pages/ProfileSetup.tsx`
- Reuse: `src/hooks/useAutoDetect.ts`, `src/components/creator-profile/SkillsSelection.tsx`, `src/lib/storage/uploadProfileAsset.ts`
- Reference: `src/hooks/useCreatorProfileSubmit.ts`, `src/hooks/useBusinessProfileSubmit.ts` (for submission pattern)

- [ ] **Step 1: Create the ProfileSetup page**

```typescript
// src/pages/ProfileSetup.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { supabase } from '@/integrations/supabase/client';
import { uploadProfileAsset } from '@/lib/storage/uploadProfileAsset';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';
import type { CreatorSkill } from '@/types/creator';

const CREATOR_SKILLS: { value: CreatorSkill; label: string }[] = [
  { value: 'ugc_creation', label: 'UGC' },
  { value: 'video_editing', label: 'Video' },
  { value: 'photography', label: 'Photo' },
  { value: 'graphic_design', label: 'Design' },
  { value: 'copywriting', label: 'Copy' },
  { value: 'social_media_management', label: 'Social' },
  { value: 'animation', label: 'Animation' },
  { value: 'content_strategy', label: 'Strategy' },
  { value: 'influencer_marketing', label: 'Influencer' },
  { value: 'other', label: 'Other' },
];

const INDUSTRIES: { value: string; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'fashion', label: 'Fashion' },
  { value: 'beauty', label: 'Beauty' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'technology', label: 'Tech' },
  { value: 'travel', label: 'Travel' },
  { value: 'health', label: 'Health' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'education', label: 'Education' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'finance', label: 'Finance' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'other', label: 'Other' },
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const autoDetect = useAutoDetect();

  const role = user?.user_metadata?.role as string;
  const isCreator = role === 'content_creator';

  // Creator state
  const [creatorName, setCreatorName] = useState('');
  const [bio, setBio] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<CreatorSkill[]>([]);

  // Business state
  const [businessName, setBusinessName] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('');

  // Shared state
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const toggleSkill = (skill: CreatorSkill) => {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const isValid = isCreator
    ? creatorName.trim() && bio.trim() && selectedSkills.length > 0
    : businessName.trim() && selectedIndustry;

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setLoading(true);

    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const result = await uploadProfileAsset({
          file: avatarFile,
          userId: user.id,
          kind: isCreator ? 'avatar' : 'logo',
        });
        avatarUrl = result.path;
      }

      if (isCreator) {
        const { error } = await supabase.from('creator_profiles').upsert({
          user_id: user.id,
          creator_name: creatorName.trim(),
          bio: bio.trim(),
          skills: selectedSkills,
          avatar_url: avatarUrl,
          city: autoDetect.city || null,
          country: autoDetect.country || null,
          timezone: autoDetect.timezone || null,
          is_completed: true,
        });
        if (error) throw error;
        toast.success('Your creator profile is live!');
        navigate('/dashboard/creator');
      } else {
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: businessName.trim(),
          industry: selectedIndustry,
          logo_url: avatarUrl,
          city: autoDetect.city || null,
          country: autoDetect.country || null,
          timezone: autoDetect.timezone || null,
          is_completed: true,
        });
        if (error) throw error;
        toast.success('Your business profile is live!');
        navigate('/dashboard/business');
      }
    } catch (err) {
      toast.error('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-400 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl p-6 shadow-lg">
          {/* Avatar / Logo upload */}
          <div className="flex flex-col items-center mb-6">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Preview"
                  className={`w-20 h-20 object-cover ${isCreator ? 'rounded-full ring-2 ring-teal-400' : 'rounded-xl ring-2 ring-pink-400'}`}
                />
              ) : (
                <div
                  className={`w-20 h-20 border-3 border-dashed flex items-center justify-center text-2xl ${
                    isCreator
                      ? 'rounded-full border-teal-400 text-teal-400'
                      : 'rounded-xl border-pink-400 text-pink-400'
                  }`}
                >
                  +
                </div>
              )}
            </label>
            <p className="text-xs text-gray-400 mt-2">
              {isCreator ? 'Tap to add photo' : 'Add your logo'}
            </p>
          </div>

          {isCreator ? (
            <>
              {/* Creator: Name */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  Your name
                </Label>
                <Input
                  value={creatorName}
                  onChange={e => setCreatorName(e.target.value)}
                  placeholder="Creative name or real name"
                  className="mt-1"
                />
              </div>

              {/* Creator: Skills */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  What do you create?
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CREATOR_SKILLS.map(skill => (
                    <button
                      key={skill.value}
                      type="button"
                      onClick={() => toggleSkill(skill.value)}
                      className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                        selectedSkills.includes(skill.value)
                          ? 'bg-teal-400 text-white'
                          : 'border border-gray-300 text-gray-600 hover:border-teal-400'
                      }`}
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Creator: Bio */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  One-liner bio
                </Label>
                <Input
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="I create viral food content for restaurants"
                  className="mt-1"
                />
              </div>
            </>
          ) : (
            <>
              {/* Business: Name */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  Business name
                </Label>
                <Input
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Your company or brand name"
                  className="mt-1"
                />
              </div>

              {/* Business: Industry */}
              <div className="mb-4">
                <Label className="text-xs uppercase tracking-wider text-gray-500">
                  What's your industry?
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {INDUSTRIES.map(ind => (
                    <button
                      key={ind.value}
                      type="button"
                      onClick={() => setSelectedIndustry(ind.value)}
                      className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                        selectedIndustry === ind.value
                          ? 'bg-pink-400 text-white'
                          : 'border border-gray-300 text-gray-600 hover:border-pink-400'
                      }`}
                    >
                      {ind.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Auto-detected location */}
          {!autoDetect.loading && (autoDetect.city || autoDetect.country) && (
            <div className={`rounded-lg p-3 mb-4 text-xs flex items-center gap-2 ${
              isCreator ? 'bg-teal-50 text-teal-600' : 'bg-pink-50 text-pink-600'
            }`}>
              <MapPin className="w-3 h-3" />
              Auto-detected: {[autoDetect.city, autoDetect.country].filter(Boolean).join(', ')}
              {autoDetect.timezone && ` · ${autoDetect.timezone}`}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || loading}
            className={`w-full rounded-full py-6 text-base font-bold ${
              isCreator
                ? 'bg-teal-400 hover:bg-teal-500 text-white'
                : 'bg-pink-400 hover:bg-pink-500 text-white'
            }`}
          >
            {loading
              ? 'Setting up...'
              : isCreator
                ? 'Go Live'
                : 'Start Finding Creators'}
          </Button>

          <p className="text-center text-xs text-gray-400 mt-3">
            {isCreator
              ? 'You can add rates, portfolio & social links anytime'
              : 'Add description, social links & samples anytime'}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `npx tsc --noEmit src/pages/ProfileSetup.tsx` or check the dev server for errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProfileSetup.tsx
git commit -m "feat: add unified ProfileSetup page for single-screen onboarding"
```

---

## Task 4: Create ProfileCompletionBar Component

**Files:**
- Create: `src/components/settings/ProfileCompletionBar.tsx`
- Reuse: `src/hooks/useProfileCompletion.ts`

- [ ] **Step 1: Create the component**

```typescript
// src/components/settings/ProfileCompletionBar.tsx
import type { CompletionResult } from '@/hooks/useProfileCompletion';

interface ProfileCompletionBarProps {
  avatarUrl: string | null;
  displayName: string;
  roleLabel: string;
  completion: CompletionResult;
  isCreator: boolean;
  onNudgeClick: () => void;
}

export function ProfileCompletionBar({
  avatarUrl,
  displayName,
  roleLabel,
  completion,
  isCreator,
  onNudgeClick,
}: ProfileCompletionBarProps) {
  const gradientClass = isCreator
    ? 'from-teal-400 to-emerald-400'
    : 'from-pink-300 to-pink-500';

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
          <div className="text-xs opacity-80">{roleLabel}</div>
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
          Profile {completion.percentage}% complete — {completion.nextNudge}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/ProfileCompletionBar.tsx
git commit -m "feat: add ProfileCompletionBar component with gradient header and nudge CTA"
```

---

## Task 5: Create SettingsSection Component

**Files:**
- Create: `src/components/settings/SettingsSection.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/settings/SettingsSection.tsx
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

interface SettingsSectionProps {
  value: string;
  icon: string;
  title: string;
  subtitle: string;
  nudge?: string;
  accentColor?: 'teal' | 'pink';
  children: React.ReactNode;
}

export function SettingsSection({
  value,
  icon,
  title,
  subtitle,
  nudge,
  accentColor,
  children,
}: SettingsSectionProps) {
  const borderClass = nudge
    ? accentColor === 'pink'
      ? 'border-l-4 border-l-pink-400'
      : 'border-l-4 border-l-teal-400'
    : '';

  const subtitleColorClass = nudge
    ? accentColor === 'pink'
      ? 'text-pink-500'
      : 'text-teal-500'
    : 'text-gray-400';

  return (
    <AccordionItem value={value} className={`bg-white rounded-2xl mb-3 border-0 overflow-hidden ${borderClass}`}>
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <div className="font-bold text-sm">{title}</div>
            <div className={`text-xs ${subtitleColorClass}`}>
              {nudge || subtitle}
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 border-t border-gray-100">
        <div className="pt-4 space-y-4">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/SettingsSection.tsx
git commit -m "feat: add SettingsSection accordion component with nudge styling"
```

---

## Task 6: Create Creator Settings Sections

**Files:**
- Create: `src/components/settings/CreatorSettingsSections.tsx`
- Reuse: `src/components/creator-profile/SkillsSelection.tsx`, `src/components/creator-profile/CreatorSocialMediaLinks.tsx`, `src/components/creator-profile/PortfolioUpload.tsx`
- Reference: `src/components/creator-profile/CreatorSettingsForm.tsx` (for field structure — will be deleted later)

- [ ] **Step 1: Create the sections component**

This component renders the 6 accordion sections for creator settings. Each section wraps a subset of the existing fields.

```typescript
// src/components/settings/CreatorSettingsSections.tsx
import { Accordion } from '@/components/ui/accordion';
import { SettingsSection } from './SettingsSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import SkillsSelection from '@/components/creator-profile/SkillsSelection';
import { CreatorSocialMediaLinks } from '@/components/creator-profile/CreatorSocialMediaLinks';
import PortfolioUpload from '@/components/creator-profile/PortfolioUpload';
import type { CreatorProfileFormData } from '@/hooks/useCreatorProfileForm';
import type { CreatorSkill } from '@/types/creator';
import type { CompletionResult } from '@/hooks/useProfileCompletion';

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

const TIMEZONE_OPTIONS = [
  { value: 'UTC-12', label: 'UTC-12 (Baker Island)' },
  { value: 'UTC-11', label: 'UTC-11 (Samoa)' },
  { value: 'UTC-10', label: 'UTC-10 (Hawaii)' },
  { value: 'UTC-9', label: 'UTC-9 (Alaska)' },
  { value: 'UTC-8', label: 'UTC-8 (Pacific)' },
  { value: 'UTC-7', label: 'UTC-7 (Mountain)' },
  { value: 'UTC-6', label: 'UTC-6 (Central)' },
  { value: 'UTC-5', label: 'UTC-5 (Eastern)' },
  { value: 'UTC-4', label: 'UTC-4 (Atlantic)' },
  { value: 'UTC-3', label: 'UTC-3 (Argentina)' },
  { value: 'UTC-2', label: 'UTC-2 (Mid-Atlantic)' },
  { value: 'UTC-1', label: 'UTC-1 (Azores)' },
  { value: 'UTC+0', label: 'UTC+0 (London)' },
  { value: 'UTC+1', label: 'UTC+1 (Paris)' },
  { value: 'UTC+2', label: 'UTC+2 (Cairo)' },
  { value: 'UTC+3', label: 'UTC+3 (Moscow)' },
  { value: 'UTC+4', label: 'UTC+4 (Dubai)' },
  { value: 'UTC+5', label: 'UTC+5 (Karachi)' },
  { value: 'UTC+5:30', label: 'UTC+5:30 (Mumbai)' },
  { value: 'UTC+6', label: 'UTC+6 (Dhaka)' },
  { value: 'UTC+7', label: 'UTC+7 (Bangkok)' },
  { value: 'UTC+8', label: 'UTC+8 (Singapore)' },
  { value: 'UTC+9', label: 'UTC+9 (Tokyo)' },
  { value: 'UTC+10', label: 'UTC+10 (Sydney)' },
  { value: 'UTC+11', label: 'UTC+11 (Solomon Islands)' },
  { value: 'UTC+12', label: 'UTC+12 (Auckland)' },
];

export function CreatorSettingsSections({
  formData,
  selectedSkills,
  avatarFile,
  portfolioPaths,
  completion,
  onInputChange,
  onSkillChange,
  onAvatarFileChange,
  onPortfolioPathsChange,
  onFieldBlur,
  defaultSection,
}: CreatorSettingsSectionsProps) {
  const hasRates = formData.base_rate_per_hour && Number(formData.base_rate_per_hour) > 0;
  const hasPortfolio = portfolioPaths.length > 0;
  const hasSocial = !!(
    formData.instagram_url || formData.tiktok_url || formData.youtube_url ||
    formData.facebook_url || formData.linkedin_url || formData.x_url ||
    formData.other_social_url || formData.website_url
  );

  return (
    <Accordion type="single" collapsible defaultValue={defaultSection}>
      {/* Profile */}
      <SettingsSection
        value="profile"
        icon="👤"
        title="Profile"
        subtitle="Name, bio, avatar, location"
      >
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Name</Label>
          <Input
            value={formData.creator_name}
            onChange={e => onInputChange('creator_name', e.target.value)}
            onBlur={onFieldBlur}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Bio</Label>
          <Textarea
            value={formData.bio}
            onChange={e => onInputChange('bio', e.target.value)}
            onBlur={onFieldBlur}
            rows={3}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Skills</Label>
          <div className="mt-1">
            <SkillsSelection selectedSkills={selectedSkills} onSkillChange={onSkillChange} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">City</Label>
            <Input
              value={formData.city}
              onChange={e => onInputChange('city', e.target.value)}
              onBlur={onFieldBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Country</Label>
            <Input
              value={formData.country}
              onChange={e => onInputChange('country', e.target.value)}
              onBlur={onFieldBlur}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Timezone</Label>
          <Select value={formData.timezone} onValueChange={val => { onInputChange('timezone', val); onFieldBlur(); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select timezone" /></SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map(tz => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>

      {/* Rates & Availability */}
      <SettingsSection
        value="rates"
        icon="💰"
        title="Rates & Availability"
        subtitle="Hourly rate, budget, availability"
        nudge={hasRates ? undefined : 'Add your rates to get matched faster →'}
        accentColor="teal"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Hourly rate ($)</Label>
            <Input
              type="number"
              value={formData.base_rate_per_hour}
              onChange={e => onInputChange('base_rate_per_hour', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="50"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Min budget ($)</Label>
            <Input
              type="number"
              value={formData.min_project_budget}
              onChange={e => onInputChange('min_project_budget', e.target.value)}
              onBlur={onFieldBlur}
              placeholder="500"
              className="mt-1"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Max projects/month</Label>
            <Select value={formData.max_projects_per_month} onValueChange={val => { onInputChange('max_projects_per_month', val); onFieldBlur(); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {['1', '2', '3', '4', '5', '6+'].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Preferred duration</Label>
            <Select value={formData.preferred_project_duration} onValueChange={val => { onInputChange('preferred_project_duration', val); onFieldBlur(); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {['1 week', '1-2 weeks', '2-4 weeks', '1-2 months', '2-3 months', '3+ months', 'Ongoing'].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Availability</Label>
          <Textarea
            value={formData.availability}
            onChange={e => onInputChange('availability', e.target.value)}
            onBlur={onFieldBlur}
            rows={2}
            placeholder="e.g., Available weekdays 9am-5pm EST"
            className="mt-1"
          />
        </div>
      </SettingsSection>

      {/* Portfolio */}
      <SettingsSection
        value="portfolio"
        icon="🎨"
        title="Portfolio"
        subtitle={`${portfolioPaths.length} work sample${portfolioPaths.length !== 1 ? 's' : ''}`}
        nudge={hasPortfolio ? undefined : 'Upload work samples to stand out →'}
        accentColor="teal"
      >
        <PortfolioUpload
          portfolioPaths={portfolioPaths}
          onPortfolioPathsChange={onPortfolioPathsChange}
        />
      </SettingsSection>

      {/* Social Links */}
      <SettingsSection
        value="social"
        icon="🔗"
        title="Social Links"
        subtitle="Instagram, TikTok, YouTube & more"
        nudge={hasSocial ? undefined : undefined}
      >
        <CreatorSocialMediaLinks
          formData={formData}
          onInputChange={onInputChange}
        />
      </SettingsSection>

      {/* Payments */}
      <SettingsSection
        value="payments"
        icon="💳"
        title="Payments"
        subtitle="Stripe payout settings"
      >
        <p className="text-sm text-gray-500">
          Payment settings are managed through Stripe Connect. Visit your dashboard to set up or manage payouts.
        </p>
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        value="privacy"
        icon="🔒"
        title="Privacy"
        subtitle="Visibility, DragonFeed opt-in"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Profile visibility</div>
            <div className="text-xs text-gray-400">Public profiles appear in search</div>
          </div>
          <Select value={formData.profile_visibility || 'public'} onValueChange={val => { onInputChange('profile_visibility', val); onFieldBlur(); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">DragonFeed Showcase</div>
            <div className="text-xs text-gray-400">Display portfolio in DragonFeed</div>
          </div>
          <Switch
            checked={formData.allow_portfolio_in_feed === true || formData.allow_portfolio_in_feed === 'true'}
            onCheckedChange={checked => { onInputChange('allow_portfolio_in_feed', checked); onFieldBlur(); }}
          />
        </div>
      </SettingsSection>
    </Accordion>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/CreatorSettingsSections.tsx
git commit -m "feat: add CreatorSettingsSections accordion component"
```

---

## Task 7: Create Business Settings Sections

**Files:**
- Create: `src/components/settings/BusinessSettingsSections.tsx`
- Reuse: `src/components/business-profile/SocialMediaLinks.tsx`, `src/components/business-profile/FileUploadSection.tsx`

- [ ] **Step 1: Create the sections component**

```typescript
// src/components/settings/BusinessSettingsSections.tsx
import { Accordion } from '@/components/ui/accordion';
import { SettingsSection } from './SettingsSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SocialMediaLinks } from '@/components/business-profile/SocialMediaLinks';
import { FileUploadSection } from '@/components/business-profile/FileUploadSection';
import { RestaurantPaymentSettings } from '@/components/payments/RestaurantPaymentSettings';
import { ToastConnectionCard } from '@/components/toast/ToastConnectionCard';
import type { BusinessProfileFormData } from '@/hooks/useBusinessProfileForm';
import type { CompletionResult } from '@/hooks/useProfileCompletion';

interface BusinessSettingsSectionsProps {
  formData: BusinessProfileFormData;
  logoFile: File | null;
  completion: CompletionResult;
  onInputChange: (field: string, value: string) => void;
  onLogoChange: (file: File | null) => void;
  onFieldBlur: () => void;
  defaultSection?: string;
}

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

const TIMEZONE_OPTIONS = [
  { value: 'UTC-12', label: 'UTC-12 (Baker Island)' },
  { value: 'UTC-11', label: 'UTC-11 (Samoa)' },
  { value: 'UTC-10', label: 'UTC-10 (Hawaii)' },
  { value: 'UTC-9', label: 'UTC-9 (Alaska)' },
  { value: 'UTC-8', label: 'UTC-8 (Pacific)' },
  { value: 'UTC-7', label: 'UTC-7 (Mountain)' },
  { value: 'UTC-6', label: 'UTC-6 (Central)' },
  { value: 'UTC-5', label: 'UTC-5 (Eastern)' },
  { value: 'UTC-4', label: 'UTC-4 (Atlantic)' },
  { value: 'UTC-3', label: 'UTC-3 (Argentina)' },
  { value: 'UTC-2', label: 'UTC-2 (Mid-Atlantic)' },
  { value: 'UTC-1', label: 'UTC-1 (Azores)' },
  { value: 'UTC+0', label: 'UTC+0 (London)' },
  { value: 'UTC+1', label: 'UTC+1 (Paris)' },
  { value: 'UTC+2', label: 'UTC+2 (Cairo)' },
  { value: 'UTC+3', label: 'UTC+3 (Moscow)' },
  { value: 'UTC+4', label: 'UTC+4 (Dubai)' },
  { value: 'UTC+5', label: 'UTC+5 (Karachi)' },
  { value: 'UTC+5:30', label: 'UTC+5:30 (Mumbai)' },
  { value: 'UTC+6', label: 'UTC+6 (Dhaka)' },
  { value: 'UTC+7', label: 'UTC+7 (Bangkok)' },
  { value: 'UTC+8', label: 'UTC+8 (Singapore)' },
  { value: 'UTC+9', label: 'UTC+9 (Tokyo)' },
  { value: 'UTC+10', label: 'UTC+10 (Sydney)' },
  { value: 'UTC+11', label: 'UTC+11 (Solomon Islands)' },
  { value: 'UTC+12', label: 'UTC+12 (Auckland)' },
];

const COLLABORATION_STYLES = [
  { value: 'hands-on', label: 'Hands-on' },
  { value: 'minimal-oversight', label: 'Minimal oversight' },
  { value: 'regular-checkins', label: 'Regular check-ins' },
  { value: 'milestone-based', label: 'Milestone-based' },
  { value: 'flexible', label: 'Flexible' },
];

const BUDGET_OPTIONS = [
  { value: 'under_1k', label: 'Under $1K' },
  { value: '1k_5k', label: '$1K - $5K' },
  { value: '5k_10k', label: '$5K - $10K' },
  { value: '10k_25k', label: '$10K - $25K' },
  { value: '25k_50k', label: '$25K - $50K' },
  { value: '50k_plus', label: '$50K+' },
];

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
  const hasSocial = !!(
    formData.instagram_url || formData.tiktok_url || formData.youtube_url ||
    formData.facebook_url || formData.linkedin_url || formData.x_url ||
    formData.other_social_url
  );

  return (
    <Accordion type="single" collapsible defaultValue={defaultSection}>
      {/* Business Info */}
      <SettingsSection
        value="business-info"
        icon="🏢"
        title="Business Info"
        subtitle="Name, industry, logo, location"
      >
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Business name</Label>
          <Input
            value={formData.business_name}
            onChange={e => onInputChange('business_name', e.target.value)}
            onBlur={onFieldBlur}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Industry</Label>
          <Select value={formData.industry} onValueChange={val => { onInputChange('industry', val); onFieldBlur(); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select industry" /></SelectTrigger>
            <SelectContent>
              {INDUSTRY_OPTIONS.map(ind => (
                <SelectItem key={ind.value} value={ind.value}>{ind.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">City</Label>
            <Input
              value={formData.city}
              onChange={e => onInputChange('city', e.target.value)}
              onBlur={onFieldBlur}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-500">Country</Label>
            <Input
              value={formData.country}
              onChange={e => onInputChange('country', e.target.value)}
              onBlur={onFieldBlur}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Timezone</Label>
          <Select value={formData.timezone} onValueChange={val => { onInputChange('timezone', val); onFieldBlur(); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select timezone" /></SelectTrigger>
            <SelectContent>
              {TIMEZONE_OPTIONS.map(tz => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>

      {/* About & Goals */}
      <SettingsSection
        value="about"
        icon="📝"
        title="About & Goals"
        subtitle="Description, objectives, collaboration style"
        nudge={hasDescription ? undefined : 'Tell creators what you\'re looking for →'}
        accentColor="pink"
      >
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Description</Label>
          <Textarea
            value={formData.description}
            onChange={e => onInputChange('description', e.target.value)}
            onBlur={onFieldBlur}
            rows={4}
            placeholder="Tell creators about your business..."
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Brand category</Label>
          <Input
            value={formData.brandCategory || ''}
            onChange={e => onInputChange('brandCategory', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="e.g., Food & Beverage"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Marketing objectives</Label>
          <Textarea
            value={formData.marketingObjectives || ''}
            onChange={e => onInputChange('marketingObjectives', e.target.value)}
            onBlur={onFieldBlur}
            rows={3}
            placeholder="What are your marketing goals?"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Collaboration style</Label>
          <Select value={formData.preferred_collaboration_style} onValueChange={val => { onInputChange('preferred_collaboration_style', val); onFieldBlur(); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select style" /></SelectTrigger>
            <SelectContent>
              {COLLABORATION_STYLES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Sponsorship budget</Label>
          <Input
            type="number"
            value={formData.sponsorshipBudget || ''}
            onChange={e => onInputChange('sponsorshipBudget', e.target.value)}
            onBlur={onFieldBlur}
            placeholder="Annual budget"
            className="mt-1"
          />
        </div>
      </SettingsSection>

      {/* Sample Content */}
      <SettingsSection
        value="samples"
        icon="📷"
        title="Sample Content"
        subtitle="Brand assets and style references"
        nudge={undefined}
        accentColor="pink"
      >
        <FileUploadSection
          formData={formData}
          onInputChange={onInputChange}
        />
      </SettingsSection>

      {/* Social Links */}
      <SettingsSection
        value="social"
        icon="🔗"
        title="Social Links"
        subtitle="Instagram, TikTok, YouTube & more"
      >
        <SocialMediaLinks
          formData={formData}
          onInputChange={onInputChange}
        />
      </SettingsSection>

      {/* Payments */}
      <SettingsSection
        value="payments"
        icon="💳"
        title="Payments"
        subtitle="Stripe, budget range"
      >
        <div>
          <Label className="text-xs uppercase tracking-wider text-gray-500">Budget range</Label>
          <Select value={formData.budget_range} onValueChange={val => { onInputChange('budget_range', val); onFieldBlur(); }}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Select budget range" /></SelectTrigger>
            <SelectContent>
              {BUDGET_OPTIONS.map(b => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RestaurantPaymentSettings />
      </SettingsSection>

      {/* Integrations */}
      <SettingsSection
        value="integrations"
        icon="🔌"
        title="Integrations"
        subtitle="Toast POS connection"
      >
        <ToastConnectionCard />
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection
        value="privacy"
        icon="🔒"
        title="Privacy"
        subtitle="Profile visibility"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Profile visibility</div>
            <div className="text-xs text-gray-400">Public profiles appear in search</div>
          </div>
          <Select value={formData.profile_visibility || 'public'} onValueChange={val => { onInputChange('profile_visibility', val); onFieldBlur(); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="private">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>
    </Accordion>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/BusinessSettingsSections.tsx
git commit -m "feat: add BusinessSettingsSections accordion component"
```

---

## Task 8: Rewrite CreatorSettings Page

**Files:**
- Modify: `src/pages/CreatorSettings.tsx`
- Reuse: `src/hooks/useCreatorProfileForm.ts`, `src/hooks/useCreatorProfileSubmit.ts`

- [ ] **Step 1: Rewrite CreatorSettings with accordion layout**

```typescript
// src/pages/CreatorSettings.tsx
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';
import { useCreatorProfileLoad } from '@/hooks/useCreatorProfileLoad';
import { useProfileCompletion, calculateCreatorCompletion } from '@/hooks/useProfileCompletion';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { CreatorSettingsSections } from '@/components/settings/CreatorSettingsSections';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function CreatorSettings() {
  const { submitProfile, loading } = useCreatorProfileSubmit();
  const {
    formData,
    selectedSkills,
    avatarFile,
    portfolioPaths,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
  } = useCreatorProfileForm();

  const { user } = useCreatorProfileLoad({
    formData,
    selectedSkills,
    setFormData: handleInputChange,
    setSelectedSkills: handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
  });

  const [searchParams] = useSearchParams();
  const [targetSection, setTargetSection] = useState<string | undefined>();

  // Handle Stripe onboarding return
  useEffect(() => {
    if (searchParams.get('stripe_onboarding') === 'complete') {
      toast.success('Stripe onboarding complete!');
    }
    if (searchParams.get('stripe_refresh') === 'true') {
      toast.info('Please complete your Stripe onboarding.');
    }
  }, [searchParams]);

  const completion = calculateCreatorCompletion({
    creator_name: formData.creator_name,
    bio: formData.bio,
    skills: selectedSkills,
    avatar_url: formData.avatar_url,
    base_rate_per_hour: formData.base_rate_per_hour ? Number(formData.base_rate_per_hour) : null,
    portfolio_urls: portfolioPaths.length > 0 ? portfolioPaths : null,
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    website_url: formData.website_url || null,
    city: formData.city || null,
    country: formData.country || null,
  });

  const handleFieldBlur = useCallback(async () => {
    if (!user) return;
    const success = await submitProfile(formData, selectedSkills, avatarFile, portfolioPaths, true);
    if (success) {
      toast.success('Saved', { duration: 1500 });
    }
  }, [formData, selectedSkills, avatarFile, portfolioPaths, user, submitProfile]);

  const handleNudgeClick = () => {
    setTargetSection(completion.nextSection);
  };

  return (
    <div className="min-h-screen bg-gray-400 p-4">
      <div className="max-w-lg mx-auto">
        <ProfileCompletionBar
          avatarUrl={formData.avatar_url}
          displayName={formData.creator_name || 'Creator'}
          roleLabel={selectedSkills.length > 0 ? selectedSkills.map(s => s.replace(/_/g, ' ')).join(', ') : 'Content Creator'}
          completion={completion}
          isCreator={true}
          onNudgeClick={handleNudgeClick}
        />
        <CreatorSettingsSections
          formData={formData}
          selectedSkills={selectedSkills}
          avatarFile={avatarFile}
          portfolioPaths={portfolioPaths}
          completion={completion}
          onInputChange={handleInputChange}
          onSkillChange={handleSkillChange}
          onAvatarFileChange={setAvatarFile}
          onPortfolioPathsChange={setPortfolioPaths}
          onFieldBlur={handleFieldBlur}
          defaultSection={targetSection}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` or check the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CreatorSettings.tsx
git commit -m "feat: rewrite CreatorSettings with accordion layout and completion bar"
```

---

## Task 9: Rewrite BusinessSettings Page

**Files:**
- Modify: `src/pages/BusinessSettings.tsx`
- Reuse: `src/hooks/useBusinessProfileForm.ts`, `src/hooks/useBusinessProfileSubmit.ts`

- [ ] **Step 1: Rewrite BusinessSettings with accordion layout**

```typescript
// src/pages/BusinessSettings.tsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { calculateBusinessCompletion } from '@/hooks/useProfileCompletion';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { BusinessSettingsSections } from '@/components/settings/BusinessSettingsSections';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function BusinessSettings() {
  const { user } = useAuth();
  const { formData, logoFile, handleInputChange, setLogoFile, setFormDataFromProfile } = useBusinessProfileForm();
  const { submitProfile, loading } = useBusinessProfileSubmit();
  const [targetSection, setTargetSection] = useState<string | undefined>();

  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      const { data } = await supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setFormDataFromProfile(data);
      }
    };

    loadProfile();
  }, [user]);

  const isBrand = user?.user_metadata?.role === 'brand';

  const completion = calculateBusinessCompletion({
    business_name: formData.business_name,
    industry: formData.industry || null,
    logo_url: formData.logo_url || null,
    description: formData.description || null,
    sample_content_urls: null, // loaded separately
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    budget_range: formData.budget_range || null,
  });

  const handleFieldBlur = useCallback(async () => {
    if (!user) return;
    const success = await submitProfile(formData, logoFile, user.id, isBrand);
    if (success) {
      toast.success('Saved', { duration: 1500 });
    }
  }, [formData, logoFile, user, isBrand, submitProfile]);

  const handleNudgeClick = () => {
    setTargetSection(completion.nextSection);
  };

  return (
    <div className="min-h-screen bg-gray-400 p-4">
      <div className="max-w-lg mx-auto">
        <ProfileCompletionBar
          avatarUrl={formData.logo_url}
          displayName={formData.business_name || 'Business'}
          roleLabel={formData.industry ? formData.industry.replace(/_/g, ' ') : 'Business'}
          completion={completion}
          isCreator={false}
          onNudgeClick={handleNudgeClick}
        />
        <BusinessSettingsSections
          formData={formData}
          logoFile={logoFile}
          completion={completion}
          onInputChange={handleInputChange}
          onLogoChange={setLogoFile}
          onFieldBlur={handleFieldBlur}
          defaultSection={targetSection}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit` or check the dev server.

- [ ] **Step 3: Commit**

```bash
git add src/pages/BusinessSettings.tsx
git commit -m "feat: rewrite BusinessSettings with accordion layout, absorb brand fields"
```

---

## Task 10: Update App.tsx Routes

**Files:**
- Modify: `src/App.tsx` (lines 115-512 — route table)

- [ ] **Step 1: Add ProfileSetup import and route**

At the top of App.tsx, add the lazy import for ProfileSetup:

```typescript
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
```

- [ ] **Step 2: Replace onboarding and setup routes**

In the route table section (around lines 136-171), replace the existing onboarding/setup routes:

**Remove these routes:**
```typescript
// DELETE: /profile/onboarding → ProfileOnboarding
// DELETE: /profile/business → BusinessProfileSetup
// DELETE: /business-profile-setup → BusinessProfileSetup
// DELETE: /profile/brand → BrandProfileSetup
// DELETE: /brand-profile-setup → BrandProfileSetup
// DELETE: /profile/creator → CreatorProfileSetup
// DELETE: /creator-profile-setup → CreatorProfileSetup
```

**Add these routes:**
```tsx
{/* Unified setup page */}
<Route path="/profile/setup" element={
  <VerifiedRoute>
    <ProfileSetup />
  </VerifiedRoute>
} />

{/* Redirects from old routes */}
<Route path="/profile/onboarding" element={<Navigate to="/profile/setup" replace />} />
<Route path="/profile/creator" element={<Navigate to="/profile/setup" replace />} />
<Route path="/profile/business" element={<Navigate to="/profile/setup" replace />} />
<Route path="/profile/brand" element={<Navigate to="/profile/setup" replace />} />
<Route path="/business-profile-setup" element={<Navigate to="/profile/setup" replace />} />
<Route path="/brand-profile-setup" element={<Navigate to="/profile/setup" replace />} />
<Route path="/creator-profile-setup" element={<Navigate to="/profile/setup" replace />} />
```

- [ ] **Step 3: Redirect brand settings to business settings**

Replace the brand settings route (around line 372-378):

```tsx
{/* Redirect brand settings to business settings */}
<Route path="/dashboard/brand/settings" element={<Navigate to="/dashboard/business/settings" replace />} />
```

- [ ] **Step 4: Remove unused lazy imports**

Remove these imports from the top of App.tsx:
```typescript
// DELETE these lazy imports:
// const ProfileOnboarding = lazy(() => import('./pages/ProfileOnboarding'));
// const CreatorProfileSetup = lazy(() => import('./pages/CreatorProfileSetup'));
// const BusinessProfileSetup = lazy(() => import('./pages/BusinessProfileSetup'));
// const BrandProfileSetup = lazy(() => import('./pages/BrandProfileSetup'));
// const BrandSettings = lazy(() => import('./pages/BrandSettings'));
```

- [ ] **Step 5: Verify the app builds**

Run: `npm run build`
Expected: Build succeeds. May see warnings about unused files but no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: update routes — add /profile/setup, redirect old paths, remove brand settings"
```

---

## Task 11: Delete Old Files

**Files to delete:**
- `src/components/onboarding/OnboardingWizard.tsx`
- `src/components/onboarding/OnboardingStep.tsx`
- `src/components/onboarding/steps/WelcomeStep.tsx`
- `src/components/onboarding/steps/ProfileTourStep.tsx`
- `src/components/onboarding/steps/CampaignCreationStep.tsx`
- `src/components/onboarding/steps/CreatorDiscoveryStep.tsx`
- `src/components/onboarding/steps/MessagingStep.tsx`
- `src/components/onboarding/steps/ApplicationStep.tsx`
- `src/components/onboarding/steps/CampaignBrowsingStep.tsx`
- `src/components/onboarding/steps/CreatorProfileStep.tsx`
- `src/components/onboarding/steps/ProjectManagementStep.tsx`
- `src/pages/ProfileOnboarding.tsx`
- `src/pages/BrandProfileSetup.tsx`
- `src/pages/BrandSettings.tsx`
- `src/pages/CreatorProfileSetup.tsx`
- `src/pages/BusinessProfileSetup.tsx`
- `src/components/brand-profile/BrandProfileSetupForm.tsx`
- `src/hooks/useOnboardingProgress.ts`
- `src/components/creator-profile/CreatorSettingsForm.tsx` (replaced by CreatorSettingsSections)
- `src/components/business-profile/BusinessSettingsForm.tsx` (replaced by BusinessSettingsSections)

- [ ] **Step 1: Delete onboarding wizard files**

```bash
rm -rf src/components/onboarding/
```

- [ ] **Step 2: Delete old setup and settings pages**

```bash
rm src/pages/ProfileOnboarding.tsx
rm src/pages/BrandProfileSetup.tsx
rm src/pages/BrandSettings.tsx
rm src/pages/CreatorProfileSetup.tsx
rm src/pages/BusinessProfileSetup.tsx
```

- [ ] **Step 3: Delete old form components**

```bash
rm src/components/brand-profile/BrandProfileSetupForm.tsx
rm src/components/creator-profile/CreatorSettingsForm.tsx
rm src/components/business-profile/BusinessSettingsForm.tsx
rm src/hooks/useOnboardingProgress.ts
```

- [ ] **Step 4: Check for broken imports**

Run: `npm run build`
Expected: Build succeeds. If any file still imports a deleted module, fix the import.

- [ ] **Step 5: Grep for any remaining references to deleted files**

```bash
npx grep -r "OnboardingWizard\|OnboardingStep\|ProfileOnboarding\|BrandProfileSetup\|BrandSettings\|useOnboardingProgress\|CreatorSettingsForm\|BusinessSettingsForm\|BrandProfileSetupForm" src/
```

Fix any remaining references found.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: delete old onboarding wizard, brand pages, and replaced form components"
```

---

## Task 12: Clean Up localStorage and Verify

**Files:**
- Reference: `src/hooks/useOnboardingProgress.ts` (already deleted — check what keys it used)

- [ ] **Step 1: Search for localStorage onboarding keys**

```bash
npx grep -r "localStorage.*onboarding\|onboarding.*localStorage" src/
```

If any references remain, remove them.

- [ ] **Step 2: Run full build**

```bash
npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: All tests pass (including the new useAutoDetect and useProfileCompletion tests).

- [ ] **Step 4: Manual smoke test**

Start dev server: `npm run dev`

Test these flows:
1. Navigate to `/profile/setup` — should show role-adaptive single-screen form
2. Navigate to `/profile/onboarding` — should redirect to `/profile/setup`
3. Navigate to `/profile/creator` — should redirect to `/profile/setup`
4. Navigate to `/profile/brand` — should redirect to `/profile/setup`
5. Navigate to `/dashboard/creator/settings` — should show accordion settings with completion bar
6. Navigate to `/dashboard/business/settings` — should show accordion settings with completion bar
7. Navigate to `/dashboard/brand/settings` — should redirect to `/dashboard/business/settings`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: clean up remaining references and verify build"
```

---

## Export: CompletionResult Type

Note: Task 4 (ProfileCompletionBar) imports `CompletionResult` from `useProfileCompletion.ts`. Ensure this type is exported from the hook:

```typescript
export interface CompletionResult {
  percentage: number;
  nextNudge: string;
  nextSection: string;
}
```

This is already handled in Task 2's implementation — just confirming the export is present.
