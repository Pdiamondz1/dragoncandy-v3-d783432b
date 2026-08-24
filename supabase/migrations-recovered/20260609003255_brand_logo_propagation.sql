-- Recovered 2026-08-24 from production's migration ledger, which was the only
-- place this migration existed. Version 20260609003255 IS recorded on production.
-- This is a record of what ran, not a migration: see README.md in this directory.
-- Everything below the blank line is the ledger's SQL, verbatim.

-- Brand logo propagation: business_profiles.logo_url is the single source of truth;
-- organizations + org_units inherit it by default (distinct valid custom logos preserved).

WITH owner_logo AS (
  SELECT DISTINCT ON (om.org_id) om.org_id, bp.logo_url AS biz_logo
  FROM public.org_members om
  JOIN public.business_profiles bp ON bp.user_id = om.user_id
  WHERE om.role = 'owner' AND bp.logo_url IS NOT NULL AND bp.logo_url <> ''
  ORDER BY om.org_id, bp.updated_at DESC NULLS LAST
),
valid_owner_logo AS (
  SELECT ol.org_id, ol.biz_logo FROM owner_logo ol
  JOIN storage.objects so ON so.bucket_id = 'profile-assets' AND so.name = ol.biz_logo
   AND COALESCE((so.metadata->>'size')::bigint, 0) > 0
)
UPDATE public.organizations o
SET logo_url = v.biz_logo, updated_at = now()
FROM valid_owner_logo v
WHERE o.id = v.org_id AND o.deleted_at IS NULL
  AND (o.logo_url IS NULL OR o.logo_url = '' OR NOT EXISTS (
    SELECT 1 FROM storage.objects so2 WHERE so2.bucket_id = 'profile-assets'
      AND so2.name = o.logo_url AND COALESCE((so2.metadata->>'size')::bigint, 0) > 0));

WITH owner_logo AS (
  SELECT DISTINCT ON (om.org_id) om.org_id, bp.logo_url AS biz_logo
  FROM public.org_members om
  JOIN public.business_profiles bp ON bp.user_id = om.user_id
  WHERE om.role = 'owner' AND bp.logo_url IS NOT NULL AND bp.logo_url <> ''
  ORDER BY om.org_id, bp.updated_at DESC NULLS LAST
),
valid_owner_logo AS (
  SELECT ol.org_id, ol.biz_logo FROM owner_logo ol
  JOIN storage.objects so ON so.bucket_id = 'profile-assets' AND so.name = ol.biz_logo
   AND COALESCE((so.metadata->>'size')::bigint, 0) > 0
)
UPDATE public.org_units ou
SET logo_url = v.biz_logo, updated_at = now()
FROM valid_owner_logo v
WHERE ou.org_id = v.org_id AND ou.deleted_at IS NULL
  AND (ou.logo_url IS NULL OR ou.logo_url = '' OR NOT EXISTS (
    SELECT 1 FROM storage.objects so2 WHERE so2.bucket_id = 'profile-assets'
      AND so2.name = ou.logo_url AND COALESCE((so2.metadata->>'size')::bigint, 0) > 0));

CREATE OR REPLACE FUNCTION public.sync_brand_logo_from_business_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_logo text := NEW.logo_url;
  v_old_logo text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.logo_url ELSE NULL END;
BEGIN
  IF v_new_logo IS NULL OR v_new_logo = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND v_old_logo IS NOT DISTINCT FROM v_new_logo THEN
    RETURN NEW;
  END IF;

  UPDATE public.organizations o
  SET logo_url = v_new_logo, updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = o.id AND om.user_id = NEW.user_id AND om.role = 'owner'
    AND o.deleted_at IS NULL
    AND (o.logo_url IS NULL OR o.logo_url = '' OR o.logo_url IS NOT DISTINCT FROM v_old_logo);

  UPDATE public.org_units ou
  SET logo_url = v_new_logo, updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = ou.org_id AND om.user_id = NEW.user_id AND om.role = 'owner'
    AND ou.deleted_at IS NULL
    AND (ou.logo_url IS NULL OR ou.logo_url = '' OR ou.logo_url IS NOT DISTINCT FROM v_old_logo);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brand_logo ON public.business_profiles;

CREATE TRIGGER trg_sync_brand_logo
AFTER INSERT OR UPDATE OF logo_url ON public.business_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_brand_logo_from_business_profile();
