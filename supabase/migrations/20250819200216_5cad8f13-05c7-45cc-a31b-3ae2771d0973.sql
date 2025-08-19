-- Add allow_portfolio_in_feed column to creator_profiles table
ALTER TABLE public.creator_profiles 
ADD COLUMN allow_portfolio_in_feed boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.creator_profiles.allow_portfolio_in_feed IS 'Whether creator allows their portfolio content to be displayed in the public DragonFeed showcase on the landing page';