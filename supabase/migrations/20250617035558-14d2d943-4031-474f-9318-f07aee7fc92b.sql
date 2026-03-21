
-- Update user role from business_client to content_creator
UPDATE public.profiles 
SET role = 'content_creator'
WHERE email = 'damesopoint@gmail.com';

-- Create a creator profile for the user (assuming the user exists)
INSERT INTO public.creator_profiles (
  user_id,
  creator_name,
  bio,
  skills,
  location,
  availability,
  is_completed
)
SELECT 
  id as user_id,
  'Content Creator' as creator_name,
  'Experienced content creator looking for exciting projects' as bio,
  ARRAY['ugc_creation', 'social_media_management']::creator_skill[] as skills,
  'Remote' as location,
  'Available' as availability,
  true as is_completed
FROM public.profiles 
WHERE email = 'damesopoint@gmail.com'
AND NOT EXISTS (
  SELECT 1 FROM public.creator_profiles cp WHERE cp.user_id = profiles.id
);

-- Optional: Remove the business profile if it exists and you don't need it
-- DELETE FROM public.business_profiles 
-- WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'damesopoint@gmail.com');
