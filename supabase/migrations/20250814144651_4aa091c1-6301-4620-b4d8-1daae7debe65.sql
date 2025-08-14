-- Update profiles to populate full_name from email when null
UPDATE public.profiles 
SET full_name = CASE 
  WHEN full_name IS NULL OR full_name = '' THEN 
    INITCAP(REPLACE(SPLIT_PART(email, '@', 1), '.', ' '))
  ELSE full_name 
END
WHERE full_name IS NULL OR full_name = '';

-- Create function to get user display name with fallback
CREATE OR REPLACE FUNCTION public.get_user_display_name(user_uuid uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  display_name text;
BEGIN
  SELECT COALESCE(
    NULLIF(p.full_name, ''),
    INITCAP(REPLACE(SPLIT_PART(p.email, '@', 1), '.', ' ')),
    'Unknown User'
  ) INTO display_name
  FROM public.profiles p
  WHERE p.id = user_uuid;
  
  RETURN COALESCE(display_name, 'Unknown User');
END;
$function$;