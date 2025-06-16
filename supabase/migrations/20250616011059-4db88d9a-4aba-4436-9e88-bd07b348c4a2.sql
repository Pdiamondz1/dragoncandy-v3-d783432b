
-- Create enum types for campaign and application statuses
CREATE TYPE public.campaign_status AS ENUM ('draft', 'published', 'active', 'completed', 'cancelled');
CREATE TYPE public.application_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE public.collaboration_status AS ENUM ('active', 'completed', 'cancelled');

-- Create campaigns table
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  goals TEXT,
  deliverables TEXT[],
  platforms TEXT[],
  budget_min NUMERIC,
  budget_max NUMERIC,
  deadline DATE,
  status campaign_status NOT NULL DEFAULT 'draft',
  style TEXT,
  tone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create campaign_applications table
CREATE TABLE public.campaign_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intro_message TEXT,
  proposed_timeline TEXT,
  proposed_rate NUMERIC,
  status application_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

-- Create campaign_collaborations table
CREATE TABLE public.campaign_collaborations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.campaign_applications(id) ON DELETE SET NULL,
  contract_details JSONB,
  milestones JSONB,
  deliverables_status JSONB,
  status collaboration_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, creator_id)
);

-- Create messages table for campaign communication
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Create storage buckets for campaign assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('campaign-assets', 'campaign-assets', true, 52428800, ARRAY['image/*', 'video/*', 'application/pdf']),
  ('campaign-deliverables', 'campaign-deliverables', true, 104857600, ARRAY['image/*', 'video/*', 'application/pdf']);

-- Enable Row Level Security on all tables
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns table
CREATE POLICY "Users can view published campaigns or their own campaigns" 
  ON public.campaigns 
  FOR SELECT 
  USING (
    status = 'published' OR 
    user_id = auth.uid()
  );

CREATE POLICY "Business clients can create campaigns" 
  ON public.campaigns 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'business_client'
    )
  );

CREATE POLICY "Campaign owners can update their campaigns" 
  ON public.campaigns 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Campaign owners can delete their campaigns" 
  ON public.campaigns 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- RLS Policies for campaign_applications table
CREATE POLICY "Users can view applications for their campaigns or their own applications" 
  ON public.campaign_applications 
  FOR SELECT 
  USING (
    creator_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Content creators can create applications" 
  ON public.campaign_applications 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = creator_id AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'content_creator'
    )
  );

CREATE POLICY "Applicants can update their own applications" 
  ON public.campaign_applications 
  FOR UPDATE 
  USING (
    auth.uid() = creator_id OR
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for campaign_collaborations table
CREATE POLICY "Users can view collaborations they are part of" 
  ON public.campaign_collaborations 
  FOR SELECT 
  USING (
    creator_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Campaign owners can create collaborations" 
  ON public.campaign_collaborations 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Collaboration participants can update collaborations" 
  ON public.campaign_collaborations 
  FOR UPDATE 
  USING (
    creator_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.campaigns 
      WHERE id = campaign_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for messages table
CREATE POLICY "Users can view messages they sent or received" 
  ON public.messages 
  FOR SELECT 
  USING (
    sender_id = auth.uid() OR 
    recipient_id = auth.uid()
  );

CREATE POLICY "Users can send messages in campaigns they participate in" 
  ON public.messages 
  FOR INSERT 
  WITH CHECK (
    auth.uid() = sender_id AND
    (
      EXISTS (
        SELECT 1 FROM public.campaigns 
        WHERE id = campaign_id AND user_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 FROM public.campaign_collaborations 
        WHERE campaign_id = messages.campaign_id AND creator_id = auth.uid()
      )
    )
  );

-- Storage policies for campaign assets bucket
CREATE POLICY "Users can view campaign assets" 
  ON storage.objects 
  FOR SELECT 
  USING (bucket_id = 'campaign-assets');

CREATE POLICY "Authenticated users can upload campaign assets" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'campaign-assets' AND 
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update their own campaign assets" 
  ON storage.objects 
  FOR UPDATE 
  USING (
    bucket_id = 'campaign-assets' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own campaign assets" 
  ON storage.objects 
  FOR DELETE 
  USING (
    bucket_id = 'campaign-assets' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for campaign deliverables bucket
CREATE POLICY "Campaign participants can view deliverables" 
  ON storage.objects 
  FOR SELECT 
  USING (
    bucket_id = 'campaign-deliverables' AND
    (
      auth.uid()::text = (storage.foldername(name))[1] OR
      EXISTS (
        SELECT 1 FROM public.campaign_collaborations cc
        JOIN public.campaigns c ON cc.campaign_id = c.id
        WHERE c.user_id = auth.uid() AND cc.creator_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Creators can upload deliverables" 
  ON storage.objects 
  FOR INSERT 
  WITH CHECK (
    bucket_id = 'campaign-deliverables' AND 
    auth.uid()::text = (storage.foldername(name))[1] AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'content_creator'
    )
  );

CREATE POLICY "Creators can update their own deliverables" 
  ON storage.objects 
  FOR UPDATE 
  USING (
    bucket_id = 'campaign-deliverables' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Creators can delete their own deliverables" 
  ON storage.objects 
  FOR DELETE 
  USING (
    bucket_id = 'campaign-deliverables' AND 
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Create indexes for better performance
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);
CREATE INDEX idx_campaigns_created_at ON public.campaigns(created_at DESC);
CREATE INDEX idx_campaign_applications_campaign_id ON public.campaign_applications(campaign_id);
CREATE INDEX idx_campaign_applications_creator_id ON public.campaign_applications(creator_id);
CREATE INDEX idx_campaign_collaborations_campaign_id ON public.campaign_collaborations(campaign_id);
CREATE INDEX idx_campaign_collaborations_creator_id ON public.campaign_collaborations(creator_id);
CREATE INDEX idx_messages_campaign_id ON public.messages(campaign_id);
CREATE INDEX idx_messages_sender_recipient ON public.messages(sender_id, recipient_id);

-- Add updated_at trigger for campaigns
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER campaign_applications_updated_at
  BEFORE UPDATE ON public.campaign_applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER campaign_collaborations_updated_at
  BEFORE UPDATE ON public.campaign_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
