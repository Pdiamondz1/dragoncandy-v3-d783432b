// src/types/campaignMedia.ts

export type ContentSource = 'creator_shoots' | 'business_footage' | 'hybrid';
export type MediaType = 'reference_image' | 'reference_video' | 'ai_preview' | 'raw_footage';
export type ContentType = 'photo' | 'video_reel' | 'story' | 'carousel' | 'tiktok' | 'youtube_short';
export type Platform = 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'google_business' | 'multi_platform';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type DeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved';
export type AIPreviewStatus = 'none' | 'generating' | 'ready' | 'approved' | 'rejected';

export type DeliveryTier = 'dragondash' | 'express' | 'standard';

export const TIER_LIMITS = {
  dragondash: {
    maxDeliverables: 2,
    contentTypes: ['photo', 'video_reel'] as ContentType[],
    timeframe: '1–3 hours',
    label: 'DragonDash',
    fee: 75,
    estimatedCreationTime: '~90 min',
  },
  express: {
    maxDeliverables: 4,
    contentTypes: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'] as ContentType[],
    timeframe: '24–48 hours',
    label: 'Express',
    fee: 25,
    estimatedCreationTime: '~1–2 days',
  },
  standard: {
    maxDeliverables: 10,
    contentTypes: ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'] as ContentType[],
    timeframe: '5–7 days',
    label: 'Standard',
    fee: 0,
    estimatedCreationTime: '~4–5 days',
  },
} as const;

export interface CampaignMediaItem {
  id: string;
  campaign_id: string;
  uploaded_by: string;
  media_type: MediaType;
  file_url: string;
  file_name: string;
  file_size_bytes?: number;
  mime_type?: string;
  duration_seconds?: number;
  thumbnail_url?: string;
  sort_order: number;
  ai_analysis?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CampaignDeliverable {
  id: string;
  campaign_id: string;
  content_type: ContentType;
  platform: Platform;
  description?: string;
  aspect_ratio: AspectRatio;
  max_duration_seconds?: number;
  status: DeliverableStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Client-side staged file (before upload to Supabase) */
export interface StagedFile {
  file: File;
  preview: string;
  name: string;
  size: number;
  type: string;
  duration?: number;
}

/** Client-side deliverable (before saving to DB) */
export interface Deliverable {
  id: string;
  content_type: ContentType;
  platform: Platform;
  aspect_ratio: AspectRatio;
  max_duration_seconds?: number;
  description?: string;
}

/** MoodBoard data from Edge Function */
export interface MoodBoardData {
  title: string;
  color_palette: string[];
  typography?: { heading: string; body: string };
  layout_description: string;
  reference_descriptions?: string[];
}

/** Storyboard frame from Edge Function */
export interface StoryboardFrame {
  frame_number: number;
  scene_description: string;
  duration_seconds?: number;
  camera_angle?: string;
  text_overlay?: string;
  transition?: string;
}
