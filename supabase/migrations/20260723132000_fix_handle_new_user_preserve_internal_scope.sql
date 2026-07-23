-- CORRECTIVE: 20260723131000_synthetic_weight_safety_spine.sql rebuilt handle_new_user()
-- from the OLD 20260427220001 body (per the plan's "reproduce verbatim" instruction), which
-- unknowingly REVERTED two later definitions:
--   * 20260610120000_refresh_profile_on_resignup.sql  — ON CONFLICT ... DO UPDATE re-signup refresh
--   * 20260626120000_handle_new_user_internal_scope.sql — the account_scope='internal' guard that
--     keeps AIOS stakeholder invites OUT of the consumer profile tables.
-- Net regression on prod: new internal-only accounts wrongly got consumer profile rows, and
-- re-signups kept stale role/name. This restores the LATEST body (byte-identical to
-- 20260626120000) and re-adds ONLY the synthetic-registration block before RETURN NEW.
-- (Caught by the Codex second review before merge.)

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
  -- Internal-only account (AIOS stakeholder): create no consumer profile rows.
  IF NEW.raw_user_meta_data->>'account_scope' = 'internal' THEN
    RETURN NEW;
  END IF;

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

  -- Synthetic Weight Engine: auto-register bot accounts (email is the source of truth).
  -- Synthetic bots are ordinary consumer accounts (never account_scope='internal'), so they
  -- reach this point via the consumer path above.
  IF NEW.email LIKE '%@synthetic.dragoncandy.test' THEN
    INSERT INTO public.synthetic_users (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
