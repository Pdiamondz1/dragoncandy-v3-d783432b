-- Insert test brand profiles for testing brand sponsorship flow
-- These brands will be able to browse campaigns and submit sponsorship proposals

-- First brand: Coffee Brand
INSERT INTO public.business_profiles (
  user_id,
  business_name,
  description,
  account_type,
  brand_category,
  sponsorship_budget,
  marketing_objectives,
  location,
  website_url,
  instagram_url,
  logo_url,
  is_completed,
  profile_visibility
)
SELECT 
  id,
  'Sunrise Coffee Co.',
  'Premium artisan coffee brand focused on sustainable sourcing and community engagement. We partner with local creators to showcase authentic coffee culture.',
  'brand',
  'Food & Beverage',
  25000.00,
  'Increase brand awareness among millennials and Gen Z, drive foot traffic to our local cafes, and build authentic community connections through creator partnerships.',
  'San Francisco, CA',
  'https://sunrisecoffee.example.com',
  'https://instagram.com/sunrisecoffee',
  'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/avatars/sunrise-coffee-logo.png',
  true,
  'public'
FROM auth.users
WHERE email = 'brand1@example.com'
LIMIT 1;

-- Second brand: Fashion Brand
INSERT INTO public.business_profiles (
  user_id,
  business_name,
  description,
  account_type,
  brand_category,
  sponsorship_budget,
  marketing_objectives,
  location,
  website_url,
  instagram_url,
  tiktok_url,
  logo_url,
  is_completed,
  profile_visibility
)
SELECT 
  id,
  'Urban Threads Fashion',
  'Contemporary streetwear brand celebrating diversity and self-expression. We collaborate with content creators to showcase real people living their authentic style.',
  'brand',
  'Fashion & Lifestyle',
  40000.00,
  'Build brand awareness in key urban markets, showcase our seasonal collections through authentic creator content, and establish Urban Threads as a lifestyle movement.',
  'Los Angeles, CA',
  'https://urbanthreads.example.com',
  'https://instagram.com/urbanthreads',
  'https://tiktok.com/@urbanthreads',
  'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/avatars/urban-threads-logo.png',
  true,
  'public'
FROM auth.users
WHERE email = 'brand2@example.com'
LIMIT 1;

-- Note: If these email users don't exist yet, they need to be created first through the auth flow