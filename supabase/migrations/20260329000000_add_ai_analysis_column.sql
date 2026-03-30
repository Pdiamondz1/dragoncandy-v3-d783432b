-- Store the full AI-generated campaign analysis as JSONB
-- Includes: content_ideas, hashtags, captions, key_messages, success_metrics,
-- timeline_recommendations, budget_recommendations, posting_schedule, style_direction
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
