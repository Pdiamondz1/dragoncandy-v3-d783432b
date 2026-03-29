
-- Create missing beta system tables if they don't exist
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percentage INTEGER NOT NULL DEFAULT 0,
  target_roles TEXT[],
  environment TEXT NOT NULL DEFAULT 'production',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  feature_name TEXT NOT NULL,
  feedback_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  browser_info TEXT,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  component TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  is_optional BOOLEAN NOT NULL DEFAULT false,
  target_roles TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  step_id UUID NOT NULL REFERENCES public.onboarding_steps(id),
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, step_id)
);

-- Enable RLS on all tables
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for feature_flags (public read access)
DROP POLICY IF EXISTS "Feature flags are viewable by everyone" ON public.feature_flags;
CREATE POLICY "Feature flags are viewable by everyone" ON public.feature_flags
  FOR SELECT USING (true);

-- Create RLS policies for beta_feedback (users can manage their own feedback)
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.beta_feedback;
DROP POLICY IF EXISTS "Users can create their own feedback" ON public.beta_feedback;
DROP POLICY IF EXISTS "Users can update their own feedback" ON public.beta_feedback;

CREATE POLICY "Users can view their own feedback" ON public.beta_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own feedback" ON public.beta_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own feedback" ON public.beta_feedback
  FOR UPDATE USING (auth.uid() = user_id);

-- Create RLS policies for onboarding_steps (public read access)
DROP POLICY IF EXISTS "Onboarding steps are viewable by everyone" ON public.onboarding_steps;
CREATE POLICY "Onboarding steps are viewable by everyone" ON public.onboarding_steps
  FOR SELECT USING (true);

-- Create RLS policies for user_onboarding_progress (users can manage their own progress)
DROP POLICY IF EXISTS "Users can view their own progress" ON public.user_onboarding_progress;
DROP POLICY IF EXISTS "Users can create their own progress" ON public.user_onboarding_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON public.user_onboarding_progress;

CREATE POLICY "Users can view their own progress" ON public.user_onboarding_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own progress" ON public.user_onboarding_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" ON public.user_onboarding_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Fix analytics_events RLS to allow unauthenticated users
DROP POLICY IF EXISTS "Analytics events are insertable by anyone" ON public.analytics_events;
CREATE POLICY "Analytics events are insertable by anyone" ON public.analytics_events
  FOR INSERT WITH CHECK (true);

-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('avatars', 'avatars', true),
  ('campaign-assets', 'campaign-assets', true),
  ('file-uploads', 'file-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for public access
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public campaign assets access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload campaign assets" ON storage.objects;
DROP POLICY IF EXISTS "Public file uploads access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;

CREATE POLICY "Public avatar access" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "Public campaign assets access" ON storage.objects
  FOR SELECT USING (bucket_id = 'campaign-assets');

CREATE POLICY "Authenticated users can upload campaign assets" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'campaign-assets' AND auth.uid() IS NOT NULL);

CREATE POLICY "Public file uploads access" ON storage.objects
  FOR SELECT USING (bucket_id = 'file-uploads');

CREATE POLICY "Authenticated users can upload files" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'file-uploads' AND auth.uid() IS NOT NULL);

-- Add updated_at triggers for new tables
DROP TRIGGER IF EXISTS handle_updated_at ON public.feature_flags;
DROP TRIGGER IF EXISTS handle_updated_at ON public.beta_feedback;
DROP TRIGGER IF EXISTS handle_updated_at ON public.onboarding_steps;
DROP TRIGGER IF EXISTS handle_updated_at ON public.user_onboarding_progress;

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.beta_feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add profile slug generation triggers if they don't exist
DROP TRIGGER IF EXISTS auto_generate_profile_slug ON public.business_profiles;
DROP TRIGGER IF EXISTS auto_generate_profile_slug ON public.creator_profiles;

CREATE TRIGGER auto_generate_profile_slug
  BEFORE INSERT ON public.business_profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_profile_slug();

CREATE TRIGGER auto_generate_profile_slug
  BEFORE INSERT ON public.creator_profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_profile_slug();
