-- When an email/user id is re-used after a partial account deletion, leftover
-- profile rows previously survived signup untouched (ON CONFLICT DO NOTHING),
-- so the new account kept the old display name and role everywhere.
-- Refresh leftover rows with the latest signup's values instead.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_name text;
  v_account_type text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'content_creator');
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));

  -- Create base profile; refresh stale leftovers on re-signup
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (NEW.id, NEW.email, v_role::user_role, v_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name;

  -- Create role-specific profile skeleton; refresh stale leftovers on re-signup
  IF v_role IN ('business_client', 'brand') THEN
    v_account_type := CASE WHEN v_role = 'brand' THEN 'brand' ELSE 'restaurant' END;
    INSERT INTO public.business_profiles (user_id, business_name, account_type)
    VALUES (NEW.id, v_name, v_account_type)
    ON CONFLICT (user_id) DO UPDATE
      SET business_name = EXCLUDED.business_name,
          account_type = EXCLUDED.account_type;
  ELSIF v_role = 'content_creator' THEN
    INSERT INTO public.creator_profiles (user_id, creator_name)
    VALUES (NEW.id, v_name)
    ON CONFLICT (user_id) DO UPDATE
      SET creator_name = EXCLUDED.creator_name;
  END IF;

  RETURN NEW;
END;
$function$;
