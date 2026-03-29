
-- Add enhanced fields to business_profiles table
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS company_size TEXT;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS founded_year INTEGER;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS employee_count_range TEXT;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS budget_range TEXT;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS preferred_collaboration_style TEXT;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private'));
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS profile_slug TEXT UNIQUE;

-- Add enhanced fields to creator_profiles table
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS languages_spoken TEXT[];
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS response_time TEXT;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS min_project_budget DECIMAL(10,2);
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS max_projects_per_month INTEGER;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS preferred_project_duration TEXT;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS collaboration_preferences TEXT;
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private'));
ALTER TABLE public.creator_profiles ADD COLUMN IF NOT EXISTS profile_slug TEXT UNIQUE;

-- Create profile views table for tracking profile visits
CREATE TABLE IF NOT EXISTS public.profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('business', 'creator')),
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);

-- Enable RLS on profile_views
ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Create policies for profile_views
CREATE POLICY "Profile owners can view their profile views"
ON public.profile_views FOR SELECT
USING (
  (profile_type = 'business' AND profile_id IN (
    SELECT id FROM public.business_profiles WHERE user_id = auth.uid()
  )) OR
  (profile_type = 'creator' AND profile_id IN (
    SELECT id FROM public.creator_profiles WHERE user_id = auth.uid()
  ))
);

CREATE POLICY "Anyone can insert profile views"
ON public.profile_views FOR INSERT
WITH CHECK (true);

-- Add public read policies for enhanced profiles
CREATE POLICY "Public can view public business profiles"
ON public.business_profiles FOR SELECT
USING (profile_visibility = 'public' OR auth.uid() = user_id);

CREATE POLICY "Public can view public creator profiles"
ON public.creator_profiles FOR SELECT
USING (profile_visibility = 'public' OR auth.uid() = user_id);

-- Create function to generate unique profile slugs
CREATE OR REPLACE FUNCTION public.generate_profile_slug(name TEXT, profile_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
  slug_exists BOOLEAN;
BEGIN
  -- Generate base slug from name
  base_slug := lower(regexp_replace(trim(name), '[^a-zA-Z0-9\s]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := substring(base_slug, 1, 50);
  
  final_slug := base_slug;
  
  -- Check if slug exists and increment if needed
  LOOP
    IF profile_type = 'business' THEN
      SELECT EXISTS(SELECT 1 FROM public.business_profiles WHERE profile_slug = final_slug) INTO slug_exists;
    ELSE
      SELECT EXISTS(SELECT 1 FROM public.creator_profiles WHERE profile_slug = final_slug) INTO slug_exists;
    END IF;
    
    IF NOT slug_exists THEN
      EXIT;
    END IF;
    
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Create function to auto-generate profile slugs
CREATE OR REPLACE FUNCTION public.auto_generate_profile_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'business_profiles' THEN
    IF NEW.profile_slug IS NULL THEN
      NEW.profile_slug := public.generate_profile_slug(NEW.business_name, 'business');
    END IF;
  ELSIF TG_TABLE_NAME = 'creator_profiles' THEN
    IF NEW.profile_slug IS NULL THEN
      NEW.profile_slug := public.generate_profile_slug(NEW.creator_name, 'creator');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers for auto-generating profile slugs
DROP TRIGGER IF EXISTS auto_generate_business_profile_slug ON public.business_profiles;
CREATE TRIGGER auto_generate_business_profile_slug
  BEFORE INSERT OR UPDATE ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_profile_slug();

DROP TRIGGER IF EXISTS auto_generate_creator_profile_slug ON public.creator_profiles;
CREATE TRIGGER auto_generate_creator_profile_slug
  BEFORE INSERT OR UPDATE ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_profile_slug();
