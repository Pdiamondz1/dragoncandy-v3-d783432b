export type TierName = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';

export interface TierFeature {
  key: string;
  label: string;
  description: string;
  requiredTier: TierName;
  rateLimit?: { limit: number; periodDays: number };
}

export const TIER_FEATURES: TierFeature[] = [
  { key: 'brief_generation', label: 'Campaign Brief Generation', description: 'AI-generated campaign briefs from your URL', requiredTier: 'free', rateLimit: { limit: 1, periodDays: 7 } },
  { key: 'match_report', label: 'Creator Match Report', description: 'Top 5 creators ranked and scored for your brief', requiredTier: 'free', rateLimit: { limit: 1, periodDays: 30 } },
  { key: 'campaign_templates', label: 'Sponsored Templates', description: 'Pre-built campaign templates to customize', requiredTier: 'free' },
  { key: 'creator_delivery', label: 'Creator Delivery', description: 'Hire creators to deliver content for your campaigns', requiredTier: 'starter' },
  { key: 'basic_analytics', label: 'Basic Analytics', description: 'Campaign performance and engagement data', requiredTier: 'starter' },
  { key: 'dragondash', label: 'DragonDash', description: 'Same-day creator content delivery', requiredTier: 'growth' },
  { key: 'advanced_analytics', label: 'Advanced Analytics', description: 'Deep engagement, ROI, and audience insights', requiredTier: 'growth' },
  { key: 'multi_unit', label: 'Multi-Unit Management', description: 'Manage multiple locations or products', requiredTier: 'growth' },
  { key: 'api_access', label: 'API Access', description: 'Programmatic access to DragonCandy features', requiredTier: 'pro' },
  { key: 'custom_branding', label: 'Custom Branding', description: 'White-label campaigns with your brand', requiredTier: 'pro' },
  { key: 'priority_support', label: 'Priority Support', description: 'Dedicated support with faster response times', requiredTier: 'pro' },
  { key: 'donny_assisted', label: 'Donny Assisted Mode', description: 'Donny drafts posts and suggests actions for your review', requiredTier: 'starter' },
  { key: 'donny_auto_pilot', label: 'Donny Auto-Pilot', description: 'Donny generates, schedules, and publishes content autonomously', requiredTier: 'growth' },
  { key: 'dragondash_rush', label: 'DragonDash Rush Posting', description: 'Simultaneous multi-platform posting with AI-written captions', requiredTier: 'starter' },
];

export const TIER_ORDER: TierName[] = ['free', 'starter', 'growth', 'pro', 'enterprise'];

export const TIER_PRICES: Record<TierName, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 149, annual: 119 },
  growth: { monthly: 449, annual: 359 },
  pro: { monthly: 899, annual: 719 },
  enterprise: { monthly: 0, annual: 0 },
};

export const DONNY_ACTION_BUDGETS: Record<TierName, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  pro: 10000,
  enterprise: 50000,
};

export const DONNY_AUTOMATION_LEVELS: Record<TierName, 'manual' | 'assisted' | 'auto_pilot'> = {
  free: 'manual',
  starter: 'assisted',
  growth: 'auto_pilot',
  pro: 'auto_pilot',
  enterprise: 'auto_pilot',
};

export function getFeature(key: string): TierFeature | undefined {
  return TIER_FEATURES.find(f => f.key === key);
}

export function tierMeetsRequirement(currentTier: TierName, requiredTier: TierName): boolean {
  return TIER_ORDER.indexOf(currentTier) >= TIER_ORDER.indexOf(requiredTier);
}
