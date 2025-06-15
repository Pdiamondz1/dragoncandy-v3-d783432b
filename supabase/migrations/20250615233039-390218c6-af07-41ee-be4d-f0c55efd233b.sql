
-- Create enum for industries/categories
CREATE TYPE public.industry_type AS ENUM (
  'technology',
  'fashion',
  'beauty',
  'fitness',
  'food',
  'travel',
  'lifestyle',
  'business',
  'education',
  'entertainment',
  'health',
  'automotive',
  'real_estate',
  'finance',
  'other'
);

-- Create enum for creator skills/services
CREATE TYPE public.creator_skill AS ENUM (
  'video_editing',
  'ugc_creation',
  'illustration',
  'photography',
  'copywriting',
  'social_media_management',
  'graphic_design',
  'animation',
  'influencer_marketing',
  'content_strategy',
  'other'
);

-- Create business_profiles table
CREATE TABLE public.business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  business_name TEXT NOT NULL,
  logo_url TEXT,
  industry industry_type,
  website_url TEXT,
  location TEXT,
  description TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  x_url TEXT,
  other_social_url TEXT,
  sample_content_urls TEXT[], -- Array of URLs for sample content
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Create creator_profiles table
CREATE TABLE public.creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  creator_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  skills creator_skill[],
  portfolio_urls TEXT[], -- Array of URLs for portfolio items
  location TEXT,
  availability TEXT,
  base_rate_per_hour DECIMAL(10,2),
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  x_url TEXT,
  other_social_url TEXT,
  website_url TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on both tables
ALTER TABLE public.business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for business_profiles
CREATE POLICY "Users can view their own business profile"
ON public.business_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own business profile"
ON public.business_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own business profile"
ON public.business_profiles FOR UPDATE
USING (auth.uid() = user_id);

-- RLS policies for creator_profiles
CREATE POLICY "Users can view their own creator profile"
ON public.creator_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own creator profile"
ON public.creator_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own creator profile"
ON public.creator_profiles FOR UPDATE
USING (auth.uid() = user_id);

-- Create storage bucket for profile assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-assets', 'profile-assets', true);

-- Storage policies for profile assets
CREATE POLICY "Users can upload their own profile assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-assets' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view profile assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-assets');

CREATE POLICY "Users can update their own profile assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-assets' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own profile assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-assets' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
