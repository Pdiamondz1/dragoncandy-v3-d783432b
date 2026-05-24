
-- 1. Platform admin role infrastructure
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_self_select" ON public.user_roles;
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- 2. Block creators from self-verifying DragonShare posts
CREATE OR REPLACE FUNCTION public.trg_ds_posts_block_self_verify()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.boost_status IS DISTINCT FROM OLD.boost_status
     OR NEW.verification_method IS DISTINCT FROM OLD.verification_method
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.donny_recommended_tier IS DISTINCT FROM OLD.donny_recommended_tier
     OR NEW.donny_score IS DISTINCT FROM OLD.donny_score
     OR NEW.donny_reach_estimate IS DISTINCT FROM OLD.donny_reach_estimate
     OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
     OR NEW.target_org_id IS DISTINCT FROM OLD.target_org_id
  THEN
    RAISE EXCEPTION 'Only platform admins can modify verification or boost status fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ds_posts_block_self_verify ON public.dragonshare_posts;
CREATE TRIGGER ds_posts_block_self_verify
  BEFORE UPDATE ON public.dragonshare_posts
  FOR EACH ROW EXECUTE FUNCTION public.trg_ds_posts_block_self_verify();

-- 3. Admin read access to the verification queue and ledger
DROP POLICY IF EXISTS "ds_posts_admin_select" ON public.dragonshare_posts;
CREATE POLICY "ds_posts_admin_select" ON public.dragonshare_posts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ds_boosts_admin_select" ON public.dragonshare_boosts;
CREATE POLICY "ds_boosts_admin_select" ON public.dragonshare_boosts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "ds_payouts_admin_select" ON public.dragonshare_payouts;
CREATE POLICY "ds_payouts_admin_select" ON public.dragonshare_payouts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Admin-only verification RPC
CREATE OR REPLACE FUNCTION public.verify_dragonshare_post(
  p_post_id uuid,
  p_action text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden: platform admin role required';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.dragonshare_posts
    SET status = 'verified',
        boost_status = 'available',
        verification_method = 'manual',
        verified_at = now(),
        verified_by = auth.uid()
    WHERE id = p_post_id;
  ELSE
    UPDATE public.dragonshare_posts
    SET status = 'rejected',
        rejection_reason = COALESCE(p_rejection_reason, 'Does not meet verification criteria')
    WHERE id = p_post_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_dragonshare_post(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_dragonshare_post(uuid, text, text) TO authenticated;
