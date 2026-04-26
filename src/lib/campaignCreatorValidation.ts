import { z } from 'zod';

const contentTypeSchema = z.enum(['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short']);
const platformSchema = z.enum(['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform']);
const aspectRatioSchema = z.enum(['9:16', '16:9', '1:1', '4:5']);
const deliveryTierSchema = z.enum(['dragondash', 'express', 'standard']);
const campaignTypeSchema = z.enum(['ugc_content', 'launch_hype', 'ongoing_presence', 'event_promo', 'seasonal']);

export const ideaDeliverableSchema = z.object({
  description: z.string(),
  content_type: contentTypeSchema.catch('video_reel'),
  platform: platformSchema.catch('instagram'),
  aspect_ratio: aspectRatioSchema.catch('9:16'),
  estimated_duration: z.number().nullish(),
});

export const businessContextSchema = z.object({
  source_url: z.string().default(''),
  source_type: z.enum(['google_business', 'instagram', 'website', 'yelp', 'photo', 'manual']).catch('website'),
  business_name: z.string(),
  cuisine_type: z.string().nullish(),
  location: z.object({
    city: z.string().default(''),
    state: z.string().nullish(),
    country: z.string().default(''),
  }).catch({ city: '', state: null, country: '' }),
  rating: z.number().nullish(),
  review_count: z.number().nullish(),
  price_range: z.enum(['$', '$$', '$$$', '$$$$']).nullish(),
  photos: z.array(z.string()).default([]),
  vibe_tags: z.array(z.string()).default([]),
  hours: z.record(z.string()).nullish(),
  social_links: z.object({
    instagram: z.string().nullish(),
    tiktok: z.string().nullish(),
    website: z.string().nullish(),
  }).nullish(),
  review_highlights: z.array(z.string()).default([]),
});

export const campaignIdeaSchema = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  description: z.string(),
  tagline: z.string().optional().default(''),
  campaign_type: campaignTypeSchema.catch('ugc_content'),
  recommended_platforms: z.array(platformSchema).min(1),
  deliverables: z.array(ideaDeliverableSchema).min(1),
  budget_range: z.object({ min: z.number(), max: z.number() }),
  timeline_days: z.number().positive(),
  tier: deliveryTierSchema.catch('standard'),
  tier_reasoning: z.string(),
  style_direction: z.string(),
  target_creator_persona: z.array(z.string()),
  key_messages: z.array(z.string()),
  hashtags: z.array(z.string()),
});

export const donnyGenerateResponseSchema = z.object({
  business_context: businessContextSchema,
  campaign_ideas: z.array(campaignIdeaSchema).min(1).max(5),
});

export const launchValidationSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  platforms: z.array(platformSchema).min(1, 'Select at least one platform'),
  deliverables: z.array(z.object({
    id: z.string(),
    content_type: contentTypeSchema.catch('video_reel'),
    platform: platformSchema.catch('instagram'),
    aspect_ratio: aspectRatioSchema.catch('9:16'),
    max_duration_seconds: z.number().nullish(),
    description: z.string().nullish(),
  })).min(1, 'At least one deliverable required'),
  budget_min: z.number().positive('Budget must be positive'),
  budget_max: z.number().positive('Budget must be positive'),
  deadline: z.string().refine(
    (d) => new Date(d) > new Date(),
    'Deadline must be in the future'
  ),
  delivery_type: z.enum(['standard', 'expedited', 'dragonrush']),
  tagline: z.string().max(120).optional().default(''),
  per_creator_cap: z.number().min(0).optional().default(0),
  usage_rights_days: z.number().min(0).optional().default(30),
  exclusivity_days: z.number().min(0).optional().default(0),
  geographic_scope: z.enum(['city', 'region', 'national']).optional().default('city'),
  target_creator_count: z.number().min(1).optional().default(2),
});
