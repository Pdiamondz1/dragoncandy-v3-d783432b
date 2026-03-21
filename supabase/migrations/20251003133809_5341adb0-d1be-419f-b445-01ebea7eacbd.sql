-- Phase 1: Insert test brand profiles
INSERT INTO public.business_profiles (
  user_id,
  business_name,
  account_type,
  brand_category,
  description,
  location,
  website_url,
  sponsorship_budget,
  marketing_objectives,
  is_completed,
  profile_visibility
) VALUES
(
  (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1 OFFSET 0),
  'Sunrise Coffee Co.',
  'brand',
  'Food & Beverage',
  'Premium organic coffee brand focused on sustainability and local partnerships. We believe in supporting local restaurants and creators to build authentic community connections.',
  'Portland, OR',
  'https://sunrisecoffee.example.com',
  50000.00,
  'Increase brand awareness in local restaurant scene, build authentic partnerships with food creators, showcase our sustainability commitment through restaurant collaborations',
  true,
  'public'
),
(
  (SELECT id FROM auth.users ORDER BY created_at DESC LIMIT 1 OFFSET 1),
  'Urban Threads Fashion',
  'brand',
  'Fashion & Lifestyle',
  'Contemporary streetwear brand celebrating local culture and creativity. We partner with restaurants and lifestyle creators to showcase fashion in authentic, everyday settings.',
  'Brooklyn, NY',
  'https://urbanthreads.example.com',
  75000.00,
  'Establish brand presence in lifestyle and dining scenes, collaborate with fashion-forward restaurants, create aspirational yet accessible brand content',
  true,
  'public'
)
ON CONFLICT (user_id) DO NOTHING;

-- Phase 4: Update conversations table for multi-party messaging
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS participant_type TEXT DEFAULT 'general';

-- Add index for campaign conversations
CREATE INDEX IF NOT EXISTS idx_conversations_campaign_id ON public.conversations(campaign_id);

-- Add comment for clarity
COMMENT ON COLUMN public.conversations.campaign_id IS 'Links conversation to a specific campaign for multi-party messaging';
COMMENT ON COLUMN public.conversations.participant_type IS 'Type of conversation: general, brand_restaurant, brand_creator, restaurant_creator, three_way';

-- Update RLS policies to support campaign conversations
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversation_participants
      WHERE conversation_participants.conversation_id = conversations.id
        AND conversation_participants.user_id = auth.uid()
        AND conversation_participants.left_at IS NULL
    )
    OR
    -- Also allow viewing if user is part of the campaign
    (campaign_id IS NOT NULL AND (
      EXISTS (
        SELECT 1 FROM campaigns
        WHERE campaigns.id = conversations.campaign_id
          AND campaigns.user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM campaign_collaborations
        WHERE campaign_collaborations.campaign_id = conversations.campaign_id
          AND campaign_collaborations.creator_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM campaign_sponsorships cs
        JOIN business_profiles bp ON bp.id = cs.brand_id
        WHERE cs.campaign_id = conversations.campaign_id
          AND bp.user_id = auth.uid()
      )
    ))
  );