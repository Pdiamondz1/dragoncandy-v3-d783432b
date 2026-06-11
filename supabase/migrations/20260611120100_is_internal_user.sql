-- AIOS PR 1: internal-surface access helper.
-- True for platform admins (founders) and stakeholders (view-only tier).
-- Used by InternalRoute-backed RLS policies and the aios_* stats RPC gates.
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'stakeholder'::public.app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.is_internal_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_internal_user() TO authenticated, service_role;
