-- Brand logo propagation
--
-- Problem: a business's logo is stored in three independent places:
--   * business_profiles.logo_url  (mirrored to profiles.avatar_url) -- canonical "profile picture",
--                                  read by every creator-facing surface
--   * organizations.logo_url       -- read by the location switcher "All Locations" row
--   * org_units.logo_url           -- read by the location switcher per-location rows + DragonShare RPC
--
-- Updating the profile picture (Business Info tab) only writes business_profiles + profiles,
-- leaving organizations.logo_url and org_units.logo_url stale (in some cases pointing at a
-- dead 0-byte storage object) -> the location switcher and org-backed surfaces show the
-- initial-letter fallback ("U") instead of the photo.
--
-- Fix: treat business_profiles.logo_url as the single source of truth for the brand/profile
-- picture. Organizations and locations INHERIT it by default; a location keeps its own logo
-- only when it has explicitly set a distinct, valid one.
--   * Part A: one-time backfill of existing empty/broken org + unit logos from the owner's logo.
--   * Part B: AFTER INSERT OR UPDATE trigger that keeps inheriting org/units in sync going forward.
--
-- Note: this is a pure-SQL data trigger (no pg_net / no app.settings GUCs), so it is NOT subject
-- to the silently-dead trigger issue affecting the pg_net-from-trigger nudge path.

-- ──────────────────────────────────────────────────────────────────────────
-- Part A — one-time backfill
-- ──────────────────────────────────────────────────────────────────────────

-- One valid business logo per org (most recently updated wins), proven to exist & be non-empty.
WITH owner_logo AS (
  SELECT DISTINCT ON (om.org_id)
    om.org_id,
    bp.logo_url AS biz_logo
  FROM public.org_members om
  JOIN public.business_profiles bp ON bp.user_id = om.user_id
  WHERE om.role = 'owner'
    AND bp.logo_url IS NOT NULL
    AND bp.logo_url <> ''
  ORDER BY om.org_id, bp.updated_at DESC NULLS LAST
),
valid_owner_logo AS (
  SELECT ol.org_id, ol.biz_logo
  FROM owner_logo ol
  JOIN storage.objects so
    ON so.bucket_id = 'profile-assets'
   AND so.name = ol.biz_logo
   AND COALESCE((so.metadata->>'size')::bigint, 0) > 0
)
UPDATE public.organizations o
SET logo_url = v.biz_logo,
    updated_at = now()
FROM valid_owner_logo v
WHERE o.id = v.org_id
  AND o.deleted_at IS NULL
  -- only when the org logo is empty or references a broken (missing / 0-byte) object
  AND (
    o.logo_url IS NULL
    OR o.logo_url = ''
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects so2
      WHERE so2.bucket_id = 'profile-assets'
        AND so2.name = o.logo_url
        AND COALESCE((so2.metadata->>'size')::bigint, 0) > 0
    )
  );

WITH owner_logo AS (
  SELECT DISTINCT ON (om.org_id)
    om.org_id,
    bp.logo_url AS biz_logo
  FROM public.org_members om
  JOIN public.business_profiles bp ON bp.user_id = om.user_id
  WHERE om.role = 'owner'
    AND bp.logo_url IS NOT NULL
    AND bp.logo_url <> ''
  ORDER BY om.org_id, bp.updated_at DESC NULLS LAST
),
valid_owner_logo AS (
  SELECT ol.org_id, ol.biz_logo
  FROM owner_logo ol
  JOIN storage.objects so
    ON so.bucket_id = 'profile-assets'
   AND so.name = ol.biz_logo
   AND COALESCE((so.metadata->>'size')::bigint, 0) > 0
)
UPDATE public.org_units ou
SET logo_url = v.biz_logo,
    updated_at = now()
FROM valid_owner_logo v
WHERE ou.org_id = v.org_id
  AND ou.deleted_at IS NULL
  -- skip units that already have a valid, distinct custom logo; only fix empty/broken ones
  AND (
    ou.logo_url IS NULL
    OR ou.logo_url = ''
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects so2
      WHERE so2.bucket_id = 'profile-assets'
        AND so2.name = ou.logo_url
        AND COALESCE((so2.metadata->>'size')::bigint, 0) > 0
    )
  );

-- ──────────────────────────────────────────────────────────────────────────
-- Part B — keep-in-sync trigger
-- ──────────────────────────────────────────────────────────────────────────

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
  -- Nothing to propagate without a real logo value.
  IF v_new_logo IS NULL OR v_new_logo = '' THEN
    RETURN NEW;
  END IF;

  -- No-op if the logo did not actually change (UPDATE of other columns).
  IF TG_OP = 'UPDATE' AND v_old_logo IS NOT DISTINCT FROM v_new_logo THEN
    RETURN NEW;
  END IF;

  -- Propagate to the owner's organization(s).
  UPDATE public.organizations o
  SET logo_url = v_new_logo,
      updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = o.id
    AND om.user_id = NEW.user_id
    AND om.role = 'owner'
    AND o.deleted_at IS NULL
    -- inherit when the org logo is empty or was tracking the previous business logo
    AND (
      o.logo_url IS NULL
      OR o.logo_url = ''
      OR o.logo_url IS NOT DISTINCT FROM v_old_logo
    );

  -- Propagate to inheriting locations; leave distinct custom location logos untouched.
  UPDATE public.org_units ou
  SET logo_url = v_new_logo,
      updated_at = now()
  FROM public.org_members om
  WHERE om.org_id = ou.org_id
    AND om.user_id = NEW.user_id
    AND om.role = 'owner'
    AND ou.deleted_at IS NULL
    AND (
      ou.logo_url IS NULL
      OR ou.logo_url = ''
      OR ou.logo_url IS NOT DISTINCT FROM v_old_logo
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brand_logo ON public.business_profiles;

CREATE TRIGGER trg_sync_brand_logo
AFTER INSERT OR UPDATE OF logo_url ON public.business_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_brand_logo_from_business_profile();
