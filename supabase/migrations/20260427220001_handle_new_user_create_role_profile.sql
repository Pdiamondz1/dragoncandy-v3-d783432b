-- Extend handle_new_user to also create role-specific profile skeleton.
-- For business_client/brand: creates business_profiles row, which chains
-- into trg_auto_create_org to auto-create organization + org_member.
-- For content_creator: creates creator_profiles row.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_name text;
  v_account_type text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'content_creator');
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, v_role::user_role, v_name)
  ON CONFLICT (id) DO NOTHING;

  IF v_role IN ('business_client', 'brand') THEN
    v_account_type := CASE WHEN v_role = 'brand' THEN 'brand' ELSE 'restaurant' END;
    INSERT INTO public.business_profiles (user_id, business_name, account_type)
    VALUES (NEW.id, v_name, v_account_type)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF v_role = 'content_creator' THEN
    INSERT INTO public.creator_profiles (user_id, creator_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
