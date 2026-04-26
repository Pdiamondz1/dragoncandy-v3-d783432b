export interface CompletionResult {
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

interface Section<T> {
  key: string;
  weight: number;
  section: string;
  nudge: string;
  check: (p: T) => boolean;
}

const CREATOR_SECTIONS: Section<CreatorCompletionInput>[] = [
  {
    key: 'essentials',
    weight: 35,
    section: 'profile',
    nudge: 'Complete your name, bio, and skills to go live',
    check: (p) => !!(p.creator_name && p.bio && p.skills?.length),
  },
  {
    key: 'rates',
    weight: 20,
    section: 'rates',
    nudge: 'Add your rates to appear in more searches',
    check: (p) => p.base_rate_per_hour != null && p.base_rate_per_hour > 0,
  },
  {
    key: 'avatar',
    weight: 15,
    section: 'profile',
    nudge: 'Add a profile photo — profiles with photos get 3x more views',
    check: (p) => !!p.avatar_url,
  },
  {
    key: 'portfolio',
    weight: 15,
    section: 'portfolio',
    nudge: 'Upload work samples to stand out',
    check: (p) => !!(p.portfolio_urls && p.portfolio_urls.length > 0),
  },
  {
    key: 'social',
    weight: 10,
    section: 'social',
    nudge: 'Link a social account to build trust with brands',
    check: (p) =>
      !!(
        p.instagram_url ||
        p.tiktok_url ||
        p.youtube_url ||
        p.facebook_url ||
        p.linkedin_url ||
        p.x_url ||
        p.other_social_url ||
        p.website_url
      ),
  },
  {
    key: 'location',
    weight: 5,
    section: 'profile',
    nudge: 'Add your location to get local campaign matches',
    check: (p) => !!(p.city || p.country),
  },
];

const BUSINESS_SECTIONS: Section<BusinessCompletionInput>[] = [
  {
    key: 'essentials',
    weight: 30,
    section: 'business-info',
    nudge: 'Add your business name and industry to get started',
    check: (p) => !!(p.business_name && p.industry),
  },
  {
    key: 'about',
    weight: 20,
    section: 'about',
    nudge: "Tell creators what you're looking for",
    check: (p) => !!p.description,
  },
  {
    key: 'logo',
    weight: 15,
    section: 'business-info',
    nudge: 'Add your logo — branded profiles attract top creators',
    check: (p) => !!p.logo_url,
  },
  {
    key: 'samples',
    weight: 15,
    section: 'samples',
    nudge: 'Show creators your brand style with sample content',
    check: (p) => !!(p.sample_content_urls && p.sample_content_urls.length > 0),
  },
  {
    key: 'social',
    weight: 10,
    section: 'social',
    nudge: 'Link a social account so creators can see your brand',
    check: (p) =>
      !!(
        p.instagram_url ||
        p.tiktok_url ||
        p.youtube_url ||
        p.facebook_url ||
        p.linkedin_url ||
        p.x_url ||
        p.other_social_url
      ),
  },
  {
    key: 'payments',
    weight: 10,
    section: 'payments',
    nudge: 'Set up payments to start hiring creators',
    check: (p) => !!p.budget_range,
  },
];

function calculate<T>(sections: Section<T>[], profile: T): CompletionResult {
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
