
-- Update the handle_new_user function to read role from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_role public.user_role;
BEGIN
  -- Extract role from user metadata, default to 'business_client' if not provided
  user_role := COALESCE(
    (NEW.raw_user_meta_data ->> 'role')::public.user_role,
    'business_client'::public.user_role
  );
  
  INSERT INTO public.profiles (id, email, role)
    VALUES (NEW.id, NEW.email, user_role)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
