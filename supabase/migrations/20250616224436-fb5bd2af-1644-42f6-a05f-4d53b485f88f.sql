
-- Create table for campaign creator invitations
CREATE TABLE public.campaign_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invitation_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

-- Create table for storing AI matching results
CREATE TABLE public.campaign_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_score NUMERIC(3,2) NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  match_reasons JSONB,
  ai_analysis TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

-- Enable RLS on new tables
ALTER TABLE public.campaign_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_matches ENABLE ROW LEVEL SECURITY;

-- RLS policies for campaign_invitations
CREATE POLICY "Users can view invitations for their campaigns or themselves"
  ON public.campaign_invitations
  FOR SELECT
  USING (
    invited_by = auth.uid() OR
    creator_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Campaign owners can create invitations"
  ON public.campaign_invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by AND
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Creators can update invitations sent to them"
  ON public.campaign_invitations
  FOR UPDATE
  USING (auth.uid() = creator_id);

-- RLS policies for campaign_matches
CREATE POLICY "Users can view matches for their campaigns"
  ON public.campaign_matches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Campaign owners can create/update matches"
  ON public.campaign_matches
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Campaign owners can update matches"
  ON public.campaign_matches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

-- Add indexes for better performance
CREATE INDEX idx_campaign_invitations_campaign_id ON public.campaign_invitations(campaign_id);
CREATE INDEX idx_campaign_invitations_creator_id ON public.campaign_invitations(creator_id);
CREATE INDEX idx_campaign_matches_campaign_id ON public.campaign_matches(campaign_id);
CREATE INDEX idx_campaign_matches_score ON public.campaign_matches(match_score DESC);

-- Add updated_at trigger for campaign_invitations
CREATE TRIGGER campaign_invitations_updated_at
  BEFORE UPDATE ON public.campaign_invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create a function to get creator profiles with completed status
CREATE OR REPLACE FUNCTION get_available_creators(
  campaign_platforms TEXT[] DEFAULT NULL,
  required_skills creator_skill[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  creator_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  skills creator_skill[],
  portfolio_urls TEXT[],
  location TEXT,
  availability TEXT,
  base_rate_per_hour NUMERIC,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  x_url TEXT,
  other_social_url TEXT,
  website_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id,
    cp.user_id,
    cp.creator_name,
    cp.avatar_url,
    cp.bio,
    cp.skills,
    cp.portfolio_urls,
    cp.location,
    cp.availability,
    cp.base_rate_per_hour,
    cp.instagram_url,
    cp.tiktok_url,
    cp.youtube_url,
    cp.facebook_url,
    cp.linkedin_url,
    cp.x_url,
    cp.other_social_url,
    cp.website_url
  FROM public.creator_profiles cp
  WHERE cp.is_completed = true
    AND (campaign_platforms IS NULL OR 
         (campaign_platforms && ARRAY['Instagram']::TEXT[] AND cp.instagram_url IS NOT NULL) OR
         (campaign_platforms && ARRAY['TikTok']::TEXT[] AND cp.tiktok_url IS NOT NULL) OR
         (campaign_platforms && ARRAY['YouTube']::TEXT[] AND cp.youtube_url IS NOT NULL) OR
         (campaign_platforms && ARRAY['Facebook']::TEXT[] AND cp.facebook_url IS NOT NULL) OR
         (campaign_platforms && ARRAY['LinkedIn']::TEXT[] AND cp.linkedin_url IS NOT NULL) OR
         (campaign_platforms && ARRAY['X (Twitter)']::TEXT[] AND cp.x_url IS NOT NULL))
    AND (required_skills IS NULL OR cp.skills && required_skills);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
