-- AIOS stakeholder invites: internal-only accounts.
--
-- Internal stakeholders (provisioned via the manage-internal-users edge function
-- with raw_user_meta_data.account_scope = 'internal') must NOT get a consumer
-- profile of any kind: no profiles row, no business_profiles/creator_profiles.
-- That keeps them out of the consumer app entirely (DashboardRedirect bounces a
-- null-profile user to /auth) and out of the creator marketplace, while their
-- AIOS access is granted purely through user_roles (admin/stakeholder).
--
-- We add a guard clause at the top of handle_new_user(); the rest of the body is
-- byte-identical to 20260427220001_handle_new_user_create_role_profile.sql.
-- Additive + backward-compatible: ordinary signups never set account_scope, so
-- they fall through to the unchanged consumer-profile creation path.
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
  -- Internal-only account (AIOS stakeholder): create no consumer profile rows.
  IF NEW.raw_user_meta_data->>'account_scope' = 'internal' THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
